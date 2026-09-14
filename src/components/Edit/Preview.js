import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import { ASPECTS, layout, captionCues, activeClipIndex, hasIndic } from "./model";
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
 * Overlays are decided per frame from the same layout() the server renders with
 * (model.js). They are HTML, not burnt in, so they are close to the export and
 * not identical to it: sizes and positions follow the same fractions of the
 * frame; the exact glyph shapes are the browser's.
 *
 * ── AUDITION ─────────────────────────────────────────────────────────────────
 * Hearing an alternate take, or a stretch of speech that matched no line, plays
 * that range of the recording directly, outside the timeline, with the overlays
 * hidden so it is obvious this is not the edit.
 */
export default function Preview({ tl, mediaById, playing, onPlayingChange, seek, onTime, stopAt = null, audition = null, onAuditionEnd }) {
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
  const recordingIds = useMemo(() => {
    const ids = new Set(clips.map((c) => c.media));
    if (audition?.media) ids.add(audition.media);
    return [...ids].filter((id) => mediaById.get(id)?.proxy_url);
  }, [clips, audition, mediaById]);

  const videos = useRef({});
  const audios = useRef({});
  const brollVideo = useRef(null);
  const tRef = useRef(0);
  const idxRef = useRef(-1);
  const lastReport = useRef(0);
  const live = useRef({});
  live.current = { lay, clips, cues, tl, mediaById, stopAt, onTime, onPlayingChange, playing, onAuditionEnd };

  const [activeMedia, setActiveMedia] = useState(null);
  const [overlay, setOverlay] = useState({ broll: null, cue: null, texts: [] });

  /** Everything that depends only on output time: overlays, B-roll video, music. */
  const paint = useCallback((t) => {
    const { lay: L, cues: C, tl: T, mediaById: M, playing: P } = live.current;
    let b = null;
    for (const x of L.broll) if (x.start !== null && t >= x.start && t < x.end) b = x;
    const cue = C.find((c) => t >= c.start && t < c.end) || null;
    const texts = (T.texts || []).filter((x) => t >= x.start && t < x.start + x.duration);
    setOverlay((o) =>
      o.broll?.id === b?.id && o.broll?.media === b?.media && o.broll?.fit === b?.fit &&
      o.cue?.start === cue?.start && o.cue?.text === cue?.text &&
      o.texts.length === texts.length && o.texts.every((x, i) => x === texts[i])
        ? o
        : { broll: b, cue, texts }
    );

    const bv = brollVideo.current;
    if (bv && b?.media && M.get(b.media)?.type === "video") {
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

  // A trim under a paused playhead shows its new frame at once.
  useEffect(() => {
    if (!live.current.playing && !audition) place(tRef.current);
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
    if (brollVideo.current && !brollVideo.current.paused) brollVideo.current.pause();
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
  const short = Math.min(W, H);
  const cap = tl.captions || {};
  const capPx = short * (cap.style === "clean" ? 0.062 : 0.075) * ({ s: 0.8, m: 1, l: 1.25 }[cap.size] || 1) * scale;
  const brollMedia = overlay.broll?.media ? mediaById.get(overlay.broll.media) : null;

  const toggle = () => {
    if (audition) live.current.onAuditionEnd?.();
    else onPlayingChange(!playing);
  };

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
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: id === activeMedia ? 1 : 0 }}
          />
        ))}

        {!audition && brollMedia && <Broll media={brollMedia} slot={overlay.broll} videoRef={brollVideo} />}

        {!audition && !brollMedia && overlay.broll && (
          <span style={chip(scale)}>
            <Icon.Camera size={Math.max(11, 30 * scale)} />
            B-roll here: {overlay.broll.label || "add a clip or image"}
          </span>
        )}

        {!audition && overlay.cue && capPx > 0 && (
          <Caption text={overlay.cue.text} cap={cap} px={capPx} portrait={H > W} />
        )}

        {!audition && scale > 0 && overlay.texts.map((t) => <TextOverlay key={t.id} item={t} scale={scale} W={W} H={H} />)}

        {audition && (
          <span style={{ ...chip(scale), background: "rgba(255,255,255,.92)", color: "#111" }}>
            <Icon.Play size={Math.max(10, 26 * scale)} /> Hearing a take · tap to stop
          </span>
        )}

        {!clips.length && !audition && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#bbb", fontSize: 13, padding: 20, textAlign: "center" }}>
            Every line is turned off. Turn one on to see the edit.
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

const chip = (scale) => ({
  position: "absolute", left: "4%", top: "3%", maxWidth: "92%",
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: `${Math.max(4, 14 * scale)}px ${Math.max(7, 24 * scale)}px`,
  borderRadius: 999, background: "rgba(0,0,0,.62)", color: "#fff",
  fontSize: Math.max(10.5, 34 * scale), fontWeight: 600, lineHeight: 1.2,
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", pointerEvents: "none",
});

function Broll({ media, slot, videoRef }) {
  const contain = slot.fit !== "cover";
  const fill = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: contain ? "contain" : "cover" };
  const bg = media.type === "image" ? media.image_url : media.thumb_url;
  return (
    <div style={{ position: "absolute", inset: 0, background: "#000", overflow: "hidden" }}>
      {contain && bg && (
        <img
          src={bg}
          alt=""
          style={{ position: "absolute", inset: "-8%", width: "116%", height: "116%", objectFit: "cover", filter: "blur(18px) brightness(.92)" }}
        />
      )}
      {media.type === "image"
        ? <img src={media.image_url} alt="" style={fill} />
        : <video ref={videoRef} src={media.proxy_url} muted playsInline preload="auto" style={fill} />}
    </div>
  );
}

function Caption({ text, cap, px, portrait }) {
  const o = Math.max(1, px * 0.07);
  const pos = cap.position === "middle"
    ? { top: "50%", transform: "translateY(-50%)" }
    : { bottom: portrait ? "20%" : "9%" };
  const look = cap.style === "box"
    ? { background: "rgba(0,0,0,.65)", padding: `${px * 0.1}px ${px * 0.22}px`, borderRadius: px * 0.14, boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }
    : cap.style === "clean"
    ? { textShadow: `0 ${px * 0.05}px ${px * 0.18}px rgba(0,0,0,.75)` }
    : {
        textShadow: [
          `${o}px 0 0 #000`, `-${o}px 0 0 #000`, `0 ${o}px 0 #000`, `0 -${o}px 0 #000`,
          `${o * 0.7}px ${o * 0.7}px 0 #000`, `-${o * 0.7}px ${o * 0.7}px 0 #000`,
          `${o * 0.7}px -${o * 0.7}px 0 #000`, `-${o * 0.7}px -${o * 0.7}px 0 #000`,
        ].join(","),
      };
  return (
    <div style={{ position: "absolute", left: "8%", right: "8%", textAlign: "center", pointerEvents: "none", ...pos }}>
      <span
        className={hasIndic(text) ? "indic" : undefined}
        style={{ color: "#fff", fontWeight: 800, fontSize: px, lineHeight: 1.3, ...look }}
      >
        {text}
      </span>
    </div>
  );
}

function TextOverlay({ item, scale, W, H }) {
  const px = Math.min(W, H) * ({ s: 0.05, m: 0.064, l: 0.085 }[item.size] || 0.064) * scale;
  const edge = H > W ? "12%" : "7%";
  const pos = item.position === "middle"
    ? { top: "50%", transform: "translateY(-50%)" }
    : item.position === "bottom" ? { bottom: edge } : { top: edge };
  return (
    <div style={{ position: "absolute", left: "7%", right: "7%", textAlign: "center", pointerEvents: "none", ...pos }}>
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
