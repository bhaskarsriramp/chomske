import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  ASPECTS, layout, captionCues, activeClipIndex, hasIndic, captionPlacement, captionLook, segmentsOf, textPlacement, pipPlacement,
  splitPanes,
} from "./model";
import { Icon } from "./ui";

/**
 * The preview: the edit, played from the 540p copies, with B-roll, captions,
 * text and music laid over it the way the export will lay them.
 *
 * ── HOW A TIMELINE PLAYS IN A BROWSER ────────────────────────────────────────
 * There is no rendered file to play: the edit changes on every trim. So there is
 * one <video> per recording, stacked, and a frame loop that walks the clips.
 * Inside a clip the recording plays normally; at its out point the loop seeks
 * the next clip's in point (or shows the next recording's element) and carries
 * on. Output time is derived from the playing element's own clock, never from a
 * timer, so a stalled network pauses the playhead instead of letting it run
 * ahead of the picture.
 *
 * Overlays are decided per frame from the same layout() and placement functions
 * the server renders with (model.js). They are HTML, not burnt in, so they are
 * close to the export and not identical to it: sizes, positions and wrap widths
 * follow the same pixels of the frame; the exact glyph shapes are the browser's.
 *
 * ── THE FRAME IS ALSO A CONTROL ──────────────────────────────────────────────
 * Captions, text and overlay B-roll are dragged where they should sit, and an
 * overlay is resized by its corner, right on the picture, because "a bit higher"
 * is judged by eye and not by a number. A drag is one undo step. A split screen
 * is drawn by moving the recording itself (transform + clip-path), so the
 * element keeps playing instead of being remounted into a smaller box.
 *
 * ── AUDITION ─────────────────────────────────────────────────────────────────
 * Hearing an alternate take, or a stretch of speech that matched no line, plays
 * that range of the recording directly, outside the timeline, with the overlays
 * hidden so it is obvious this is not the edit.
 */
