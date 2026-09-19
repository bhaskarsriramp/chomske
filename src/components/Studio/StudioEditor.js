/**
 * StudioEditor.js: where a creator changes what the AI decided.
 *
 * ── THE DOCUMENT LIVES HERE ──────────────────────────────────────────────────
 * One timeline, one undo stack, one autosave. Every panel, the preview and the
 * ruler all describe changes to it through `edit()` and none of them holds a
 * copy. That is what lets the same change arrive from a slider, from a drag on
 * the picture, from a chip on the timeline, or from applying one of the
 * reviewer's suggestions, and behave identically in all four.
 *
 * ── SAVING IS NOT A BUTTON ───────────────────────────────────────────────────
 * Edits are written a second after the last one, and on the way out. `rev` is
 * what the browser last read; a mismatch means another tab saved in between, and
 * the answer is to reload rather than to overwrite work this tab never saw.
 *
 * ── AN EDIT IS NAMED ─────────────────────────────────────────────────────────
 * Every call to `edit()` carries a label — "Zoom level", "Add blur". It is what
 * undo announces, and it is also what makes a run of small changes to the same
 * control collapse into one undo step instead of forty.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onLiveEvent } from "../../realtime/socket";
import { getDemo, saveTimeline, renameDemo, requestCaptions, requestReview, resolveSuggestion } from "./studioApi";
import { Thinking } from "./RecordPage";
import Preview from "./Preview";
import Timeline from "./Timeline";
import ExportDialog from "./ExportDialog";
import { ZoomPanel, BlurPanel, CaptionsPanel, NotesPanel, CursorPanel, CanvasPanel, StepsPanel, SuggestionsPanel } from "./panels";
import { Btn, Icon, Segmented } from "./ui";
import { layout, newId, clamp, fmtTime, mergedCuts } from "./model";
import "./studio.css";

const TABS = [
  { id: "steps", label: "Steps", icon: "steps" },
  { id: "zoom", label: "Zoom", icon: "zoom" },
  { id: "blur", label: "Blur", icon: "blur" },
  { id: "captions", label: "Captions", icon: "caption" },
  { id: "notes", label: "Notes", icon: "note" },
  { id: "cursor", label: "Cursor", icon: "cursor" },
  { id: "canvas", label: "Canvas", icon: "canvas" },
  { id: "review", label: "Review", icon: "sparkle" },
];

/** Changes closer together than this, to the same thing, are one undo step. */
const COALESCE_MS = 700;
const SAVE_MS = 1000;

