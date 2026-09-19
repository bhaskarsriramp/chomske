/**
 * panels.js: the editor's right-hand side.
 *
 * One panel per kind of thing in the timeline. They share a shape on purpose:
 * a list of what is there, the selected one's controls underneath, and one way
 * to add another. A creator who has learned the zoom panel has learned the blur
 * panel.
 *
 * ── NOTHING HERE OWNS ANY STATE ──────────────────────────────────────────────
 * Every panel takes the timeline and an `edit` function and nothing else. The
 * editor holds the document, the undo stack and the autosave; these are only
 * ways of describing a change to it. That is what lets the same change come
 * from a panel, from a drag on the preview, from the timeline, or from applying
 * one of the reviewer's suggestions, without four code paths.
 */
import { useMemo } from "react";
import { Btn, Segmented, Slider, Toggle, Field, Swatches, Panel, Row, Badge, Empty, Icon } from "./ui";
import { fmtTime, newId, clamp, layout, GRADIENTS, CAPTION_STYLES } from "./model";

const pct = (v) => `${Math.round(v * 100)}%`;
const secs = (v) => `${v.toFixed(1)}s`;

/* ────────────────────────────────────────────────────────────────────────────
   Zooms
   ──────────────────────────────────────────────────────────────────────────── */

export function ZoomPanel({ tl, selection, onSelect, edit, time, seek }) {
  const zooms = [...(tl.zooms || [])].sort((a, b) => a.start - b.start);
  const current = zooms.find((z) => z.id === selection?.id && selection.kind === "zoom") || null;

  const add = () => {
    const start = clamp(time, 0, Math.max(0, (tl.duration || 0) - 1.5));
    const z = {
      id: newId("z"),
      start,
      end: Math.min(tl.duration || start + 2.5, start + 2.5),
      x: 0.3, y: 0.3, w: 0.4, h: 0.4,
      level: 1.8,
      easing: "smooth",
      camera: "region",
      follow: false,
      follow_strength: 0.7,
      label: "",
      auto: false,
    };
    edit({ zooms: [...(tl.zooms || []), z] }, "Add zoom");
    onSelect({ kind: "zoom", id: z.id });
  };

  return (
    <>
      <Panel
        title={`Zooms · ${zooms.length}`}
        action={
          <Btn size="xs" icon={<Icon name="plus" size={12} />} onClick={add}>
            Add
          </Btn>
        }
      >
        {zooms.length === 0 ? (
          <Empty icon="zoom" title="No camera moves" action={<Btn size="s" onClick={add}>Add one at the playhead</Btn>}>
            A demo with no zoom shows everything at once, which means it shows nothing in particular.
          </Empty>
        ) : (
          <div style={{ display: "grid", gap: 2, margin: -6 }}>
            {zooms.map((z, i) => (
              <Row
                key={z.id}
                accent="#918DFF"
                selected={current?.id === z.id}
                onClick={() => {
                  onSelect({ kind: "zoom", id: z.id });
                  seek(z.start + 0.05);
                }}
                onRemove={() => edit({ zooms: tl.zooms.filter((x) => x.id !== z.id) }, "Remove zoom")}
                title={z.label || `Zoom ${i + 1}`}
                sub={`${fmtTime(z.start, true)} – ${fmtTime(z.end, true)} · ${Number(z.level).toFixed(1)}×`}
                badge={z.auto ? <Badge tone="ai">AI</Badge> : null}
              />
            ))}
          </div>
        )}
      </Panel>

      {current && (
        <Panel title="Selected zoom">
          <Slider
            label="Zoom level"
            min={1.05}
            max={3}
            step={0.05}
            value={current.level}
            onChange={(v) => edit(patch(tl, "zooms", current.id, { level: v }), "Zoom level")}
            format={(v) => `${v.toFixed(2)}×`}
            hint={current.level > 2.6 ? "Past about 2.5× the recording runs out of pixels and the picture goes soft." : undefined}
          />
          <TimeRange
            tl={tl}
            item={current}
            time={time}
            onChange={(p) => edit(patch(tl, "zooms", current.id, p), "Zoom timing")}
          />
          <div>
            <Label>Easing</Label>
            <Segmented
              full
              size="s"
              value={current.easing}
              onChange={(v) => edit(patch(tl, "zooms", current.id, { easing: v }), "Zoom easing")}
              options={[
                { value: "smooth", label: "Smooth" },
                { value: "snappy", label: "Snappy" },
                { value: "slow", label: "Slow" },
              ]}
            />
          </div>
          <Toggle
            label="Follow the cursor"
            hint="The camera tracks the pointer instead of holding still. For a drag or a scroll — on a still target it drifts and looks like a mistake."
            checked={!!current.follow}
            onChange={(v) => edit(patch(tl, "zooms", current.id, { follow: v }), "Follow cursor")}
          />
          {current.follow && (
            <Slider
              label="How closely"
              min={0.2}
              max={1}
              step={0.05}
              value={current.follow_strength ?? 0.7}
              onChange={(v) => edit(patch(tl, "zooms", current.id, { follow_strength: v }), "Follow strength")}
              format={pct}
            />
          )}
          <Field
            label="Label"
            value={current.label}
            placeholder="What this is on"
            maxLength={80}
            onChange={(v) => edit(patch(tl, "zooms", current.id, { label: v }), "Zoom label")}
          />
          <Hint>Drag the rectangle on the preview to choose what the camera holds.</Hint>
        </Panel>
      )}
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Blur
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The privacy panel.
 *
 * ── THIS IS THE ONE THAT HAS TO BE RIGHT ─────────────────────────────────────
 * Everything else here is about how a demo looks. This is about whether an API
 * key, an email address or a customer's name goes out to the internet, and it
 * cannot be undone after publishing. So:
 *
 *   • Every region the AI found is listed, with what it thinks it is and how
 *     sure it was. Nothing is applied invisibly.
 *   • Every one can be deleted, retimed, moved, resized and restyled. A blur
 *     that cannot be adjusted is one a creator works around by re-recording.
 *   • A region can be added anywhere, at any time, in two clicks.
 *   • The times are editable as numbers AND settable from the playhead,
 *     because "from here to the end" is the common case and dragging to it is
 *     the slow way to say it.
 *   • The whole list can be previewed by clicking a row, which seeks to it.
 */
export function BlurPanel({ tl, selection, onSelect, edit, time, seek }) {
  const blurs = [...(tl.blurs || [])].sort((a, b) => a.start - b.start);
  const current = blurs.find((b) => b.id === selection?.id && selection.kind === "blur") || null;
  const auto = blurs.filter((b) => b.auto).length;

  const add = () => {
    const start = clamp(time, 0, Math.max(0, (tl.duration || 0) - 0.5));
    const b = {
      id: newId("b"),
      start,
      // To the end by default. The safe reading of "cover this" is the wider
      // one: a secret that is on screen now is usually on screen after, and a
      // blur that stops too early is the failure that matters.
      end: tl.duration || start + 3,
      x: 0.34, y: 0.42, w: 0.32, h: 0.09,
      kind: "blur",
      strength: 0.8,
      label: "",
      auto: false,
    };
    edit({ blurs: [...(tl.blurs || []), b] }, "Add blur");
    onSelect({ kind: "blur", id: b.id });
  };

  return (
    <>
      <Panel
        title={`Blur · ${blurs.length}`}
        action={
          <Btn size="xs" icon={<Icon name="plus" size={12} />} onClick={add}>
            Add
          </Btn>
        }
      >
        {blurs.length === 0 ? (
          <Empty icon="blur" title="Nothing private found" action={<Btn size="s" onClick={add}>Add one anyway</Btn>}>
            Every sampled frame was checked for emails, keys, tokens and personal details. Add your own if something was
            missed.
          </Empty>
        ) : (
          <>
            {auto > 0 && (
              <div style={{ fontSize: 12, lineHeight: 1.55, color: "var(--d-mute)", marginTop: -4 }}>
                {auto} found automatically. Click one to see it on the picture, and check each before you export.
              </div>
            )}
            <div style={{ display: "grid", gap: 2, margin: -6 }}>
              {blurs.map((b, i) => (
                <Row
                  key={b.id}
                  accent="#FF9482"
                  selected={current?.id === b.id}
                  onClick={() => {
                    onSelect({ kind: "blur", id: b.id });
                    seek(b.start + 0.05);
                  }}
                  onRemove={() => edit({ blurs: tl.blurs.filter((x) => x.id !== b.id) }, "Remove blur")}
                  title={b.label || `Region ${i + 1}`}
                  sub={`${fmtTime(b.start, true)} – ${fmtTime(b.end, true)} · ${KIND_LABEL[b.kind] || b.kind}`}
                  badge={
                    b.auto ? (
                      <Badge tone={b.confidence >= 0.65 ? "ai" : "warn"}>
                        {b.confidence >= 0.65 ? "AI" : "Check"}
                      </Badge>
                    ) : null
                  }
                />
              ))}
            </div>
          </>
        )}
      </Panel>

      {current && (
        <Panel title="Selected region">
          <div>
            <Label>Cover it with</Label>
            <Segmented
              full
              size="s"
              value={current.kind}
              onChange={(v) => edit(patch(tl, "blurs", current.id, { kind: v }), "Blur style")}
              options={[
                { value: "blur", label: "Blur", title: "Softened. Reads as deliberate." },
                { value: "pixelate", label: "Pixelate", title: "Blocks. For faces and photographs." },
                { value: "box", label: "Solid", title: "Covered completely. For a full secret key." },
              ]}
            />
          </div>

          {current.kind !== "box" && (
            <Slider
              label="Strength"
              min={0.2}
              max={1}
              step={0.05}
              value={current.strength ?? 0.8}
              onChange={(v) => edit(patch(tl, "blurs", current.id, { strength: v }), "Blur strength")}
              format={pct}
              hint={current.strength < 0.45 ? "At this strength small text can still be readable when the video is paused." : undefined}
            />
          )}

          <TimeRange
            tl={tl}
            item={current}
            time={time}
            onChange={(p) => edit(patch(tl, "blurs", current.id, p), "Blur timing")}
            extra={
              <Btn
                size="xs"
                onClick={() => edit(patch(tl, "blurs", current.id, { start: 0, end: tl.duration || current.end }), "Blur whole video")}
                title="Cover this region for the entire recording"
              >
                Whole video
              </Btn>
            }
          />

          <Field
            label="What is it"
            value={current.label}
            placeholder="e.g. account email"
            maxLength={60}
            onChange={(v) => edit(patch(tl, "blurs", current.id, { label: v }), "Blur label")}
            hint="Only for your own list. Never write the secret itself here."
          />

          <Hint>Drag the rectangle on the preview to move it, and its corners to resize. Scrub through to check it stays over the thing the whole time.</Hint>
        </Panel>
      )}
    </>
  );
}

const KIND_LABEL = { blur: "Blurred", pixelate: "Pixelated", box: "Covered" };

/* ────────────────────────────────────────────────────────────────────────────
   Captions
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * ── CAPTIONS ARE OPT-IN ──────────────────────────────────────────────────────
 * A silent screen recording transcribed produces captions of room tone, and
 * burning those onto a clean demo is worse than having none: it is now a thing
 * to find and turn off. So a demo arrives here with no captions unless they
 * were asked for, and this panel is where they are asked for — at which point
 * only the audio is read again, not the whole recording.
 */
export function CaptionsPanel({ tl, selection, onSelect, edit, time, seek, onGenerate, generating, hasAudio }) {
  const cues = [...(tl.cues || [])].sort((a, b) => a.start - b.start);
  const cap = tl.captions || {};
  const current = cues.find((c) => c.id === selection?.id && selection.kind === "cue") || null;

  const addCue = () => {
    const start = clamp(time, 0, Math.max(0, (tl.duration || 0) - 1));
    const c = { id: newId("q"), start, end: Math.min(tl.duration || start + 1.8, start + 1.8), text: "New caption", emphasis: [], custom: null };
    edit({ cues: [...cues, c], captions: { ...cap, enabled: true } }, "Add caption");
    onSelect({ kind: "cue", id: c.id });
  };

  return (
    <>
      <Panel title="Captions">
        <Toggle
          label="Show captions"
          hint={cues.length ? `${cues.length} lines.` : "Nothing to show yet — write them from your voice, or add them by hand."}
          checked={!!cap.enabled}
          onChange={(v) => edit({ captions: { ...cap, enabled: v } }, v ? "Captions on" : "Captions off")}
          disabled={!cues.length}
        />

        {!cues.length && (
          <div style={{ display: "grid", gap: 9 }}>
            <Btn
              kind="primary"
              icon={<Icon name="wand" size={14} />}
              onClick={onGenerate}
              disabled={!hasAudio || generating}
              full
            >
              {generating ? "Listening…" : "Write captions from my voice"}
            </Btn>
            {!hasAudio && <Hint>This recording has no sound, so there is nothing to transcribe. You can still write them by hand.</Hint>}
            <Btn size="s" icon={<Icon name="plus" size={12} />} onClick={addCue} full>
              Add a caption by hand
            </Btn>
          </div>
        )}

        {cap.enabled && cues.length > 0 && (
          <>
            <div>
              <Label>Style</Label>
              <Segmented
                full
                size="xs"
                value={cap.style}
                onChange={(v) => edit({ captions: { ...cap, style: v } }, "Caption style")}
                options={CAPTION_STYLES.map((s) => ({ value: s, label: STYLE_LABEL[s] || s }))}
              />
            </div>
            <div>
              <Label>Position</Label>
              <Segmented
                full
                size="s"
                value={cap.position}
                onChange={(v) => edit({ captions: { ...cap, position: v, x: null, y: null } }, "Caption position")}
                options={[
                  { value: "top", label: "Top" },
                  { value: "middle", label: "Middle" },
                  { value: "bottom", label: "Bottom" },
                ]}
              />
            </div>
            <div>
              <Label>Size</Label>
              <Segmented
                full
                size="s"
                value={cap.size}
                onChange={(v) => edit({ captions: { ...cap, size: v, px: null } }, "Caption size")}
                options={[
                  { value: "s", label: "S" },
                  { value: "m", label: "M" },
                  { value: "l", label: "L" },
                  { value: "xl", label: "XL" },
                ]}
              />
            </div>
            <div>
              <Label>Colour</Label>
              <Swatches
                value={cap.color || "#FFFFFF"}
                options={["#FFFFFF", "#70FFD2", "#FFD400", "#FF9482", "#918DFF", "#F09BE5"]}
                onChange={(c) => edit({ captions: { ...cap, color: c === "#FFFFFF" ? null : c } }, "Caption colour")}
              />
            </div>
            <Hint>Drag a caption on the preview to move that one line on its own.</Hint>
          </>
        )}
      </Panel>

      {cap.enabled && cues.length > 0 && (
        <Panel
          title={`Lines · ${cues.length}`}
          action={
            <Btn size="xs" icon={<Icon name="plus" size={12} />} onClick={addCue}>
              Add
            </Btn>
          }
        >
          <div className="st-scroll" style={{ display: "grid", gap: 2, margin: -6, maxHeight: 230 }}>
            {cues.map((c) => (
              <Row
                key={c.id}
                accent="#F09BE5"
                selected={current?.id === c.id}
                onClick={() => {
                  onSelect({ kind: "cue", id: c.id });
                  seek(c.start + 0.05);
                }}
                onRemove={() => edit({ cues: cues.filter((x) => x.id !== c.id) }, "Remove caption")}
                title={c.text}
                sub={fmtTime(c.start, true)}
                badge={c.custom ? <Badge>Styled</Badge> : null}
              />
            ))}
          </div>
        </Panel>
      )}

      {current && (
        <Panel title="This line">
          <Field
            label="Text"
            multiline
            value={current.text}
            maxLength={300}
            onChange={(v) => edit(patch(tl, "cues", current.id, { text: v }), "Caption text")}
          />
          <Field
            label="Emphasise"
            value={(current.emphasis || []).join(", ")}
            placeholder="words that carry the meaning"
            onChange={(v) =>
              edit(
                patch(tl, "cues", current.id, { emphasis: v.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 6) }),
                "Caption emphasis"
              )
            }
            hint="Drawn in the style's accent colour. Usually the product name or the action."
          />
          <TimeRange tl={tl} item={current} time={time} onChange={(p) => edit(patch(tl, "cues", current.id, p), "Caption timing")} />

          <div>
            <Label>Just this line</Label>
            <div style={{ display: "grid", gap: 11 }}>
              <Swatches
                value={current.custom?.color || ""}
                options={["#FFFFFF", "#70FFD2", "#FFD400", "#FF9482", "#918DFF"]}
                onChange={(c) => edit(patch(tl, "cues", current.id, { custom: { ...(current.custom || {}), color: c } }), "Line colour")}
              />
              <Segmented
                full
                size="xs"
                value={current.custom?.size || ""}
                onChange={(v) => edit(patch(tl, "cues", current.id, { custom: { ...(current.custom || {}), size: v || null } }), "Line size")}
                options={[
                  { value: "", label: "Default" },
                  { value: "s", label: "S" },
                  { value: "m", label: "M" },
                  { value: "l", label: "L" },
                  { value: "xl", label: "XL" },
                ]}
              />
              {current.custom && (
                <Btn size="xs" onClick={() => edit(patch(tl, "cues", current.id, { custom: null }), "Reset line style")}>
                  Match the rest
                </Btn>
              )}
            </div>
          </div>
        </Panel>
      )}
    </>
  );
}

const STYLE_LABEL = { trylipi: "TryLipi", hormozi: "Bold", apple: "Quiet", minimal: "Minimal", neon: "Neon" };

/* ────────────────────────────────────────────────────────────────────────────
   Annotations
   ──────────────────────────────────────────────────────────────────────────── */

export function NotesPanel({ tl, selection, onSelect, edit, time, seek }) {
  const notes = [...(tl.notes || [])].sort((a, b) => a.start - b.start);
  const current = notes.find((n) => n.id === selection?.id && selection.kind === "note") || null;

  const add = () => {
    const start = clamp(time, 0, Math.max(0, (tl.duration || 0) - 1));
    const n = {
      id: newId("n"),
      start,
      end: Math.min(tl.duration || start + 2.5, start + 2.5),
      kind: "tooltip",
      text: "Look here",
      x: 0.36, y: 0.42, w: 0.28, h: 0.1,
      anchor: "auto",
      color: "",
      auto: false,
    };
    edit({ notes: [...notes, n] }, "Add annotation");
    onSelect({ kind: "note", id: n.id });
  };

  return (
    <>
      <Panel
        title={`Annotations · ${notes.length}`}
        action={
          <Btn size="xs" icon={<Icon name="plus" size={12} />} onClick={add}>
            Add
          </Btn>
        }
      >
        {notes.length === 0 ? (
          <Empty icon="note" title="No annotations" action={<Btn size="s" onClick={add}>Add one</Btn>}>
            Sparing is the point. One label on screen at a time; a demo covered in arrows reads as a slide deck.
          </Empty>
        ) : (
          <div style={{ display: "grid", gap: 2, margin: -6 }}>
            {notes.map((n) => (
              <Row
                key={n.id}
                accent="#74DDB0"
                selected={current?.id === n.id}
                onClick={() => {
                  onSelect({ kind: "note", id: n.id });
                  seek(n.start + 0.05);
                }}
                onRemove={() => edit({ notes: notes.filter((x) => x.id !== n.id) }, "Remove annotation")}
                title={n.text || n.kind}
                sub={`${fmtTime(n.start, true)} · ${n.kind}`}
                badge={n.auto ? <Badge tone="ai">AI</Badge> : null}
              />
            ))}
          </div>
        )}
      </Panel>

      {current && (
        <Panel title="Selected annotation">
          <div>
            <Label>Kind</Label>
            <Segmented
              full
              size="xs"
              value={current.kind}
              onChange={(v) => edit(patch(tl, "notes", current.id, { kind: v }), "Annotation kind")}
              options={[
                { value: "tooltip", label: "Label" },
                { value: "arrow", label: "Arrow" },
                { value: "circle", label: "Ring" },
                { value: "underline", label: "Underline" },
                { value: "spotlight", label: "Spotlight" },
              ]}
            />
          </div>
          {current.kind !== "circle" && current.kind !== "underline" && current.kind !== "spotlight" && (
            <Field
              label="Text"
              value={current.text}
              maxLength={200}
              onChange={(v) => edit(patch(tl, "notes", current.id, { text: v }), "Annotation text")}
              hint="At most eight words. It is a label, not a sentence."
            />
          )}
          <TimeRange tl={tl} item={current} time={time} onChange={(p) => edit(patch(tl, "notes", current.id, p), "Annotation timing")} />
          <div>
            <Label>Colour</Label>
            <Swatches
              value={current.color || "#2A7C13"}
              options={["#2A7C13", "#918DFF", "#FF9482", "#FFD400", "#00B7CD", "#F09BE5"]}
              onChange={(c) => edit(patch(tl, "notes", current.id, { color: c }), "Annotation colour")}
            />
          </div>
          <Hint>Drag the rectangle on the preview to choose what it points at.</Hint>
        </Panel>
      )}
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Cursor
   ──────────────────────────────────────────────────────────────────────────── */

export function CursorPanel({ tl, edit }) {
  const cur = tl.cursor || {};
  const points = tl.track?.length || 0;
  const clicks = (tl.events || []).filter((e) => e.type === "click" || e.type === "dblclick").length;

  return (
    <Panel title="Cursor">
      {points === 0 ? (
        <Empty icon="cursor" title="No pointer was recovered">
          The pointer is read back out of the recording's own pixels, and this one was too busy to read — a full-screen
          video or a constantly repainting page. Zooms and annotations still work.
        </Empty>
      ) : (
        <>
          <div style={{ fontSize: 12, lineHeight: 1.55, color: "var(--d-mute)", marginTop: -4 }}>
            {points.toLocaleString()} points recovered, {clicks} click{clicks === 1 ? "" : "s"} detected.
          </div>
          <Toggle
            label="Draw a clean cursor"
            hint="A drawn pointer over the captured one, so it stays sharp inside a zoom."
            checked={cur.enabled !== false}
            onChange={(v) => edit({ cursor: { ...cur, enabled: v } }, v ? "Cursor on" : "Cursor off")}
          />
          {cur.enabled !== false && (
            <>
              <div>
                <Label>Look</Label>
                <Segmented
                  full
                  size="xs"
                  value={cur.theme}
                  onChange={(v) => edit({ cursor: { ...cur, theme: v } }, "Cursor look")}
                  options={[
                    { value: "light", label: "Light" },
                    { value: "dark", label: "Dark" },
                    { value: "ring", label: "Ring" },
                    { value: "dot", label: "Dot" },
                  ]}
                />
              </div>
              <Slider
                label="Size"
                min={0.8}
                max={2.2}
                step={0.05}
                value={cur.size ?? 1.35}
                onChange={(v) => edit({ cursor: { ...cur, size: v } }, "Cursor size")}
                format={(v) => `${v.toFixed(2)}×`}
                hint={
                  (cur.size ?? 1.35) < 1.15
                    ? "Below about 1.2× the captured pointer shows from underneath the drawn one. It cannot be erased from the recording."
                    : undefined
                }
              />
              <Slider
                label="Glow"
                min={0}
                max={1}
                step={0.05}
                value={cur.glow ?? 0.35}
                onChange={(v) => edit({ cursor: { ...cur, glow: v } }, "Cursor glow")}
                format={pct}
              />
              <Slider
                label="Trail"
                min={0}
                max={1}
                step={0.05}
                value={cur.trail ?? 0}
                onChange={(v) => edit({ cursor: { ...cur, trail: v } }, "Cursor trail")}
                format={(v) => (v === 0 ? "Off" : pct(v))}
                hint="Reads as speed on a fast move and as a mess on a slow one. Most demos are slow moves."
              />
              <Toggle
                label="Ripple on click"
                hint="A click is invisible in a screen recording — the button changes for eighty milliseconds and the viewer misses it."
                checked={cur.ripple !== false}
                onChange={(v) => edit({ cursor: { ...cur, ripple: v } }, "Click ripple")}
              />
            </>
          )}
        </>
      )}
    </Panel>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Canvas
   ──────────────────────────────────────────────────────────────────────────── */

export function CanvasPanel({ tl, edit }) {
  const c = tl.canvas || {};
  const bg = c.background || { kind: "gradient", value: "dusk" };

  return (
    <Panel title="Canvas">
      <div>
        <Label>Shape</Label>
        <Segmented
          full
          size="xs"
          value={c.aspect}
          onChange={(v) => edit({ canvas: { ...c, aspect: v } }, "Aspect")}
          options={[
            { value: "16:9", label: "16:9" },
            { value: "9:16", label: "9:16" },
            { value: "1:1", label: "1:1" },
            { value: "4:5", label: "4:5" },
          ]}
        />
      </div>

      <div>
        <Label>Background</Label>
        <Segmented
          full
          size="xs"
          value={bg.kind}
          onChange={(v) => edit({ canvas: { ...c, background: { kind: v, value: v === "solid" ? "#101318" : "dusk" } } }, "Background")}
          options={[
            { value: "gradient", label: "Gradient" },
            { value: "solid", label: "Solid" },
            { value: "none", label: "None" },
          ]}
        />
      </div>

      {bg.kind === "gradient" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 7 }}>
          {Object.entries(GRADIENTS).map(([name, stops]) => {
            const on = bg.value === name;
            return (
              <button
                key={name}
                type="button"
                title={name}
                aria-pressed={on}
                onClick={() => edit({ canvas: { ...c, background: { kind: "gradient", value: name } } }, "Background")}
                style={{
                  aspectRatio: "1", borderRadius: 9, cursor: "pointer", padding: 0,
                  background: `linear-gradient(135deg, ${stops[0]}, ${stops[1]} 55%, ${stops[2]})`,
                  border: on ? "2px solid var(--d-ink)" : "1px solid var(--d-line)",
                }}
              />
            );
          })}
        </div>
      )}

      {bg.kind === "solid" && (
        <Swatches
          value={bg.value}
          options={["#101318", "#1C1E22", "#0B2B3A", "#12281A", "#2B1A14", "#F3F1EC", "#E8EDF2"]}
          onChange={(v) => edit({ canvas: { ...c, background: { kind: "solid", value: v } } }, "Background")}
          size={30}
        />
      )}

      <Slider
        label="Video size"
        min={0}
        max={0.22}
        step={0.005}
        value={c.padding ?? 0.06}
        onChange={(v) => edit({ canvas: { ...c, padding: v } }, "Video size")}
        format={(v) => pct(1 - v * 2)}
      />
      <Slider
        label="Corner radius"
        min={0}
        max={56}
        step={1}
        value={c.radius ?? 18}
        onChange={(v) => edit({ canvas: { ...c, radius: v } }, "Corner radius")}
        format={(v) => `${Math.round(v)}px`}
      />
      <Slider
        label="Shadow"
        min={0}
        max={1}
        step={0.05}
        value={c.shadow ?? 0.5}
        onChange={(v) => edit({ canvas: { ...c, shadow: v } }, "Shadow")}
        format={(v) => (v === 0 ? "None" : pct(v))}
      />
    </Panel>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Steps and suggestions
   ──────────────────────────────────────────────────────────────────────────── */

export function StepsPanel({ tl, time, seek, summary, narration }) {
  const steps = tl.steps || [];
  const lay = useMemo(() => layout(tl), [tl]);

  return (
    <>
      {summary && (
        <Panel title="What this demo shows">
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "var(--d-body)" }}>{summary}</p>
        </Panel>
      )}
      <Panel title={`Steps · ${steps.length}`}>
        {steps.length === 0 ? (
          <Empty icon="steps" title="No steps were found">
            The recording may be too short, or nothing identifiable happened in it.
          </Empty>
        ) : (
          <div style={{ display: "grid", gap: 2, margin: -6 }}>
            {steps.map((s, i) => {
              const out = outOf(s.start, lay);
              const on = time >= out && time <= outOf(s.end, lay);
              return (
                <Row
                  key={s.id}
                  accent={s.importance === "high" ? "#74DDB0" : "#918DFF"}
                  selected={on}
                  onClick={() => seek(out + 0.05)}
                  title={`${i + 1}. ${s.title}`}
                  sub={s.detail}
                  badge={s.importance === "high" ? <Badge tone="good">Key</Badge> : null}
                />
              );
            })}
          </div>
        )}
      </Panel>
      {narration?.length > 0 && (
        <Panel title="Voiceover script">
          <div style={{ display: "grid", gap: 11 }}>
            {narration.map((n) => (
              <div key={n.id}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--d-mute)", fontVariantNumeric: "tabular-nums" }}>
                  {fmtTime(n.start, true)}
                </div>
                <p style={{ margin: "3px 0 0", fontSize: 13, lineHeight: 1.55, color: "var(--d-body)" }}>{n.text}</p>
              </div>
            ))}
          </div>
          <Hint>Written from what happened on screen. Read it over the demo, or paste it into a description.</Hint>
        </Panel>
      )}
    </>
  );
}

export function SuggestionsPanel({ analysis, onApply, onDismiss, onRefresh, busy }) {
  const list = analysis?.suggestions || [];
  return (
    <Panel
      title="Review"
      action={
        <Btn size="xs" onClick={onRefresh} disabled={busy}>
          {busy ? "Looking…" : "Check again"}
        </Btn>
      }
    >
      {analysis?.verdict && (
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--d-body)" }}>{analysis.verdict}</p>
      )}
      {list.length === 0 ? (
        <Empty icon="check" title="Nothing to fix">
          The edit was read back and nothing stood out.
        </Empty>
      ) : (
        <div style={{ display: "grid", gap: 9 }}>
          {list.map((s) => (
            <div
              key={s.id}
              style={{
                padding: "11px 12px", borderRadius: 12,
                border: "1px solid", borderColor: s.severity === "high" ? "rgba(255,148,130,.3)" : "var(--d-line-soft)",
                background: s.severity === "high" ? "rgba(255,90,90,.06)" : "rgba(255,255,255,.02)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 650, color: "var(--d-ink)" }}>{s.title}</span>
                {s.severity === "high" && <Badge tone="warn">Important</Badge>}
              </div>
              <p style={{ margin: "0 0 10px", fontSize: 12, lineHeight: 1.55, color: "var(--d-mute)" }}>{s.why}</p>
              <div style={{ display: "flex", gap: 7 }}>
                <Btn size="xs" kind="primary" onClick={() => onApply(s.id)}>
                  Apply
                </Btn>
                <Btn size="xs" kind="quiet" onClick={() => onDismiss(s.id)}>
                  Ignore
                </Btn>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Shared bits
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * From / to, as numbers and as buttons.
 *
 * The buttons matter more than the numbers. "From here" while the playhead sits
 * on the frame where a dialog opened is exact and takes one click; finding the
 * same moment by nudging a number is how people give up and leave a blur two
 * seconds late.
 */
function TimeRange({ tl, item, time, onChange, extra }) {
  const lay = useMemo(() => layout(tl), [tl]);
  const srcNow = sourceOf(time, lay);
  const len = item.end - item.start;

  return (
    <div>
      <Label>Timing</Label>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        <Stepper
          value={item.start}
          max={item.end - 0.15}
          onChange={(v) => onChange({ start: v })}
        />
        <span style={{ fontSize: 12, color: "var(--d-mute)" }}>→</span>
        <Stepper
          value={item.end}
          min={item.start + 0.15}
          max={tl.duration || item.end}
          onChange={(v) => onChange({ end: v })}
        />
        <span style={{ fontSize: 11.5, color: "var(--d-mute)", fontVariantNumeric: "tabular-nums" }}>{secs(len)}</span>
      </div>
      <div style={{ display: "flex", gap: 7, marginTop: 9, flexWrap: "wrap" }}>
        <Btn size="xs" onClick={() => onChange({ start: Math.min(srcNow, item.end - 0.15) })} title="Start at the playhead">
          Start here
        </Btn>
        <Btn size="xs" onClick={() => onChange({ end: Math.max(srcNow, item.start + 0.15) })} title="End at the playhead">
          End here
        </Btn>
        {extra}
      </div>
    </div>
  );
}

function Stepper({ value, min = 0, max = Infinity, onChange, step = 0.1 }) {
  const set = (v) => onChange(Math.round(clamp(v, min, max) * 1000) / 1000);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", border: "1px solid var(--d-line)", borderRadius: 8, overflow: "hidden", background: "rgba(0,0,0,.3)" }}>
      <button type="button" onClick={() => set(value - step)} style={stepBtn} aria-label="Earlier">
        −
      </button>
      <span style={{ minWidth: 52, textAlign: "center", fontSize: 12, fontWeight: 650, color: "var(--d-ink)", fontVariantNumeric: "tabular-nums" }}>
        {fmtTime(value, true)}
      </span>
      <button type="button" onClick={() => set(value + step)} style={stepBtn} aria-label="Later">
        +
      </button>
    </span>
  );
}

const stepBtn = {
  width: 24, height: 28, border: "none", background: "transparent", color: "var(--d-body)",
  cursor: "pointer", fontSize: 15, lineHeight: 1, fontFamily: "inherit",
};

function Label({ children }) {
  return (
    <div style={{ marginBottom: 7, fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--d-mute)" }}>
      {children}
    </div>
  );
}

function Hint({ children }) {
  return <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.55, color: "var(--d-mute)" }}>{children}</p>;
}

/** One item in one list, changed, as a patch for the whole timeline. */
function patch(tl, list, id, fields) {
  return { [list]: (tl[list] || []).map((x) => (x.id === id ? { ...x, ...fields } : x)) };
}

function outOf(srcT, lay) {
  for (const s of lay.segments) {
    if (srcT <= s.src_start) return s.out_start;
    if (srcT <= s.src_end) return s.out_start + (srcT - s.src_start);
  }
  return lay.duration;
}

function sourceOf(outT, lay) {
  for (const s of lay.segments) {
    if (outT >= s.out_start && outT <= s.out_end) return s.src_start + (outT - s.out_start);
  }
  return lay.segments.length ? lay.segments[lay.segments.length - 1].src_end : 0;
}