export default function Preview({
  tl, mediaById, playing, onPlayingChange, seek, onTime, stopAt = null, audition = null, onAuditionEnd,
  tab = null, selection = { kind: null, id: null }, onChange, onPick, captionScope = "all", term = "B-roll",
}) {
  const outer = useRef(null);
  const box = useBox(outer);
  const [W, H] = ASPECTS[tl.aspect] || ASPECTS["9:16"];
  const ratio = W / H;
  let fw = box.w;
  let fh = box.w / ratio;
  if (box.h > 0 && fh > box.h) {
    fh = box.h;
    fw = box.h * ratio;
  }

  const lay = useMemo(() => layout(tl), [tl]);
  const clips = useMemo(() => lay.clips.filter((c) => c.start !== null), [lay]);
  const cues = useMemo(() => captionCues(tl), [tl]);
  const segById = useMemo(() => new Map(segmentsOf(tl).map((s) => [s.id, s])), [tl]);
  const recordingIds = useMemo(() => {
    const ids = new Set(clips.map((c) => c.media));
    if (audition?.media) ids.add(audition.media);
    return [...ids].filter((id) => mediaById.get(id)?.proxy_url);
  }, [clips, audition, mediaById]);

  const videos = useRef({});
  const audios = useRef({});
  const brollVideos = useRef({});
  const tRef = useRef(0);
  const idxRef = useRef(-1);
  const lastReport = useRef(0);
  const live = useRef({});
  live.current = { lay, clips, cues, tl, mediaById, stopAt, onTime, onPlayingChange, playing, onAuditionEnd };

  const [activeMedia, setActiveMedia] = useState(null);
  const [overlay, setOverlay] = useState({ key: "", brolls: [], cue: null, texts: [] });
  const [guide, setGuide] = useState(false);

  /** Everything that depends only on output time: overlays, B-roll video, music. */
  const paint = useCallback((t) => {
    const { lay: L, cues: C, tl: T, mediaById: M, playing: P } = live.current;
    const brolls = L.broll.filter((x) => x.start !== null && t >= x.start && t < x.end);
    const cue = C.find((c) => t >= c.start && t < c.end) || null;
    const texts = (T.texts || []).filter((x) => t >= x.start && t < x.start + x.duration);
    const key = [
      brolls.map((b) => [b.id, b.media, b.fit, b.layout, b.side, b.ratio, b.x, b.y, b.w, b.label].join(":")).join("|"),
      cue ? `${cue.start}:${cue.text}:${cue.seg}` : "",
      texts.map((x) => [x.id, x.text, x.position, x.size, x.x, x.y].join(":")).join("|"),
    ].join("#");
    setOverlay((o) => (o.key === key ? o : { key, brolls, cue, texts }));

    for (const b of brolls) {
      const bv = brollVideos.current[b.id];
      if (!bv || M.get(b.media)?.type !== "video") continue;
      const target = (b.media_in || 0) + (t - b.start);
      if (Math.abs(bv.currentTime - target) > (P ? 0.35 : 0.05)) bv.currentTime = target;
      if (P && bv.paused) bv.play().catch(() => {});
      if (!P && !bv.paused) bv.pause();
    }

    for (const a of T.audio || []) {
      const el = audios.current[a.id];
      if (!el) continue;
      const local = t - a.start;
      if (!P || local < 0 || local >= a.duration) {
        if (!el.paused) el.pause();
        continue;
      }
      const target = (a.in || 0) + local;
      if (el.paused) {
        el.currentTime = target;
        el.play().catch(() => {});
      } else if (Math.abs(el.currentTime - target) > 0.35) {
        el.currentTime = target;
      }
      let env = 1;
      if (a.fade_in > 0 && local < a.fade_in) env = Math.min(env, local / a.fade_in);
      if (a.fade_out > 0 && a.duration - local < a.fade_out) env = Math.min(env, (a.duration - local) / a.fade_out);
      el.volume = Math.max(0, Math.min(1, (a.volume ?? 0.3) * env));
    }
  }, []);

  /** Put the recording(s) where output time t says, and paint. */
  const place = useCallback((t) => {
    const { clips: C, lay: L } = live.current;
    const tt = Math.max(0, Math.min(t, L.duration));
    tRef.current = tt;
    const i = activeClipIndex(C, tt);
    idxRef.current = i;
    if (i >= 0) {
      const c = C[i];
      const v = videos.current[c.media];
      const src = Math.min(c.out - 0.01, c.in + (tt - c.start));
      if (v && Math.abs(v.currentTime - src) > 0.03) v.currentTime = src;
      setActiveMedia(c.media);
      for (const [id, el] of Object.entries(videos.current)) if (id !== c.media && el && !el.paused) el.pause();
    }
    paint(tt);
    return tt;
  }, [paint]);

  // Seeks asked for from outside (scrubber, selecting a line).
  useEffect(() => {
    if (!seek || audition) return;
    const t = place(seek.t);
    live.current.onTime?.(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seek?.n]);

  // A trim or a drag under a paused playhead shows its new frame at once.
  useEffect(() => {
    if (!live.current.playing && !audition) place(tRef.current);
    else paint(tRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tl]);

  useEffect(() => {
    const vol = Math.max(0, Math.min(1, Number(tl.voice_volume ?? 1)));
    for (const el of Object.values(videos.current)) if (el) el.volume = vol;
  }, [tl.voice_volume, recordingIds]);

  // Read at call time rather than captured: elements come and go as clips,
  // B-roll and music change, and a cleanup holding an old list pauses nothing.
  const pauseAll = useCallback(() => {
    Object.values(videos.current).forEach((v) => v && !v.paused && v.pause());
    Object.values(audios.current).forEach((a) => a && !a.paused && a.pause());
    Object.values(brollVideos.current).forEach((v) => v && !v.paused && v.pause());
  }, []);

  // ── Playing the edit ────────────────────────────────────────────────────
  useEffect(() => {
    if (audition) return undefined;
    if (!playing) {
      Object.values(videos.current).forEach((v) => v && !v.paused && v.pause());
      paint(tRef.current);
      return undefined;
    }
    const { clips: C, lay: L } = live.current;
    if (!C.length) {
      live.current.onPlayingChange(false);
      return undefined;
    }
    place(tRef.current >= L.duration - 0.05 ? 0 : tRef.current);
    const first = C[idxRef.current];
    const v0 = first && videos.current[first.media];
    if (!v0) {
      live.current.onPlayingChange(false);
      return undefined;
    }
    v0.play().catch(() => live.current.onPlayingChange(false));

    let raf = 0;
    const step = () => {
      const { clips: CL, lay: LA, stopAt: stop, onTime: report, onPlayingChange: setPlaying } = live.current;
      const i = idxRef.current;
      const c = CL[i];
      const v = c && videos.current[c.media];
      if (!c || !v) {
        setPlaying(false);
        return;
      }
      let t;
      if (v.currentTime >= c.out - 0.02 || v.ended) {
        const next = CL[i + 1];
        if (!next) {
          v.pause();
          tRef.current = LA.duration;
          paint(LA.duration);
          report(LA.duration);
          setPlaying(false);
          return;
        }
        idxRef.current = i + 1;
        const nv = videos.current[next.media];
        if (nv !== v) v.pause();
        if (nv) {
          nv.currentTime = next.in;
          if (nv.paused) nv.play().catch(() => {});
        }
        setActiveMedia(next.media);
        t = next.start;
      } else {
        t = Math.min(c.end, Math.max(c.start, c.start + (v.currentTime - c.in)));
      }
      tRef.current = t;
      if (stop !== null && stop !== undefined && t >= stop - 0.01) {
        const cur = CL[idxRef.current];
        videos.current[cur?.media]?.pause();
        paint(t);
        report(t);
        setPlaying(false);
        return;
      }
      paint(t);
      const now = performance.now();
      if (now - lastReport.current > 80) {
        lastReport.current = now;
        report(t);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      pauseAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, audition]);

  // ── Auditioning a range outside the edit ────────────────────────────────
  useEffect(() => {
    if (!audition) {
      place(tRef.current);
      return undefined;
    }
    const v = videos.current[audition.media];
    setActiveMedia(audition.media);
    for (const [id, el] of Object.entries(videos.current)) if (id !== audition.media && el && !el.paused) el.pause();
    if (!v) return undefined;
    v.currentTime = audition.in;
    v.play().catch(() => live.current.onAuditionEnd?.());
    let raf = 0;
    const step = () => {
      if (v.currentTime >= audition.out - 0.02 || v.ended) {
        v.pause();
        live.current.onAuditionEnd?.();
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      v.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audition]);

  const scale = fw > 0 ? fw / W : 0;
  const cap = tl.captions || {};
  const cp = captionPlacement(tl, W, H);
  const editable = !!onChange && !audition && scale > 0;

  // The last split on screen decides where the recording sits.
  const split = [...overlay.brolls].reverse().find((b) => b.layout === "split" && b.media && mediaById.get(b.media));
  const panes = split ? splitPanes(split, W, H) : null;
  const recordingStyle = panes && !audition
    ? panes.across
      ? {
          transform: `translateX(${((panes.creator.x - panes.crop.x) / W) * 100}%)`,
          clipPath: `inset(0 ${(1 - (panes.crop.x + panes.crop.w) / W) * 100}% 0 ${(panes.crop.x / W) * 100}%)`,
        }
      : {
          transform: `translateY(${((panes.creator.y - panes.crop.y) / H) * 100}%)`,
          clipPath: `inset(${(panes.crop.y / H) * 100}% 0 ${(1 - (panes.crop.y + panes.crop.h) / H) * 100}% 0)`,
        }
    : null;

  const emptySlot = overlay.brolls.find((b) => !b.media || !mediaById.get(b.media));
  const showCaptionGuide = editable && tab === "captions" && cap.mode !== "off" && !overlay.cue && !playing;

  const toggle = () => {
    if (audition) live.current.onAuditionEnd?.();
    else onPlayingChange(!playing);
  };

  const snapX = (x) => {
    const near = Math.abs(x - 0.5) < 0.025;
    setGuide(near);
    return near ? 0.5 : x;
  };
  const r3 = (n) => Math.round(n * 1000) / 1000;

  // Every drag handler gets where the thing was when the press began, never
  // where it is now: the movement is measured from the press, and applying it
  // to the current place would count it again on every re-render of the drag.
  // A caption drag moves every caption, or, with "One caption" chosen, only the
  // section that was pressed (origin.seg), which then keeps its own place.
  const moveCaption = (origin, dx, dy, key) =>
    onChange((d) => {
      const x = snapX(origin.x + dx);
      const y = origin.y + dy;
      if (origin.seg) {
        if (!Array.isArray(d.segments)) d.segments = segmentsOf(d);
        const s = d.segments.find((z) => z.id === origin.seg);
        if (!s) return;
        const p = captionPlacement(d, W, H, { ...s, custom: { ...(s.custom || {}), x, y } });
        s.custom = { ...(s.custom || {}), x: r3(p.x), y: r3(p.y) };
        return;
      }
      const p = captionPlacement({ ...d, captions: { ...d.captions, x, y } }, W, H);
      d.captions = { ...d.captions, x: r3(p.x), y: r3(p.y) };
    }, key);

  const moveText = (id) => (origin, dx, dy, key) =>
    onChange((d) => {
      const t = (d.texts || []).find((x) => x.id === id);
      if (!t) return;
      const p = textPlacement({ ...t, x: snapX(origin.x + dx), y: origin.y + dy }, W, H);
      t.x = r3(p.x);
      t.y = r3(p.y);
    }, key);

  const moveOverlay = (id, media) => (origin, dx, dy, key) =>
    onChange((d) => {
      const b = (d.broll || []).find((x) => x.id === id);
      if (!b) return;
      const p = pipPlacement({ ...b, x: snapX(origin.x + dx), y: origin.y + dy }, media, W, H);
      b.x = r3(p.x);
      b.y = r3(p.y);
    }, key);

  const resizeOverlay = (id, media) => (origin, dx, dy, key) =>
    onChange((d) => {
      const b = (d.broll || []).find((x) => x.id === id);
      if (!b) return;
      const p = pipPlacement({ ...b, w: Math.max(0.15, Math.min(1, origin.w + dx * 2)) }, media, W, H);
      b.w = r3(p.w);
      b.x = r3(p.x);
      b.y = r3(p.y);
    }, key);

  return (
    <div ref={outer} style={{ position: "relative", width: "100%", height: "100%", minHeight: 0, display: "grid", placeItems: "center" }}>
      <div
        onClick={toggle}
        role="button"
        tabIndex={-1}
        aria-label={playing ? "Pause preview" : "Play preview"}
        style={{ position: "relative", width: fw, height: fh, background: "#0C0C0C", borderRadius: 10, overflow: "hidden", cursor: "pointer" }}
      >
        {recordingIds.map((id) => (
          <video
            key={id}
            ref={(el) => {
              if (el) videos.current[id] = el;
              else delete videos.current[id];
            }}
            src={mediaById.get(id).proxy_url}
            playsInline
            preload="auto"
            style={{
              position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
              opacity: id === activeMedia ? 1 : 0, ...(recordingStyle || {}),
            }}
          />
        ))}

        {!audition && scale > 0 && overlay.brolls.map((b) => {
          const media = b.media ? mediaById.get(b.media) : null;
          if (!media) return null;
          if (b.layout === "pip") {
            const g = pipPlacement(b, media, W, H);
            const selected = selection.kind === "broll" && selection.id === b.id;
            const body = <BrollMedia media={media} fit="cover" id={b.id} refs={brollVideos} />;
            if (!editable) {
              return <div key={b.id} style={{ position: "absolute", left: g.left * scale, top: g.top * scale, width: g.pw * scale, height: g.ph * scale }}>{body}</div>;
            }
            return (
              <Movable
                key={b.id}
                label="Overlay: drag to move, pull the corner to resize"
                style={{ left: g.left * scale, top: g.top * scale, width: g.pw * scale, height: g.ph * scale }}
                frame={{ fw, fh }}
                selected={selected}
                onPress={() => onPick?.("broll", b.id)}
                origin={{ x: g.x, y: g.y, w: g.w }}
                onMove={moveOverlay(b.id, media)}
                onResize={resizeOverlay(b.id, media)}
                onEnd={() => setGuide(false)}
              >
                {body}
              </Movable>
            );
          }
          const rect = b.layout === "split" ? splitPanes(b, W, H).broll : { x: 0, y: 0, w: W, h: H };
          return (
            <div key={b.id} style={{ position: "absolute", left: rect.x * scale, top: rect.y * scale, width: rect.w * scale, height: rect.h * scale, overflow: "hidden", background: "#000" }}>
              {b.fit !== "cover" && (media.type === "image" ? media.image_url : media.thumb_url) && (
                <img
                  src={media.type === "image" ? media.image_url : media.thumb_url}
                  alt=""
                  style={{ position: "absolute", inset: "-8%", width: "116%", height: "116%", objectFit: "cover", filter: "blur(18px) brightness(.92)" }}
                />
              )}
              <BrollMedia media={media} fit={b.fit === "cover" ? "cover" : "contain"} id={b.id} refs={brollVideos} />
            </div>
          );
        })}

        {!audition && emptySlot && (
          <span style={chip(scale)}>
            <Icon.Camera size={Math.max(11, 30 * scale)} />
            {term} here: {emptySlot.label || "add a photo or clip"}
          </span>
        )}

        {!audition && overlay.cue && scale > 0 && (() => {
          const seg = overlay.cue.seg ? segById.get(overlay.cue.seg) : null;
          const look = captionLook(tl, seg);
          const p = captionPlacement(tl, W, H, seg);
          const style = { left: p.left * scale, width: p.boxW * scale, top: p.cy * scale, transform: "translateY(-50%)" };
          const body = <Caption text={overlay.cue.text} look={look} px={p.size * scale} />;
          if (!editable) return <div style={{ position: "absolute", pointerEvents: "none", ...style }}>{body}</div>;
          const one = captionScope === "one" && !!seg;
          return (
            <Movable
              label={one ? "Captions: drag to place this one" : "Captions: drag to place them anywhere"}
              style={style}
              frame={{ fw, fh }}
              hint={tab === "captions"}
              selected={!!seg && selection.kind === "caption" && selection.id === seg.id}
              onPress={() => onPick?.("caption", seg?.id || null)}
              origin={{ x: p.x, y: p.y, seg: one ? seg.id : null }}
              onMove={moveCaption}
              onEnd={() => setGuide(false)}
            >
              {body}
            </Movable>
          );
        })()}

        {showCaptionGuide && (
          <Movable
            label="Captions: drag to place them anywhere"
            style={{ left: cp.left * scale, width: cp.boxW * scale, top: cp.cy * scale, transform: "translateY(-50%)" }}
            frame={{ fw, fh }}
            hint
            origin={{ x: cp.x, y: cp.y }}
            onMove={moveCaption}
            onEnd={() => setGuide(false)}
          >
            <div style={{ textAlign: "center", opacity: 0.85 }}>
              <Caption text="Your captions show here" look={captionLook(tl)} px={cp.size * scale} />
            </div>
          </Movable>
        )}

        {!audition && scale > 0 && overlay.texts.map((t) => {
          const tp = textPlacement(t, W, H);
          const body = <TextBody item={t} px={tp.size * scale} />;
          const style = { left: tp.left * scale, width: tp.boxW * scale, top: tp.cy * scale, transform: "translateY(-50%)" };
          return editable ? (
            <Movable
              key={t.id}
              label="Text: drag to move"
              style={style}
              frame={{ fw, fh }}
              hint={tab === "text"}
              selected={selection.kind === "text" && selection.id === t.id}
              onPress={() => onPick?.("text", t.id)}
              origin={{ x: tp.x, y: tp.y }}
              onMove={moveText(t.id)}
              onEnd={() => setGuide(false)}
            >
              {body}
            </Movable>
          ) : (
            <div key={t.id} style={{ position: "absolute", pointerEvents: "none", ...style }}>{body}</div>
          );
        })}

        {guide && <span aria-hidden="true" style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, background: "rgba(255,214,0,.9)", pointerEvents: "none" }} />}

        {audition && (
          <span style={{ ...chip(scale), background: "rgba(255,255,255,.92)", color: "#111" }}>
            <Icon.Play size={Math.max(10, 26 * scale)} /> Hearing a take · tap to stop
          </span>
        )}

        {!clips.length && !audition && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#bbb", fontSize: 13, padding: 20, textAlign: "center" }}>
            Everything is turned off. Turn a part on to see the edit.
          </div>
        )}

        {!playing && !audition && clips.length > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
              width: 54, height: 54, borderRadius: "50%", background: "rgba(0,0,0,.45)", color: "#fff",
              display: "grid", placeItems: "center", pointerEvents: "none",
            }}
          >
            <Icon.Play size={24} />
          </span>
        )}
      </div>

      {(tl.audio || []).map((a) => (
        <audio
          key={a.id}
          ref={(el) => {
            if (el) audios.current[a.id] = el;
            else delete audios.current[a.id];
          }}
          src={mediaById.get(a.media)?.proxy_url || undefined}
          preload="auto"
        />
      ))}
    </div>
  );
}

