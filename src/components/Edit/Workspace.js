import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { errorMessage } from "../../api";
import { alphabetName } from "../Order/ScriptToggle";
import { saveTimeline, removeMedia, renameProject, ackTranslation } from "./editApi";
import { ASPECTS, layout, clone, newId, withSegments, segmentsOf, placedSegments, anchorAt, splitClipAt, fitFor, splitPanes, cutAtSegments, joinParts } from "./model";
import Preview from "./Preview";
import ClipList from "./ClipList";
import CutsPanel from "./CutsPanel";
import BrollPanel, { IMAGE_OR_VIDEO, nameOf } from "./BrollPanel";
import CaptionsPanel from "./CaptionsPanel";
import AudioPanel from "./AudioPanel";
import TextPanel from "./TextPanel";
import Timeline from "./Timeline";
import ExportDialog from "./ExportDialog";
import { Btn, Icon, Notice, Range, Segmented, fmtTime } from "./ui";

// A video cut to a script opens on its lines. A video uploaded on its own opens
// on its captions, which are the reason most people upload one.
const TABS = {
  script: [
    ["script", "Script", Icon.Script],
    ["broll", "B-roll", Icon.Camera],
    ["captions", "Captions", Icon.Captions],
    ["audio", "Music", Icon.Music],
    ["text", "Text", Icon.Text],
  ],
  free: [
    ["captions", "Captions", Icon.Captions],
    ["video", "Video", Icon.Film],
    ["broll", "Media", Icon.Image],
    ["audio", "Music", Icon.Music],
    ["text", "Text", Icon.Text],
  ],
};

/**
 * Step three: the edit.
 *
 * ── THE EDIT IS LOCAL FIRST, SAVED BEHIND THE CREATOR ────────────────────────
 * Every change applies to the timeline in memory at once, and a save follows
 * 900 ms after the last one. A trim that waited on the network would feel like
 * wading. The save carries the revision it was based on; if another tab saved
 * in between, nothing is overwritten and the creator chooses which to keep.
 *
 * ── UNDO ─────────────────────────────────────────────────────────────────────
 * Each change pushes the previous timeline. Repeated changes to the same control
 * (twelve taps of a trim button, a drag) share a merge key and collapse into
 * one step, so undo takes back the trim, not the last tenth of a second of it.
 *
 * ── WORK THE SERVER FINISHES LANDS AS AN EDIT ────────────────────────────────
 * A caption translation runs on the server while editing carries on. Its result
 * waits on the project, not in the timeline, and is taken in here as one change
 * like any other: saved with the rest, and undoable.
 */