export default function StudioEditor({ demoId, config, onExit, onAnalyse }) {
  const [demo, setDemo] = useState(null);
  const [tl, setTl] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [tab, setTab] = useState("steps");
  const [selection, setSelection] = useState(null);
  const [time, setTime] = useState(0);
  const [seekTo, setSeekTo] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [captioning, setCaptioning] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const undo = useRef([]);
  const redo = useRef([]);
  const lastEdit = useRef({ label: "", at: 0 });
  const saveTimer = useRef(null);
  const dirty = useRef(false);
  const revRef = useRef(0);
  const tlRef = useRef(null);
  tlRef.current = tl;

  /* ── Loading ──────────────────────────────────────────────────────────── */

  const load = useCallback(
    async (quiet = false) => {
      try {
        const d = await getDemo(demoId);
        setDemo(d.demo);
        revRef.current = d.demo.rev;
        // An edit in flight must not be rolled back by a poll that answered
        // after it. Only the server's copy is taken when this tab has nothing
        // unsaved of its own.
        if (d.demo.timeline && !dirty.current) setTl(d.demo.timeline);
        if (!quiet) setError("");
      } catch (err) {
        setError(err?.response?.data?.message || "We couldn't open this recording.");
      }
    },
    [demoId]
  );

  useEffect(() => {
    load();
  }, [load]);

  // The server says when something it is running has moved on. Polling as a
  // safety net only, and slowly: the socket is the real mechanism and a poll
  // every four seconds is what covers a dropped connection.
  useEffect(() => {
    const off = onLiveEvent("studio:update", (e) => {
      if (String(e?.demo) !== String(demoId)) return;
      if (e.notice) setNotice(e.notice);
      if (e.captioning === false) setCaptioning(false);
      if (e.reviewed) setReviewing(false);
      load(true);
    });
    const id = setInterval(() => {
      const busy = demo?.status === "analysing" || demo?.status === "preparing" || demo?.renders?.some((r) => r.status === "queued" || r.status === "rendering") || captioning || reviewing;
      if (busy) load(true);
    }, 4000);
    return () => {
      off();
      clearInterval(id);
    };
  }, [demoId, load, demo?.status, demo?.renders, captioning, reviewing]);

  /* ── Editing ──────────────────────────────────────────────────────────── */

  const save = useCallback(async () => {
    const current = tlRef.current;
    if (!current || !dirty.current) return;
    dirty.current = false;
    try {
      const res = await saveTimeline(demoId, current, revRef.current);
      revRef.current = res.rev;
    } catch (err) {
      if (err?.response?.data?.stale) {
        setNotice("This recording changed in another tab, so it was reloaded.");
        dirty.current = false;
        load(true);
      } else {
        // Put the flag back: the next edit, or leaving the page, tries again.
        dirty.current = true;
        setNotice("Your last change hasn't saved yet. It will keep trying.");
      }
    }
  }, [demoId, load]);

  /**
   * ── THE UNDO STACK IS BUILT OUTSIDE THE UPDATER ────────────────────────────
   * Pushing to `undo` inside `setTl(prev => …)` reads naturally and is wrong:
   * React 18 invokes state updaters TWICE under StrictMode, which this app runs
   * in (src/index.js). Every edit would push two identical entries, and the
   * first press of Undo would appear to do nothing because it only unwound the
   * duplicate. Updaters have to be pure; the ref is read directly instead, and
   * written back so a burst of edits inside one tick still chains correctly.
   */
  const edit = useCallback(
    (patch, label = "Edit") => {
      const prev = tlRef.current;
      if (!prev) return;

      const now = Date.now();
      const same = lastEdit.current.label === label && now - lastEdit.current.at < COALESCE_MS;
      if (!same) {
        undo.current.push({ tl: prev, label });
        if (undo.current.length > 60) undo.current.shift();
        redo.current = [];
      }
      lastEdit.current = { label, at: now };

      const next = { ...prev, ...patch };
      tlRef.current = next;
      setTl(next);

      dirty.current = true;
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(save, SAVE_MS);
    },
    [save]
  );

  const stepBack = useCallback(() => {
    const last = undo.current.pop();
    if (!last) return;
    redo.current.push({ tl: tlRef.current, label: last.label });
    tlRef.current = last.tl;
    setTl(last.tl);
    lastEdit.current = { label: "", at: 0 };
    dirty.current = true;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, SAVE_MS);
  }, [save]);

  const stepForward = useCallback(() => {
    const next = redo.current.pop();
    if (!next) return;
    undo.current.push({ tl: tlRef.current, label: next.label });
    tlRef.current = next.tl;
    setTl(next.tl);
    dirty.current = true;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, SAVE_MS);
  }, [save]);

  // Leaving with something unsaved writes it first.
  useEffect(
    () => () => {
      clearTimeout(saveTimer.current);
      if (dirty.current) save();
    },
    [save]
  );

  /* ── A change to one item, from a panel, the ruler or the picture ─────── */

  const changeItem = useCallback(
    ({ kind, id, patch }) => {
      const list = { zoom: "zooms", blur: "blurs", note: "notes", cue: "cues" }[kind];
      if (!list) return;
      edit(
        { [list]: (tlRef.current?.[list] || []).map((x) => (x.id === id ? { ...x, ...patch } : x)) },
        LABELS[kind] || "Edit"
      );
    },
    [edit]
  );

  /* ── Cuts ─────────────────────────────────────────────────────────────── */

  const lay = useMemo(() => (tl ? layout(tl) : null), [tl]);

  const addCut = useCallback(
    (at) => {
      if (!tlRef.current || !lay) return;
      const src = sourceOf(at, lay);
      const start = clamp(src, 0, Math.max(0, (tlRef.current.duration || 0) - 0.4));
      const end = Math.min(tlRef.current.duration || start + 2, start + 2);
      edit({ cuts: [...(tlRef.current.cuts || []), { id: newId("cut"), start, end, reason: "manual", auto: false }] }, "Add cut");
    },
    [edit, lay]
  );

  const removeCut = useCallback(
    (cut) => {
      const cuts = (tlRef.current?.cuts || []).filter(
        // The ruler shows MERGED cuts, so one hatched mark can stand for two
        // overlapping ones. Restoring it has to remove every cut inside it or
        // the gap stays and the click looks like it did nothing.
        (c) => !(c.start >= cut.start - 0.01 && c.end <= cut.end + 0.01)
      );
      edit({ cuts }, "Restore cut");
    },
    [edit]
  );

  /* ── Actions ──────────────────────────────────────────────────────────── */

  const onCaptions = useCallback(async () => {
    setCaptioning(true);
    setNotice("");
    try {
      await requestCaptions(demoId);
    } catch (err) {
      setCaptioning(false);
      setNotice(err?.response?.data?.message || "We couldn't write captions for this recording.");
    }
  }, [demoId]);

  const onReview = useCallback(async () => {
    setReviewing(true);
    try {
      await requestReview(demoId);
    } catch {
      setReviewing(false);
    }
  }, [demoId]);

  const onSuggestion = useCallback(
    async (sid, action) => {
      try {
        // Applying writes the timeline on the server, so anything unsaved here
        // goes first or it is about to be overwritten by the answer.
        if (dirty.current) await save();
        const d = await resolveSuggestion(demoId, sid, action);
        setDemo(d.demo);
        revRef.current = d.demo.rev;
        if (d.demo.timeline) setTl(d.demo.timeline);
        if (d.applied === false && d.why) setNotice(d.why);
      } catch (err) {
        setNotice(err?.response?.data?.message || "We couldn't apply that one.");
      }
    },
    [demoId, save]
  );

  /* ── Keyboard ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    const onKey = (e) => {
      const el = e.target;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) stepForward();
        else stepBack();
      } else if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 1 / 30;
        setSeekTo(clamp(time + (e.key === "ArrowRight" ? step : -step), 0, lay?.duration || 0));
      } else if (e.key === "Escape") {
        setSelection(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepBack, stepForward, time, lay]);

  /* ── Screens before the editor ────────────────────────────────────────── */

  if (error) {
    return (
      <Centred>
        <p style={{ color: "var(--d-red)", fontSize: 14, marginBottom: 16 }}>{error}</p>
        <Btn onClick={onExit}>Back to recordings</Btn>
      </Centred>
    );
  }

  if (!demo) return <Centred><span style={{ color: "var(--d-mute)", fontSize: 13 }}>Opening…</span></Centred>;

  if (demo.status === "preparing" || demo.recording.status === "processing") {
    return (
      <Centred>
        <h2 style={{ margin: "0 0 8px", fontSize: 19, fontWeight: 680, color: "var(--d-ink)" }}>Getting the recording ready</h2>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--d-mute)" }}>{demo.stage || "This takes a few seconds."}</p>
        <div className="st-bar" style={{ width: 300, marginTop: 20 }}>
          <i style={{ width: `${Math.round((demo.progress || 0) * 100)}%` }} />
        </div>
      </Centred>
    );
  }

  if (demo.status === "analysing") {
    return <Thinking stage={demo.stage} progress={demo.progress} />;
  }

  if (demo.status === "failed" && !tl) {
    return (
      <Centred>
        <p style={{ color: "var(--d-red)", fontSize: 14, marginBottom: 6, maxWidth: 380, textAlign: "center", lineHeight: 1.6 }}>
          {demo.error || "Something went wrong with this recording."}
        </p>
        <Btn onClick={onExit} style={{ marginTop: 14 }}>Back to recordings</Btn>
      </Centred>
    );
  }

  if (!tl) {
    return (
      <Centred>
        <h2 style={{ margin: "0 0 8px", fontSize: 19, fontWeight: 680, color: "var(--d-ink)" }}>Ready to edit</h2>
        <p style={{ margin: "0 0 20px", fontSize: 13.5, lineHeight: 1.6, color: "var(--d-mute)", maxWidth: 380, textAlign: "center" }}>
          This recording hasn't been analysed yet. The studio will find the steps, cut the waiting, plan the zooms and
          blur anything private.
        </p>
        <Btn kind="primary" size="l" icon={<Icon name="wand" size={15} />} onClick={() => onAnalyse(demo)}>
          Edit it automatically
        </Btn>
      </Centred>
    );
  }

  /* ── The editor ───────────────────────────────────────────────────────── */

  const total = lay?.duration || 0;
  const panelProps = { tl, selection, onSelect: setSelection, edit, time, seek: setSeekTo };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 4px 14px", flexWrap: "wrap" }}>
        <Btn kind="quiet" size="s" icon={<Icon name="back" size={14} />} onClick={onExit}>
          Recordings
        </Btn>
        <input
          value={demo.title}
          onChange={(e) => setDemo({ ...demo, title: e.target.value })}
          onBlur={(e) => renameDemo(demoId, e.target.value).catch(() => {})}
          placeholder="Untitled recording"
          style={{
            flex: "1 1 220px", minWidth: 140, background: "transparent", border: "1px solid transparent",
            borderRadius: 8, padding: "5px 8px", fontFamily: "inherit", fontSize: 16, fontWeight: 680,
            letterSpacing: "-0.02em", color: "var(--d-ink)", outline: "none",
          }}
          onFocus={(e) => { e.target.style.borderColor = "var(--d-line)"; }}
          onBlurCapture={(e) => { e.target.style.borderColor = "transparent"; }}
        />
        <Btn size="s" onClick={stepBack} disabled={!undo.current.length} title="Undo (Ctrl+Z)">
          Undo
        </Btn>
        <Btn size="s" onClick={stepForward} disabled={!redo.current.length} title="Redo (Ctrl+Shift+Z)">
          Redo
        </Btn>
        <Btn kind="primary" size="m" icon={<Icon name="download" size={14} />} onClick={() => setExporting(true)}>
          Export
        </Btn>
      </header>

      {notice && (
        <div
          role="status"
          style={{
            margin: "0 4px 12px", padding: "10px 13px", borderRadius: 10, fontSize: 12.5, lineHeight: 1.5,
            border: "1px solid var(--d-line)", background: "var(--d-panel)", color: "var(--d-body)",
            display: "flex", alignItems: "center", gap: 10,
          }}
        >
          <span style={{ flex: 1 }}>{notice}</span>
          <button type="button" onClick={() => setNotice("")} style={{ border: "none", background: "transparent", color: "var(--d-mute)", cursor: "pointer", fontFamily: "inherit" }}>
            <Icon name="close" size={13} />
          </button>
        </div>
      )}

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0,1fr) 336px", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, gap: 14 }}>
          <div
            style={{
              flex: 1, minHeight: 240, display: "flex", borderRadius: 16, overflow: "hidden",
              border: "1px solid var(--d-line-soft)", background: "#07080C",
            }}
            onPointerDown={(e) => {
              // Clicking the empty space around the frame clears the selection,
              // which is how a creator stops a blur rectangle following them
              // around without hunting for a Deselect button.
              if (e.target === e.currentTarget) setSelection(null);
            }}
          >
            <Preview
              tl={tl}
              proxyUrl={demo.recording.proxy_url}
              playing={playing}
              onPlayingChange={setPlaying}
              time={time}
              onTime={setTime}
              seekTo={seekTo}
              selection={selection}
              onSelect={setSelection}
              onChange={changeItem}
            />
          </div>

          {/* ── Transport ─────────────────────────────────────────── */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 4px" }}>
            <Btn
              size="s"
              icon={<Icon name={playing ? "pause" : "play"} size={14} />}
              onClick={() => setPlaying((p) => !p)}
              title="Play / pause (Space)"
            >
              {playing ? "Pause" : "Play"}
            </Btn>
            <span style={{ fontSize: 12.5, color: "var(--d-mute)", fontVariantNumeric: "tabular-nums" }}>
              {fmtTime(time, true)} / {fmtTime(total, true)}
            </span>
            <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--d-mute)" }}>
              {counts(tl)}
            </span>
          </div>

          <div style={{ padding: "14px 16px", borderRadius: 16, border: "1px solid var(--d-line-soft)", background: "var(--d-panel)" }}>
            <Timeline
              tl={tl}
              time={time}
              onSeek={setSeekTo}
              selection={selection}
              onSelect={setSelection}
              onChange={changeItem}
              onAddCut={addCut}
              onRemoveCut={removeCut}
            />
          </div>
        </div>

        {/* ── Inspector ────────────────────────────────────────────── */}
        <aside style={{ display: "flex", flexDirection: "column", minHeight: 0, gap: 12 }}>
          <Segmented
            full
            size="xs"
            value={tab}
            onChange={setTab}
            options={TABS.map((t) => ({ value: t.id, label: t.label }))}
          />
          <div className="st-scroll" style={{ flex: 1, minHeight: 0, display: "grid", gap: 12, alignContent: "start", paddingRight: 2 }}>
            {tab === "steps" && (
              <StepsPanel tl={tl} time={time} seek={setSeekTo} summary={demo.analysis?.summary} narration={tl.narration} />
            )}
            {tab === "zoom" && <ZoomPanel {...panelProps} />}
            {tab === "blur" && <BlurPanel {...panelProps} />}
            {tab === "captions" && (
              <CaptionsPanel
                {...panelProps}
                onGenerate={onCaptions}
                generating={captioning}
                hasAudio={demo.recording.has_audio}
              />
            )}
            {tab === "notes" && <NotesPanel {...panelProps} />}
            {tab === "cursor" && <CursorPanel tl={tl} edit={edit} />}
            {tab === "canvas" && <CanvasPanel tl={tl} edit={edit} />}
            {tab === "review" && (
              <SuggestionsPanel
                analysis={demo.analysis}
                busy={reviewing}
                onRefresh={onReview}
                onApply={(sid) => onSuggestion(sid, "apply")}
                onDismiss={(sid) => onSuggestion(sid, "dismiss")}
              />
            )}
          </div>
        </aside>
      </div>

      {exporting && (
        <ExportDialog
          demo={demo}
          config={config}
          outputSeconds={total}
          onClose={() => setExporting(false)}
          onChanged={() => load(true)}
          beforeExport={save}
        />
      )}
    </div>
  );
}

const LABELS = { zoom: "Zoom", blur: "Blur", note: "Annotation", cue: "Caption" };

function counts(tl) {
  const bits = [];
  const z = (tl.zooms || []).length;
  const b = (tl.blurs || []).length;
  const c = mergedCuts(tl).length;
  if (z) bits.push(`${z} zoom${z === 1 ? "" : "s"}`);
  if (b) bits.push(`${b} blur${b === 1 ? "" : "s"}`);
  if (c) bits.push(`${c} cut${c === 1 ? "" : "s"}`);
  return bits.join(" · ");
}

function sourceOf(outT, lay) {
  for (const s of lay.segments) {
    if (outT >= s.out_start && outT <= s.out_end) return s.src_start + (outT - s.out_start);
  }
  return lay.segments.length ? lay.segments[lay.segments.length - 1].src_end : 0;
}

function Centred({ children }) {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "56vh", padding: 20, textAlign: "center" }}>
      <div style={{ display: "grid", placeItems: "center" }}>{children}</div>
    </div>
  );
}