function useBox(ref) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const set = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (Math.abs(s.w - r.width) < 0.5 && Math.abs(s.h - r.height) < 0.5 ? s : { w: r.width, h: r.height }));
    };
    set();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/**
 * Something on the frame that can be dragged, and optionally resized from its
 * corner. Movement is reported as a fraction of the frame since the press,
 * together with `origin` as it was at the press, so the caller applies it to
 * where the thing was when the drag began; every pointer move of one drag
 * shares one undo step.
 */
function Movable({ style, frame, origin, onPress, onMove, onResize, onEnd, selected = false, hint = false, label, children }) {
  const drag = useRef(null);
  const [hover, setHover] = useState(false);

  const down = (mode) => (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { mode, x0: e.clientX, y0: e.clientY, origin: { ...origin }, moved: false, key: `drag:${mode}:${e.timeStamp}` };
    onPress?.();
  };
  const move = (e) => {
    const d = drag.current;
    if (!d || !frame.fw || !frame.fh) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 3) return;
    d.moved = true;
    const dx = (e.clientX - d.x0) / frame.fw;
    const dy = (e.clientY - d.y0) / frame.fh;
    if (d.mode === "resize") onResize?.(d.origin, dx, dy, d.key);
    else onMove?.(d.origin, dx, dy, d.key);
  };
  const up = () => {
    if (drag.current) onEnd?.();
    drag.current = null;
  };

  const outline = selected ? "2px solid #FFD600" : hint || hover ? "1.5px dashed rgba(255,255,255,.85)" : "none";
  return (
    <div
      title={label}
      onPointerDown={down("move")}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onClick={(e) => e.stopPropagation()}
      style={{ position: "absolute", cursor: "move", touchAction: "none", userSelect: "none", outline, outlineOffset: 2, borderRadius: 4, ...style }}
    >
      {children}
      {onResize && selected && (
        <span
          role="presentation"
          onPointerDown={down("resize")}
          style={{
            position: "absolute", right: -9, bottom: -9, width: 18, height: 18, borderRadius: "50%",
            background: "#FFD600", border: "2px solid #111", cursor: "nwse-resize", touchAction: "none",
          }}
        />
      )}
    </div>
  );
}