export default function Workspace({ data, config, isNarrow, uploads, onAddFiles, onRetryUpload, onDismissUpload, onData, onReload, onExit, onRecordings }) {
  const { project, script } = data;
  const mode = project.mode === "free" ? "free" : "script";
  // "B-roll" is a script's word, planned in its shot list. A video edited on its
  // own just has photos and clips added to it.
  const term = mode === "free" ? "Media" : "B-roll";

  const [tl, setTl] = useState(() => withSegments(project.timeline));
  const tlRef = useRef(tl);
  const pastRef = useRef([]);
  const futureRef = useRef([]);
  const merge = useRef({ key: null, at: 0 });

  const [tab, setTab] = useState(mode === "free" ? "captions" : "script");
  const [selection, setSelection] = useState({ kind: null, id: null });
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [seek, setSeek] = useState(null);
  const [stopAt, setStopAt] = useState(null);
  const [audition, setAudition] = useState(null);
  const [save, setSave] = useState({ state: "saved", message: "" });
  const [exportCost, setExportCost] = useState(project.pricing?.export || 0);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const [showRoman, setShowRoman] = useState(true);
  const [title, setTitle] = useState(project.headline || "");
  const [renaming, setRenaming] = useState(false);
  const [errorSeen, setErrorSeen] = useState("");
  const [waiting, setWaiting] = useState({});
  const [captionScope, setCaptionScope] = useState("all");

  const revRef = useRef(project.timeline_rev);
  const dirtyRef = useRef(false);
  const savingRef = useRef(null);
  const costRef = useRef(project.pricing?.export || 0);
  const timeRef = useRef(0);
  timeRef.current = time;

  const mediaById = useMemo(() => new Map(project.media.map((m) => [m.id, m])), [project.media]);
  const lay = useMemo(() => layout(tl), [tl]);
  const languages = config?.caption_languages || [];
  const readyAssets = useMemo(
    () => project.media.filter((m) => m.kind === "asset" && m.status === "ready" && (m.type === "image" || m.type === "video")),
    [project.media]
  );
  const hasRoman = useMemo(() => tl.clips.some((c) => c.roman) || segmentsOf(tl).some((s) => s.roman && s.roman !== s.text), [tl]);
  const nativeLabel = useMemo(() => {
    const sample = mode === "free"
      ? segmentsOf(tl).slice(0, 60).map((s) => s.text).join(" ")
      : (script?.lines || []).map((l) => l.text).join(" ");
    const label = alphabetName(sample, mode === "free" ? project.language_label : script?.language_label).label;
    return label === "Your voice" ? "Original" : label;
  }, [mode, tl, script, project.language_label]);

  const apply = useCallback((next) => {
    tlRef.current = next;
    dirtyRef.current = true;
    setTl(next);
  }, []);

  const change = useCallback((mutate, mergeKey) => {
    const prev = tlRef.current;
    const next = clone(prev);
    mutate(next);
    const now = Date.now();
    const same = mergeKey && merge.current.key === mergeKey && now - merge.current.at < 1500;
    merge.current = { key: mergeKey || null, at: now };
    if (!same) pastRef.current = [...pastRef.current.slice(-80), prev];
    futureRef.current = [];
    apply(next);
  }, [apply]);

  const undo = useCallback(() => {
    if (!pastRef.current.length) return;
    futureRef.current = [tlRef.current, ...futureRef.current].slice(0, 80);
    const prev = pastRef.current[pastRef.current.length - 1];
    pastRef.current = pastRef.current.slice(0, -1);
    merge.current = { key: null, at: 0 };
    apply(prev);
  }, [apply]);

  const redo = useCallback(() => {
    if (!futureRef.current.length) return;
    pastRef.current = [...pastRef.current, tlRef.current];
    const [next, ...rest] = futureRef.current;
    futureRef.current = rest;
    merge.current = { key: null, at: 0 };
    apply(next);
  }, [apply]);

  // ── Saving ────────────────────────────────────────────────────────────────
  const flush = useCallback(async () => {
    if (savingRef.current) await savingRef.current.catch(() => {});
    if (!dirtyRef.current) return true;
    const body = tlRef.current;
    dirtyRef.current = false;
    setSave({ state: "saving", message: "" });

    const attempt = (async () => {
      try {
        const res = await saveTimeline(project.id, body, revRef.current);
        revRef.current = res.rev;
        costRef.current = res.export_cost;
        setExportCost(res.export_cost);
        setSave({ state: dirtyRef.current ? "pending" : "saved", message: "" });
        return true;
      } catch (err) {
        const b = err?.response?.data;
        if (b?.conflict) {
          dirtyRef.current = true;
          setSave({ state: "conflict", message: b.message, rev: b.rev });
          return false;
        }
        dirtyRef.current = true;
        setSave({ state: "error", message: errorMessage(err, "Couldn't save. We'll keep trying.") });
        return false;
      }
    })();
    savingRef.current = attempt;
    const ok = await attempt;
    savingRef.current = null;
    if (ok && dirtyRef.current) return flush();
    return ok;
  }, [project.id]);

  useEffect(() => {
    if (!dirtyRef.current) return undefined;
    setSave((s) => (s.state === "conflict" ? s : { state: "pending", message: "" }));
    const t = setTimeout(() => { flush(); }, 900);
    return () => clearTimeout(t);
  }, [tl, flush]);

  useEffect(() => {
    if (save.state !== "error") return undefined;
    const t = setTimeout(() => { flush(); }, 5000);
    return () => clearTimeout(t);
  }, [save.state, flush]);

  // Unsaved changes are the one thing leaving can lose.
  useEffect(() => {
    const warn = (e) => {
      if (!dirtyRef.current && !savingRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  // The server changed the edit (removing a file it used): take its version,
  // as long as there is nothing local that would be lost by it.
  useEffect(() => {
    if (project.timeline_rev > revRef.current && !dirtyRef.current && !savingRef.current) {
      revRef.current = project.timeline_rev;
      const next = withSegments(project.timeline);
      tlRef.current = next;
      pastRef.current = [];
      futureRef.current = [];
      setTl(next);
      costRef.current = project.pricing?.export || 0;
      setExportCost(costRef.current);
    }
  }, [project.timeline_rev, project.timeline, project.pricing]);

  // A finished translation, taken into the edit once, then released on the server.
  const takenRef = useRef(null);
  useEffect(() => {
    const t = project.translation;
    if (!t || t.status !== "done" || !t.items || takenRef.current === t.id) return;
    takenRef.current = t.id;
    change((d) => {
      d.segments = segmentsOf(d).map((s) => (t.items[s.id] ? { ...s, tr: { ...(s.tr || {}), [t.lang]: t.items[s.id] } } : s));
      d.captions = { ...d.captions, mode: "tr", lang: t.lang };
    });
    ackTranslation(project.id, t.id).catch(() => {});
  }, [project.translation, project.id, change]);

  const keepMine = () => {
    if (save.rev) revRef.current = save.rev;
    setSave({ state: "pending", message: "" });
    flush();
  };
  const takeTheirs = async () => {
    dirtyRef.current = false;
    revRef.current = -1;
    setSave({ state: "saved", message: "" });
    await onReload();
  };

  // ── Files uploaded into a place land in it once they are ready ────────────
  const pendingRef = useRef([]);
  const assignWhenReady = useCallback((p) => {
    pendingRef.current.push(p);
    if (p.slot) setWaiting((w) => ({ ...w, [p.slot]: true }));
  }, []);
  useEffect(() => {
    if (!pendingRef.current.length) return;
    const keep = [];
    const settled = [];
    for (const p of pendingRef.current) {
      const m = mediaById.get(p.media);
      if (!m || ["uploading", "uploaded", "processing"].includes(m.status)) {
        keep.push(p);
        continue;
      }
      if (p.slot) settled.push(p.slot);
      if (m.status !== "ready") continue;
      if (p.type === "broll") {
        change((d) => {
          const b = d.broll.find((x) => x.id === p.slot);
          if (!b || b.media) return;
          const [W, H] = ASPECTS[d.aspect] || ASPECTS["9:16"];
          const box = b.layout === "split" ? splitPanes(b, W, H).broll : { w: W, h: H };
          b.media = m.id;
          b.media_in = 0;
          b.fit = fitFor(m, box.w, box.h);
          if (!b.label || b.label === "B-roll" || b.label === "Media") b.label = nameOf(m.filename);
          if (m.type === "video" && m.duration) {
            const L = layout(d);
            const pos = L.broll.find((x) => x.id === b.id);
            const room = pos && pos.start !== null ? L.duration - pos.start : m.duration;
            b.duration = p.grow ? Math.max(0.5, Math.round(Math.min(5, m.duration, room) * 10) / 10) : Math.min(b.duration, m.duration);
          }
        });
      } else if (p.type === "audio") {
        change((d) => {
          d.audio = [...(d.audio || []), {
            id: newId("au"), media: m.id, start: 0, in: 0,
            duration: Math.max(1, Math.min(m.duration || 30, layout(d).duration || m.duration || 30)),
            volume: 0.25, fade_in: 1, fade_out: 2,
          }];
        });
      }
    }
    pendingRef.current = keep;
    if (settled.length) {
      setWaiting((w) => {
        const next = { ...w };
        for (const id of settled) delete next[id];
        return next;
      });
    }
  }, [mediaById, change]);

  const removeAsset = useCallback(async (id) => {
    setNotice("");
    await flush();
    try {
      onData(await removeMedia(project.id, id));
    } catch (err) {
      setNotice(errorMessage(err));
    }
  }, [flush, onData, project.id]);

  // ── Playhead ──────────────────────────────────────────────────────────────
  const seekTo = useCallback((t) => {
    setAudition(null);
    setStopAt(null);
    setPlaying(false);
    setSeek((s) => ({ t, n: (s?.n || 0) + 1 }));
    setTime(t);
  }, []);

  const playRange = useCallback((start, end) => {
    setAudition(null);
    setSeek((s) => ({ t: start, n: (s?.n || 0) + 1 }));
    setTime(start);
    setStopAt(end);
    setPlaying(true);
  }, []);

  const togglePlay = useCallback(() => {
    setAudition(null);
    setStopAt(null);
    setPlaying((p) => !p);
  }, []);

  const auditionRange = useCallback((range) => {
    setPlaying(false);
    setAudition(range);
  }, []);

  const select = useCallback((kind, id) => {
    setSelection({ kind, id });
    if (kind === "clip") {
      const c = lay.clips.find((x) => x.id === id);
      if (c && c.start !== null && !playing) seekTo(c.start);
    } else if (kind === "caption") {
      const p = placedSegments(tlRef.current).find((x) => x.seg.id === id);
      if (p && !playing) seekTo(p.start + 0.01);
    }
  }, [lay, playing, seekTo]);

  const selectCaption = useCallback((id) => select("caption", id), [select]);

  // Something pressed on the preview itself.
  const pick = useCallback((kind, id) => {
    if (kind === "caption") {
      setTab("captions");
      if (id) setSelection({ kind: "caption", id });
      return;
    }
    setSelection({ kind, id });
    setTab(kind === "text" ? "text" : "broll");
  }, []);

  // ── B-roll at a moment ────────────────────────────────────────────────────
  const addBrollAt = useCallback((t, mediaId = null, label = "") => {
    const cur = tlRef.current;
    const L = layout(cur);
    if (!L.duration) return null;
    const at = anchorAt(L, Math.min(Math.max(0, t), L.duration - 0.05));
    if (!at) return null;
    const m = mediaId ? mediaById.get(mediaId) : null;
    const [W, H] = ASPECTS[cur.aspect] || ASPECTS["9:16"];
    const start = at.clip.start + at.offset;
    const room = Math.max(0.5, L.duration - start);
    const want = m?.type === "video" ? Math.min(5, m.duration || 5) : 3;
    const id = newId("br");
    change((d) => {
      d.broll = [...(d.broll || []), {
        id, shot: null, label: m ? nameOf(m.filename) : label || term, source: "",
        clip: at.clip.id, offset: Math.round(at.offset * 100) / 100,
        duration: Math.max(0.5, Math.round(Math.min(want, room) * 10) / 10),
        media: m ? m.id : null, media_in: 0, fit: m ? fitFor(m, W, H) : "contain",
        layout: "full", side: "top", ratio: 0.5, x: null, y: null, w: null,
      }];
    });
    setSelection({ kind: "broll", id });
    setTab("broll");
    seekTo(start + 0.01);
    return id;
  }, [change, mediaById, seekTo, term]);

  const uploadBrollAt = useCallback((t, files) => {
    const file = files?.[0];
    if (!file) return;
    const id = addBrollAt(t, null, nameOf(file.name));
    if (!id) return;
    onAddFiles([file], "asset", { onMedia: (mediaId) => assignWhenReady({ type: "broll", slot: id, media: mediaId, grow: true }) });
  }, [addBrollAt, onAddFiles, assignWhenReady]);

  const brollInput = useRef(null);
  const brollAt = useRef(0);
  const pickBrollFile = useCallback((t) => {
    brollAt.current = t;
    brollInput.current?.click();
  }, []);

  // ── Cutting a video uploaded on its own ───────────────────────────────────
  const splitAtPlayhead = useCallback(() => {
    if (!splitClipAt(clone(tlRef.current), timeRef.current)) {
      setNotice("Move the playhead inside a part, a little away from its ends, to split it there.");
      return;
    }
    let made = null;
    change((d) => { made = splitClipAt(d, timeRef.current); });
    if (made) setSelection({ kind: "clip", id: made });
  }, [change]);

  // A part per caption, with or without the pauses between (model.js cutAtSegments).
  const autoCut = useCallback((pauses) => {
    if (!cutAtSegments(tlRef.current, { pauses }).changed) {
      setNotice(pauses ? "There are no pauses left to cut out." : "Every part already holds a single caption, so there is nothing to cut.");
      return;
    }
    change((d) => { Object.assign(d, cutAtSegments(d, { pauses }).timeline); });
    setSelection({ kind: null, id: null });
  }, [change]);

  const joinAll = useCallback(() => { change((d) => { joinParts(d); }); }, [change]);

  useEffect(() => {
    const onKey = (e) => {
      const tag = String(e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || e.target?.isContentEditable) return;
      if (exporting) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (e.key === " " && !mod) {
        e.preventDefault();
        togglePlay();
      } else if (!mod && mode === "free" && e.key.toLowerCase() === "s") {
        e.preventDefault();
        splitAtPlayhead();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (tag === "button" && e.target.getAttribute("role") === "tab") return;
        e.preventDefault();
        const step = e.shiftKey ? 1 : 0.1;
        seekTo(Math.max(0, Math.min(lay.duration, timeRef.current + (e.key === "ArrowLeft" ? -step : step))));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, togglePlay, seekTo, lay.duration, exporting, mode, splitAtPlayhead]);

  // ── The name ──────────────────────────────────────────────────────────────
  async function commitName(value) {
    setRenaming(false);
    const name = String(value || "").replace(/\s+/g, " ").trim();
    if (!name || name === title) return;
    const before = title;
    setTitle(name);
    try {
      await renameProject(project.id, name);
    } catch (err) {
      setTitle(before);
      setNotice(errorMessage(err));
    }
  }

  // ── Panels ────────────────────────────────────────────────────────────────
  const sel = (kind) => (selection.kind === kind ? selection.id : null);
  const common = { tl, lay, mediaById, onChange: change };

  const panel = {
    script: (
      <>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {hasRoman ? (
            <Segmented
              size="s"
              label="Show lines in"
              value={showRoman ? "roman" : "native"}
              onChange={(v) => setShowRoman(v === "roman")}
              options={[{ value: "roman", label: "Roman" }, { value: "native", label: nativeLabel, indic: /[ऀ-෿]/.test(nativeLabel) }]}
            />
          ) : <span />}
          <Btn size="s" icon={<Icon.Film size={14} />} onClick={async () => { await flush(); onRecordings(); }}>Recordings</Btn>
        </div>
        <ClipList
          {...common}
          selectedId={sel("clip")}
          onSelect={(id) => select("clip", id)}
          onPlayRange={playRange}
          onAudition={auditionRange}
          showRoman={showRoman}
        />
      </>
    ),
    video: (
      <CutsPanel
        {...common}
        time={time}
        selectedId={sel("clip")}
        onSelect={(id) => select("clip", id)}
        onPlayRange={playRange}
        onSplit={splitAtPlayhead}
        onAutoCut={autoCut}
        onJoin={joinAll}
        onRecordings={async () => { await flush(); onRecordings(); }}
      />
    ),
    broll: (
      <BrollPanel
        {...common}
        media={project.media}
        uploads={uploads}
        checklist={script?.checklist || []}
        time={time}
        waiting={waiting}
        selectedId={sel("broll")}
        onSelect={(id) => select("broll", id)}
        onSeek={seekTo}
        onAddFiles={onAddFiles}
        onRetryUpload={onRetryUpload}
        onDismissUpload={onDismissUpload}
        onRemoveMedia={removeAsset}
        onAssignWhenReady={assignWhenReady}
        onUploadAt={uploadBrollAt}
        isNarrow={isNarrow}
        term={term}
      />
    ),
    captions: (
      <CaptionsPanel
        tl={tl}
        lay={lay}
        mode={mode}
        project={project}
        languages={languages}
        nativeLabel={nativeLabel}
        hasRoman={hasRoman}
        time={time}
        playing={playing}
        onChange={change}
        onSeek={seekTo}
        onFlush={flush}
        onData={onData}
        onReload={onReload}
        selectedId={sel("caption")}
        scope={captionScope}
        onScope={setCaptionScope}
        onSelectCaption={selectCaption}
      />
    ),
    audio: (
      <AudioPanel
        tl={tl}
        lay={lay}
        media={project.media}
        uploads={uploads}
        time={time}
        onChange={change}
        onAddFiles={onAddFiles}
        onRemoveMedia={removeAsset}
        onRetryUpload={onRetryUpload}
        onDismissUpload={onDismissUpload}
        onAssignWhenReady={assignWhenReady}
      />
    ),
    text: (
      <TextPanel
        tl={tl}
        lay={lay}
        time={time}
        selectedId={sel("text")}
        onSelect={(id) => select("text", id)}
        onChange={change}
        onSeek={seekTo}
      />
    ),
  }[tab];

  const preview = (
    <Preview
      tl={tl}
      mediaById={mediaById}
      playing={playing}
      onPlayingChange={setPlaying}
      seek={seek}
      onTime={setTime}
      stopAt={stopAt}
      audition={audition}
      onAuditionEnd={() => setAudition(null)}
      tab={tab}
      selection={selection}
      onChange={change}
      onPick={pick}
      captionScope={captionScope}
      term={term}
    />
  );

  const activeRender = project.renders.some((r) => r.status === "queued" || r.status === "rendering");
  const saveLabel = {
    saved: "Saved",
    pending: "Saving…",
    saving: "Saving…",
    error: "Not saved",
    conflict: "Changed elsewhere",
  }[save.state];

  const header = (
    <header style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: isNarrow ? "8px 10px" : "9px 14px", borderBottom: "1px solid var(--line)", background: "var(--card)", minHeight: 54 }}>
      <Btn kind="quiet" size="s" aria-label="Back" icon={<Icon.Back />} onClick={async () => { await flush(); onExit(); }} style={{ padding: "6px 8px" }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        {renaming ? (
          <input
            autoFocus
            defaultValue={title}
            maxLength={120}
            aria-label="Video name"
            onBlur={(e) => commitName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                e.currentTarget.value = title;
                e.currentTarget.blur();
              }
            }}
            style={{ width: "100%", fontSize: isNarrow ? 13.5 : 14.5, fontWeight: 650, color: "var(--ink)", padding: "3px 6px", borderRadius: 7, border: "1px solid var(--line)", outline: "none", fontFamily: "inherit" }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setRenaming(true)}
            title="Rename"
            style={{ display: "flex", alignItems: "center", gap: 6, maxWidth: "100%", border: "none", background: "none", padding: 0, cursor: "text", fontFamily: "inherit", textAlign: "left" }}
          >
            <span style={{ fontSize: isNarrow ? 13.5 : 14.5, fontWeight: 650, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {title || "Untitled"}
            </span>
            <span style={{ color: "var(--ink-mute)", flexShrink: 0 }}><Icon.Pencil size={12} /></span>
          </button>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: save.state === "error" || save.state === "conflict" ? "var(--bad)" : "var(--ink-mute)" }}>
          {save.state === "saved" && <Icon.Check size={11} />}
          {saveLabel} · {fmtTime(lay.duration, false)}
        </div>
      </div>
      <Btn kind="quiet" size="s" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!pastRef.current.length} onClick={undo} icon={<Icon.Undo />} style={{ padding: 7 }} />
      <Btn kind="quiet" size="s" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!futureRef.current.length} onClick={redo} icon={<Icon.Redo />} style={{ padding: 7 }} />
      {!isNarrow && (
        <Segmented
          size="s"
          label="Frame"
          value={tl.aspect}
          onChange={(v) => change((d) => { d.aspect = v; })}
          options={[
            { value: "9:16", label: "9:16", title: "Shorts, Reels" },
            { value: "16:9", label: "16:9", title: "YouTube" },
            { value: "1:1", label: "1:1", title: "Square" },
            { value: "4:5", label: "4:5", title: "Feed" },
          ]}
        />
      )}
      <Btn kind="primary" size="s" icon={<Icon.Download size={14} />} onClick={() => { setPlaying(false); setExporting(true); }} style={{ marginLeft: 4 }}>
        {activeRender ? "Exporting…" : "Export"}
      </Btn>
    </header>
  );

  const banners = (
    <>
      {save.state === "conflict" && (
        <div style={{ padding: "8px 12px 0" }}>
          <Notice tone="warn" action={<span style={{ display: "flex", gap: 6 }}><Btn size="s" onClick={keepMine}>Keep mine</Btn><Btn size="s" onClick={takeTheirs}>Load the other</Btn></span>}>
            This edit was saved from another tab or device.
          </Notice>
        </div>
      )}
      {save.state === "error" && (
        <div style={{ padding: "8px 12px 0" }}>
          <Notice tone="bad" action={<Btn size="s" onClick={flush}>Retry now</Btn>}>{save.message}</Notice>
        </div>
      )}
      {project.error && project.status === "ready" && project.error !== errorSeen && (
        <div style={{ padding: "8px 12px 0" }}>
          <Notice tone="warn" action={<Btn size="s" onClick={() => setErrorSeen(project.error)}>OK</Btn>}>{project.error}</Notice>
        </div>
      )}
      {notice && (
        <div style={{ padding: "8px 12px 0" }}>
          <Notice tone="bad" action={<Btn size="s" kind="quiet" onClick={() => setNotice("")} aria-label="Dismiss" icon={<Icon.Close size={13} />} />}>{notice}</Notice>
        </div>
      )}
    </>
  );

  const tabs = (
    <div role="tablist" aria-label="Edit" className="hg-scroll" style={{ display: "flex", gap: 2, overflowX: "auto", overflowY: "hidden", padding: "0 8px", borderBottom: "1px solid var(--line)", background: "var(--card)", flexShrink: 0 }}>
      {TABS[mode].map(([id, label, TabIcon]) => {
        const on = tab === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => setTab(id)}
            style={{
              flex: isNarrow ? "1 0 auto" : "0 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "11px 12px 9px", border: "none", borderBottom: `2px solid ${on ? "var(--ink)" : "transparent"}`,
              marginBottom: -1, background: "none", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
              fontSize: 13, fontWeight: on ? 650 : 550, color: on ? "var(--ink)" : "var(--ink-mute)",
            }}
          >
            <TabIcon size={14} />
            {label}
          </button>
        );
      })}
    </div>
  );

  const transport = (
    <Transport
      time={time}
      duration={lay.duration}
      playing={playing}
      onToggle={togglePlay}
      onScrub={seekTo}
      compact={isNarrow}
    />
  );

  const dialog = exporting && (
    <ExportDialog
      project={project}
      tl={tl}
      lay={lay}
      price={exportCost}
      config={config}
      languages={languages}
      nativeLabel={nativeLabel}
      term={term}
      onFlush={flush}
      priceNow={() => costRef.current}
      onAspect={(v) => change((d) => { d.aspect = v; })}
      onData={onData}
      onClose={() => setExporting(false)}
    />
  );

  const brollFile = (
    <input
      ref={brollInput}
      type="file"
      accept={IMAGE_OR_VIDEO}
      style={{ display: "none" }}
      onChange={(e) => {
        const list = Array.from(e.target.files || []);
        e.target.value = "";
        if (list.length) uploadBrollAt(brollAt.current, list);
      }}
    />
  );

  if (isNarrow) {
    return (
      <>
        {header}
        {banners}
        <div style={{ flexShrink: 0, height: "min(44vh, 400px)", padding: "10px 12px 4px", background: "#EFEDE9" }}>{preview}</div>
        {transport}
        {tabs}
        <div className="hg-scroll" style={{ flex: 1, minHeight: 0, padding: "12px 14px 28px" }}>{panel}</div>
        {dialog}
        {brollFile}
      </>
    );
  }

  return (
    <>
      {header}
      {banners}
      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(380px, 460px)", gridTemplateRows: "minmax(0,1fr) auto" }}>
        <div style={{ gridColumn: 1, gridRow: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "14px 18px 8px", background: "#EFEDE9" }}>
          <div style={{ flex: 1, minHeight: 0 }}>{preview}</div>
          {transport}
        </div>
        <aside style={{ gridColumn: 2, gridRow: "1 / span 2", minHeight: 0, display: "flex", flexDirection: "column", borderLeft: "1px solid var(--line)", background: "var(--paper)" }}>
          {tabs}
          <div className="hg-scroll" style={{ flex: 1, minHeight: 0, padding: "14px 16px 28px" }}>{panel}</div>
        </aside>
        <div style={{ gridColumn: 1, gridRow: 2, borderTop: "1px solid var(--line)", background: "var(--card)", minWidth: 0 }}>
          <Timeline
            tl={tl}
            lay={lay}
            mediaById={mediaById}
            mode={mode}
            time={time}
            playing={playing}
            selection={selection}
            assets={readyAssets}
            term={term}
            waiting={waiting}
            onSelect={(kind, id) => {
              select(kind, id);
              setTab({ clip: mode === "free" ? "video" : "script", broll: "broll", text: "text", audio: "audio", caption: "captions" }[kind] || tab);
            }}
            onSeek={seekTo}
            onChange={change}
            onSplit={splitAtPlayhead}
            onAutoCut={autoCut}
            onJoin={joinAll}
            onAddBrollAt={addBrollAt}
            onUploadBrollAt={pickBrollFile}
          />
        </div>
      </div>
      {dialog}
      {brollFile}
    </>
  );
}

function Transport({ time, duration, playing, onToggle, onScrub, compact }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: compact ? "6px 14px 8px" : "10px 2px 2px", flexShrink: 0, background: compact ? "#EFEDE9" : "transparent" }}>
      <Btn
        kind="primary"
        size="s"
        onClick={onToggle}
        aria-label={playing ? "Pause" : "Play"}
        icon={playing ? <Icon.Pause size={14} /> : <Icon.Play size={14} />}
        style={{ width: 40, height: 36, padding: 0 }}
      />
      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
        {fmtTime(time)} <span style={{ color: "var(--ink-mute)", fontWeight: 500 }}>/ {fmtTime(duration)}</span>
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Range label="Playhead" value={Math.min(time, duration)} min={0} max={Math.max(0.1, duration)} step={0.05} onChange={onScrub} />
      </div>
    </div>
  );
}
