/**
 * Timeline.js: the edit, as time.
 *
 * ── LANES, NOT ONE MIXED TRACK ───────────────────────────────────────────────
 * A creator looks for "the zooms" or "the blurs", never for "everything at
 * fourteen seconds". So each kind of thing gets its own lane, always in the
 * same order, and an empty lane stays visible rather than collapsing — a demo
 * with no blur should show that it has no blur.
 *
 * ── IT IS DRAWN IN OUTPUT TIME ───────────────────────────────────────────────
 * The ruler is the finished video, not the recording. That is the only honest
 * way to show it: a zoom two thirds of the way through the export should be two
 * thirds of the way along the ruler, whatever was cut before it. Everything
 * stored is in RECORDING time, so each chip is mapped through the cuts
 * (placedSpans in model.js) and one zoom straddling a cut is drawn as the two
 * pieces it will actually play as.
 *
 * Cuts themselves are drawn as hatched gaps rather than as blocks on a lane,
 * because they are time that will not exist. Showing removed seconds as an
 * object on a track suggests it is something that plays.
 *
 * ── DRAGGING EDITS RECORDING TIME ────────────────────────────────────────────
 * A chip dragged along the ruler is moving through output time, and what gets
 * written is the recording time it maps back to. Without that, dragging a zoom
 * across a cut would silently change its length by however long the cut was.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { layout, placedSpans, activeZooms, toSource, mergedCuts, clamp, fmtTime } from "./model";
import { Icon } from "./ui";

const LANES = [
  { key: "zooms", label: "Zoom", color: "#918DFF", icon: "zoom" },
  { key: "blurs", label: "Blur", color: "#FF9482", icon: "blur" },
  { key: "cues", label: "Captions", color: "#F09BE5", icon: "caption" },
];

/** Smallest drag that counts, so a click on a chip is not read as a nudge. */
const SLOP = 3;