function BrollMedia({ media, fit, id, refs }) {
  const style = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: fit, pointerEvents: "none" };
  if (media.type === "image") return <img src={media.image_url} alt="" draggable={false} style={style} />;
  return (
    <video
      ref={(el) => {
        if (el) refs.current[id] = el;
        else delete refs.current[id];
      }}
      src={media.proxy_url}
      muted
      playsInline
      preload="auto"
      style={style}
    />
  );
}

const chip = (scale) => ({
  position: "absolute", left: "4%", top: "3%", maxWidth: "92%",
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: `${Math.max(4, 14 * scale)}px ${Math.max(7, 24 * scale)}px`,
  borderRadius: 999, background: "rgba(0,0,0,.62)", color: "#fff",
  fontSize: Math.max(10.5, 34 * scale), fontWeight: 600, lineHeight: 1.2,
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", pointerEvents: "none",
});

function Caption({ text, look, px }) {
  const o = Math.max(1, px * 0.07);
  const style = look?.style || "bold";
  const deco = style === "box"
    ? { background: "rgba(0,0,0,.65)", padding: `${px * 0.1}px ${px * 0.22}px`, borderRadius: px * 0.14, boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }
    : style === "clean"
    ? { textShadow: `0 ${px * 0.05}px ${px * 0.18}px rgba(0,0,0,.75)` }
    : {
        textShadow: [
          `${o}px 0 0 #000`, `-${o}px 0 0 #000`, `0 ${o}px 0 #000`, `0 -${o}px 0 #000`,
          `${o * 0.7}px ${o * 0.7}px 0 #000`, `-${o * 0.7}px ${o * 0.7}px 0 #000`,
          `${o * 0.7}px -${o * 0.7}px 0 #000`, `-${o * 0.7}px -${o * 0.7}px 0 #000`,
        ].join(","),
      };
  return (
    <div style={{ textAlign: "center", lineHeight: 1.3 }}>
      <span className={hasIndic(text) ? "indic" : undefined} style={{ color: look?.color || "#fff", fontWeight: 800, fontSize: px, lineHeight: 1.3, ...deco }}>
        {text}
      </span>
    </div>
  );
}

function TextBody({ item, px }) {
  return (
    <div style={{ textAlign: "center" }}>
      <span
        className={hasIndic(item.text) ? "indic" : undefined}
        style={{
          display: "inline-block", color: "#fff", fontWeight: 750, fontSize: px, lineHeight: 1.3,
          background: "rgba(0,0,0,.9)", padding: `${px * 0.2}px ${px * 0.4}px`, borderRadius: px * 0.12,
        }}
      >
        {item.text}
      </span>
    </div>
  );
}