export default function Timeline({
  tl,
  time,
  onSeek,
  selection,
  onSelect,
  onChange,
  onAddCut,
  onRemoveCut,
  height = 30,
}) {
  const railRef = useRef(null);
  const [drag, setDrag] = useState(null);

  const lay = useMemo(() => layout(tl), [tl]);
  const total = Math.max(0.1, lay.duration);
  const cuts = useMemo(() => mergedCuts(tl), [tl]);

  const items = useMemo(() => {
    const out = {};
    for (const lane of LANES) {
      const source = lane.key === "zooms" ? activeZooms(tl) : tl[lane.key] || [];
      out[lane.key] = placedSpans(source, lay, { min: 0.03 });
    }
    return out;
  }, [tl, lay]);

  /** Where along the rail, as a fraction, a pointer event landed. */
  const fractionAt = useCallback((clientX) => {
    const r = railRef.current?.getBoundingClientRect();
    if (!r?.width) return 0;
    return clamp((clientX - r.left) / r.width, 0, 1);
  }, []);

  /* ── Scrubbing ────────────────────────────────────────────────────────── */
  const scrub = useCallback(
    (e) => {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      onSeek(fractionAt(e.clientX) * total);
    },
    [fractionAt, onSeek, total]
  );

  const scrubMove = useCallback(
    (e) => {
      if (e.buttons !== 1) return;
      onSeek(fractionAt(e.clientX) * total);
    },
    [fractionAt, onSeek, total]
  );

  /* ── Moving and resizing a chip ───────────────────────────────────────── */
  const beginDrag = useCallback(
    (lane, item, mode) => (e) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      onSelect({ kind: SINGULAR[lane], id: item.id });
      setDrag({ lane, id: item.id, mode, x0: e.clientX, moved: false, src: { start: item.src_start, end: item.src_end } });
    },
    [onSelect]
  );

  const moveDrag = useCallback(
    (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x0;
      if (!drag.moved && Math.abs(dx) < SLOP) return;
      if (!drag.moved) setDrag((d) => ({ ...d, moved: true }));

      const r = railRef.current?.getBoundingClientRect();
      if (!r?.width) return;

      // Both edges are converted through the cuts, so a chip pushed across a
      // removed stretch keeps the length it looks like it has on screen.
      const shift = (dx / r.width) * total;
      const from = drag.src;
      const kind = SINGULAR[drag.lane];
      const list = drag.lane === "zooms" ? tl.zooms : tl[drag.lane];
      const item = list?.find((x) => x.id === drag.id);
      if (!item) return;

      // The chip's own recording-time span, not the drawn piece's: a zoom split
      // across a cut is one object and must move as one.
      const len = item.end - item.start;
      let start = item.start;
      let end = item.end;

      if (drag.mode === "move") {
        const anchor = toSource(clamp(outOf(from.start, lay) + shift, 0, total), lay);
        start = clamp(anchor - (from.start - item.start), 0, (tl.duration || 0) - len);
        end = start + len;
      } else if (drag.mode === "start") {
        start = clamp(toSource(clamp(outOf(from.start, lay) + shift, 0, total), lay), 0, item.end - 0.15);
      } else {
        end = clamp(toSource(clamp(outOf(from.end, lay) + shift, 0, total), lay), item.start + 0.15, tl.duration || item.end);
      }

      onChange({ kind, id: drag.id, patch: { start: round3(start), end: round3(end) } });
    },
    [drag, lay, onChange, tl, total]
  );

  const endDrag = useCallback(() => setDrag(null), []);

  /* ── The ruler's tick marks ───────────────────────────────────────────── */
  const ticks = useMemo(() => {
    const step = total <= 20 ? 2 : total <= 60 ? 5 : total <= 180 ? 15 : total <= 600 ? 60 : 120;
    const out = [];
    for (let t = 0; t <= total; t += step) out.push(t);
    return out;
  }, [total]);

  const playPct = (time / total) * 100;

  return (
    <div className="st-timeline" style={{ userSelect: "none" }}>
      {/* ── Ruler ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 7 }}>
        <div style={{ width: LABEL_W, flexShrink: 0 }} />
        <div
          style={{ position: "relative", flex: 1, height: 18, cursor: "pointer" }}
          onPointerDown={scrub}
          onPointerMove={scrubMove}
        >
          {ticks.map((t) => (
            <span
              key={t}
              style={{
                position: "absolute",
                left: `${(t / total) * 100}%`,
                fontSize: 9.5,
                fontWeight: 650,
                color: "var(--ink-mute)",
                transform: t === 0 ? "none" : "translateX(-50%)",
                fontVariantNumeric: "tabular-nums",
                pointerEvents: "none",
              }}
            >
              {fmtTime(t)}
            </span>
          ))}
        </div>
      </div>

      {/* ── Lanes ──────────────────────────────────────────────────────── */}
      <div
        style={{ position: "relative" }}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {LANES.map((lane) => (
          <div key={lane.key} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
            <div
              style={{
                width: LABEL_W, flexShrink: 0, display: "flex", alignItems: "center", gap: 6,
                fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
                color: items[lane.key].length ? "var(--ink-body)" : "var(--ink-mute)",
                opacity: items[lane.key].length ? 1 : 0.55,
              }}
            >
              <span style={{ color: items[lane.key].length ? lane.color : "inherit" }}>
                <Icon name={lane.icon} size={12} />
              </span>
              {lane.label}
            </div>

            <div
              className="st-lane"
              ref={lane.key === "zooms" ? railRef : undefined}
              style={{ flex: 1, height }}
              onPointerDown={(e) => {
                if (e.target !== e.currentTarget) return;
                onSeek(fractionAt(e.clientX) * total);
              }}
            >
              {items[lane.key].map((item, i) => {
                const left = (item.start / total) * 100;
                const width = Math.max(0.6, ((item.end - item.start) / total) * 100);
                const on = selection?.kind === SINGULAR[lane.key] && selection.id === item.id;
                return (
                  <div
                    key={`${item.id}_${i}`}
                    className={`st-chip${on ? " is-on" : ""}`}
                    title={chipTitle(lane.key, item)}
                    onPointerDown={beginDrag(lane.key, item, "move")}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!drag?.moved) {
                        onSelect({ kind: SINGULAR[lane.key], id: item.id });
                        onSeek(item.start + 0.05);
                      }
                    }}
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      background: on ? lane.color : `${lane.color}55`,
                      borderColor: lane.color,
                      color: on ? "#fff" : "var(--ink-body)",
                    }}
                  >
                    <span className="st-grip is-start" onPointerDown={beginDrag(lane.key, item, "start")} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", pointerEvents: "none" }}>
                      {chipLabel(lane.key, item)}
                    </span>
                    <span className="st-grip is-end" onPointerDown={beginDrag(lane.key, item, "end")} />
                  </div>
                );
              })}

              {/* Cuts, drawn across every lane so the gap reads as a gap in the
                  video rather than as something missing from one track. */}
              {lane.key === "zooms" &&
                cuts.map((c) => {
                  const at = outOf(c.start, lay);
                  return (
                    <span
                      key={c.id || `${c.start}`}
                      className="st-cut"
                      title={`Cut ${fmtTime(c.end - c.start, true)} — click to restore`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveCut?.(c);
                      }}
                      style={{ left: `${(at / total) * 100}%`, width: 6, marginLeft: -3 }}
                    />
                  );
                })}
            </div>
          </div>
        ))}

        <div className="st-playhead" style={{ left: `calc(${LABEL_W}px + 10px + (100% - ${LABEL_W}px - 10px) * ${playPct / 100})` }} />
      </div>

      {/* ── What the ruler is showing ──────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 11, paddingLeft: LABEL_W + 10, fontSize: 11.5, color: "var(--ink-mute)" }}>
        <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--ink-body)", fontWeight: 650 }}>
          {fmtTime(time, true)} / {fmtTime(total, true)}
        </span>
        {lay.removed > 0.05 && (
          <span>
            {fmtTime(lay.removed, true)} cut from {fmtTime(tl.duration || 0, true)}
          </span>
        )}
        {onAddCut && (
          <button
            type="button"
            onClick={() => onAddCut(time)}
            style={{
              marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5,
              border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink-body)",
              borderRadius: 8, padding: "4px 9px", fontSize: 11.5, fontWeight: 620, cursor: "pointer", fontFamily: "inherit",
            }}
            title="Cut two seconds from here"
          >
            <Icon name="scissors" size={12} />
            Cut here
          </button>
        )}
      </div>
    </div>
  );
}

const LABEL_W = 74;

const SINGULAR = { zooms: "zoom", blurs: "blur", cues: "cue" };

/** Recording time → output time, snapping a moment inside a cut forward. */
function outOf(srcT, lay) {
  for (const s of lay.segments) {
    if (srcT <= s.src_start) return s.out_start;
    if (srcT <= s.src_end) return s.out_start + (srcT - s.src_start);
  }
  return lay.duration;
}

function chipLabel(lane, item) {
  if (lane === "zooms") return `${Number(item.level || 1).toFixed(1)}×`;
  if (lane === "blurs") return item.label || "Blur";
  return item.text || "";
}

function chipTitle(lane, item) {
  const when = `${fmtTime(item.start, true)} – ${fmtTime(item.end, true)}`;
  if (lane === "zooms") return `${item.label || "Zoom"} ${Number(item.level || 1).toFixed(2)}× · ${when}`;
  if (lane === "blurs") return `${item.label || "Blur"} · ${when}`;
  return `${item.text} · ${when}`;
}

const round3 = (v) => Math.round(v * 1000) / 1000;
