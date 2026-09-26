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
// requestReview and resolveSuggestion are hidden with the Review tab (see TABS).
import { getDemo, saveTimeline, renameDemo, readScreens, requestCaptions, captionsFromScript, /* requestReview, resolveSuggestion, */ listBackgrounds } from "./studioApi";
import { Thinking } from "./RecordPage";
import Preview from "./Preview";
import Timeline from "./Timeline";
import ExportDialog from "./ExportDialog";
import { create } from "./create";
// StepsPanel is hidden for now with the Steps tab (see TABS); put it back in
// this import when the tab returns.
// CanvasPanel and SuggestionsPanel are hidden with their tabs (see TABS): the
// canvas controls moved under the preview (CanvasBar.js).
import { ZoomPanel, BlurPanel, CaptionsPanel, CursorPanel, /* CanvasPanel, StepsPanel, SuggestionsPanel */ } from "./panels";
import CanvasBar from "./CanvasBar";
import Skeleton from "../Shell/Skeleton";
import { Btn, Icon } from "./ui";
import { layout, newId, clamp, fmtTime } from "./model";
import "./studio.css";

/** The inspector tab each kind of selectable thing is edited in. */
const TAB_OF = { zoom: "zoom", blur: "blur", cue: "captions" };

const TABS = [
  // Steps is hidden for now, not removed. Restoring it is this line, the
  // StepsPanel import above, `screensRead` and the panel block in `panel`, and
  // the default tab back to "steps".
  // { id: "steps", label: "Steps", icon: "steps" },
  { id: "zoom", label: "Zoom", icon: "zoom" },
  { id: "blur", label: "Blur", icon: "blur" },
  { id: "captions", label: "Captions", icon: "caption" },
  { id: "cursor", label: "Cursor", icon: "cursor" },
  // Canvas moved under the preview (CanvasBar.js); Review is hidden for now.
  // Both are commented out, not removed, with their panel blocks in `panel`.
  // { id: "canvas", label: "Canvas", icon: "canvas" },
  // { id: "review", label: "Review", icon: "sparkle" },
];

/** Changes closer together than this, to the same thing, are one undo step. */
const COALESCE_MS = 700;
const SAVE_MS = 1000;

export default function StudioEditor({ demoId, config, onExit, onAnalyse }) {
  const [demo, setDemo] = useState(null);
  const [tl, setTl] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Zoom while Steps is hidden (see TABS).
  const [tab, setTab] = useState("zoom");
  const [selection, setSelection] = useState(null);

  /**
   * ── A SELECTION BELONGS TO ITS TAB ──────────────────────────────────────
   * A selected zoom draws its rectangle over the picture. Kept across a tab
   * change, that rectangle sat on the preview through the whole video while
   * the creator was in Steps or Blur, a handle for something they were no
   * longer editing. So picking something (from its list, from the timeline,
   * or by adding it) opens the tab it is edited in, and leaving that tab lets
   * go of it.
   */
  const select = useCallback((s) => {
    setSelection(s);
    if (s && TAB_OF[s.kind]) setTab(TAB_OF[s.kind]);
  }, []);
  const openTab = useCallback((id) => {
    setTab(id);
    setSelection((s) => (s && TAB_OF[s.kind] === id ? s : null));
  }, []);
  const [time, setTime] = useState(0);
  const [seekTo, setSeekTo] = useState(null);
  // Every request is a new object, so seeking to the same moment twice — the
  // start, after it has played through — is still a request.
  const seekN = useRef(0);
  const seek = useCallback((t) => {
    if (!Number.isFinite(Number(t))) return;
    seekN.current += 1;
    setSeekTo({ t: Number(t), n: seekN.current });
  }, []);
  const [playing, setPlaying] = useState(false);
  /**
   * Full screen is the picture only, with just enough transport to watch it:
   * the point is to see the edit at the size it will be watched, not to edit
   * in it. The browser owns the state; this mirrors it so the button and the
   * controls know which way round they are.
   */
  const stageRef = useRef(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const onChange = () => setFull(!!stageRef.current && document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else stageRef.current?.requestFullscreen?.().catch(() => {});
  }, []);
  const [exporting, setExporting] = useState(false);
  const [captioning, setCaptioning] = useState(false);
  // The model reading the screens — blur, steps, narration — which is now a
  // separate thing a creator asks for rather than part of the first analysis.
  const [reading, setReading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [starting, setStarting] = useState(false);
  // The creator's uploaded background images (null while loading). Read once
  // here so the preview can draw the one the canvas names, and handed to the
  // background picker, which adds to it when something new is uploaded.
  const [backgrounds, setBackgrounds] = useState(null);
  useEffect(() => {
    let live = true;
    listBackgrounds()
      .then((list) => live && setBackgrounds(list))
      .catch(() => live && setBackgrounds([]));
    return () => {
      live = false;
    };
  }, []);
  const narrow = useNarrow();

  const undo = useRef([]);
  const redo = useRef([]);
  const lastEdit = useRef({ label: "", at: 0 });
  const saveTimer = useRef(null);
  const dirty = useRef(false);
  /**
   * ── ONE SAVE ON THE WIRE, AND A COUNT OF EDITS ─────────────────────────────
   * Two races lived here, and both looked to the creator like the editor
   * ignoring them: pick 4:5, and a few seconds later it was 16:9 again.
   *
   * 1. save() marked the tab clean BEFORE the server answered. A poll landing
   *    in that window saw "nothing unsaved", took the server's copy — which did
   *    not have the change yet — and put the old shape back.
   * 2. Dragging a slider fires saves back to back. A second save sent while the
   *    first was in flight carried the revision from before the first landed,
   *    the server rightly called it stale, and the editor reloaded, threw the
   *    change away, and said "This recording changed in another tab" to a
   *    creator with one tab open.
   *
   * So there is one save in flight at most, every edit bumps a generation
   * count, the tab is clean only when the server has confirmed the LATEST
   * generation, and nothing read from the server replaces the timeline while
   * any of that is unsettled.
   */
  const saving = useRef(null);
  const resave = useRef(false);
  const editGen = useRef(0);
  const saveRef = useRef(null);
  const revRef = useRef(0);
  const tlRef = useRef(null);
  tlRef.current = tl;
  // Read by the poll below, which must not be re-created every time the demo
  // changes or the interval restarts on every answer it receives.
  const demoRef = useRef(null);
  demoRef.current = demo;

  /* ── Loading ──────────────────────────────────────────────────────────── */

  const load = useCallback(
    async (quiet = false, { force = false } = {}) => {
      const gen = editGen.current;
      try {
        const d = await getDemo(demoId);
        setDemo(d.demo);
        // The server's timeline — and its revision, which belongs to it — is
        // taken only when this tab has nothing of its own unsettled: no
        // unsaved change, no save on the wire, and no edit made after this
        // read was sent. A poll that answers late must not roll anything back.
        const settled = !dirty.current && !saving.current && editGen.current === gen;
        if (force || settled) {
          revRef.current = d.demo.rev;
          if (d.demo.timeline) {
            tlRef.current = d.demo.timeline;
            setTl(d.demo.timeline);
          }
        }
        if (!quiet) setError("");
      } catch (err) {
        /**
         * A 404 here is almost always a link to a recording that has since
         * been deleted or expired: the editor keeps its id in the URL, and a
         * tab left open outlives the demo. The generic message made that read
         * as a fault in the product. It is not one, and the creator can act on
         * it, so it says which it is.
         */
        setError(
          err?.response?.status === 404
            ? "This recording is no longer here. It was deleted, or it expired."
            : err?.response?.data?.message || "We couldn’t open this recording."
        );
      }
    },
    [demoId]
  );

  useEffect(() => {
    load();
  }, [load]);

  /**
   * ── THE POLL MUST NOT DEPEND ON THE THING IT IS POLLING FOR ────────────────
   * This used to poll only while `demo.status` was "analysing" or "preparing",
   * which deadlocks the moment the status this tab is holding is stale — and
   * it always is, right after the creator presses "Edit it automatically". The
   * server flipped the demo to "analysing"; this tab still had "ready" with no
   * timeline; so `busy` was false; so it never re-read; so it never learned the
   * status had changed. The analysis finished, the server logged it, and the
   * screen sat on "Ready to edit" until the page was reloaded by hand. That is
   * exactly what it looked like from the outside: "nothing is happening".
   *
   * So the condition now includes the state that MEANS we are out of date — a
   * demo with no timeline — rather than only the states that say so explicitly.
   * A demo that genuinely has nothing to wait for has a timeline, and stops.
   */
  useEffect(() => {
    const off = onLiveEvent("studio:update", (e) => {
      // Events name the demo by its database id; `demoId` here is usually the
      // slug from the address bar, so the loaded demo's own id is the match.
      if (String(e?.demo) !== String(demoRef.current?.id || demoId)) return;
      if (e.notice) setNotice(e.notice);
      if (e.captioning === false) setCaptioning(false);
      if (e.reading === false || e.read) setReading(false);
      if (e.reviewed) setReviewing(false);
      load(true);
    });
    const id = setInterval(() => {
      const d = demoRef.current;
      const busy =
        !d ||
        !d.timeline ||
        d.status === "analysing" ||
        d.status === "preparing" ||
        d.recording?.status === "processing" ||
        d.renders?.some((r) => r.status === "queued" || r.status === "rendering") ||
        captioning ||
        reading ||
        reviewing;
      if (busy) load(true);
    }, 3000);
    return () => {
      off();
      clearInterval(id);
    };
  }, [demoId, load, captioning, reading, reviewing]);

  /* ── Editing ──────────────────────────────────────────────────────────── */

  const save = useCallback(async () => {
    if (saving.current) {
      // Another save is on the wire. This one follows it, with the revision
      // that one comes back with, instead of racing it with a stale one.
      resave.current = true;
      return saving.current;
    }
    const current = tlRef.current;
    if (!current || !dirty.current) return;
    const gen = editGen.current;
    let retryIn = 0;

    const run = (async () => {
      try {
        const res = await saveTimeline(demoId, current, revRef.current);
        revRef.current = res.rev;
        // Clean only if nothing was edited while this was on the wire.
        if (editGen.current === gen) dirty.current = false;
      } catch (err) {
        if (err?.response?.data?.stale) {
          // A genuine conflict: something else saved in between.
          setNotice("This recording changed in another tab, so it was reloaded.");
          dirty.current = false;
          saving.current = null;
          await load(true, { force: true });
        } else {
          setNotice("Your last change hasn't saved yet. It will keep trying.");
          retryIn = SAVE_MS * 4;
        }
      }
    })();

    saving.current = run;
    try {
      await run;
    } finally {
      saving.current = null;
    }
    if (dirty.current || resave.current) {
      resave.current = false;
      if (dirty.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => saveRef.current && saveRef.current(), retryIn || SAVE_MS);
      }
    }
  }, [demoId, load]);
  saveRef.current = save;

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

      editGen.current += 1;
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
    editGen.current += 1;
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
    editGen.current += 1;
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
      const list = { zoom: "zooms", blur: "blurs", cue: "cues" }[kind];
      if (!list) return;
      edit(
        { [list]: (tlRef.current?.[list] || []).map((x) => (x.id === id ? { ...x, ...patch } : x)) },
        LABELS[kind] || "Edit"
      );
    },
    [edit]
  );

  // A click on an empty stretch of a timeline lane: make one there, in
  // recording time, and select it, which opens its tab (see Timeline.js).
  const addAt = useCallback(
    (kind, start, end) => {
      const cur = tlRef.current;
      if (!cur) return;
      const { item, patch, label } = create(kind, cur, start, end);
      edit(patch, label);
      select({ kind, id: item.id });
    },
    [edit, select]
  );

  /**
   * Remove whatever is selected.
   *
   * One function because the Delete key, the bin button in a panel row and the
   * bin on a timeline chip must do exactly the same thing, including which
   * undo label they leave behind. A cut is the odd one out: removing a cut
   * restores time rather than deleting an object, so it says "Restore cut".
   */
  const removeSelected = useCallback(() => {
    const sel = selection;
    const cur = tlRef.current;
    if (!sel || !cur) return;
    if (sel.kind === "cut") {
      const cut = (cur.cuts || []).find((c) => c.id === sel.id);
      if (cut) removeCutRef.current?.(cut);
      setSelection(null);
      return;
    }
    const list = { zoom: "zooms", blur: "blurs", cue: "cues" }[sel.kind];
    if (!list) return;
    edit({ [list]: (cur[list] || []).filter((x) => x.id !== sel.id) }, `Remove ${sel.kind === "cue" ? "caption" : sel.kind}`);
    setSelection(null);
  }, [selection, edit]);

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

  // Held in a ref so removeSelected() above can reach it without the two
  // callbacks having to be declared in dependency order.
  const removeCutRef = useRef(null);

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
  removeCutRef.current = removeCut;

  /* ── Actions ──────────────────────────────────────────────────────────── */

  /**
   * Read the screens: blur, steps, narration.
   *
   * Paid, so the page owns the confirmation the same way it owns the one for
   * the first analysis; this starts it and turns the panel into its waiting
   * state, because the demo in hand still says nothing is running until
   * something re-reads it.
   */
  const onRead = useCallback(async () => {
    setReading(true);
    setNotice("");
    try {
      await readScreens(demoId);
      await load(true, { force: true });
    } catch (err) {
      setReading(false);
      // Includes the 402 that names the price and the balance, which is the
      // only confirmation this needs: nobody is charged without being told.
      setNotice(err?.response?.data?.message || "We couldn't read this recording's screens.");
    }
  }, [demoId, load]);

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

  /**
   * Start the automatic edit, and show that it started.
   *
   * The page owns the credit confirmation (StudioPage.js), but the screen that
   * has to change is this one, and it will not change on its own: the demo in
   * hand still says "ready" until something re-reads it. So this awaits the
   * call and reloads, which is what turns the button into the processing
   * screen. Without the reload the poll above eventually catches up, and "the
   * button did nothing for three seconds" is indistinguishable from broken.
   */
  const startAnalyse = useCallback(async () => {
    setStarting(true);
    setNotice("");
    try {
      await onAnalyse(demo);
    } finally {
      await load(true);
      setStarting(false);
    }
  }, [onAnalyse, demo, load]);

  const onCaptionsFromScript = useCallback(async () => {
    setCaptioning(true);
    setNotice("");
    try {
      const d = await captionsFromScript(demoId);
      setDemo(d.demo);
      revRef.current = d.demo.rev;
      dirty.current = false;
      if (d.demo.timeline) {
        tlRef.current = d.demo.timeline;
        setTl(d.demo.timeline);
      }
    } catch (err) {
      setNotice(err?.response?.data?.message || "We couldn't build captions from the script.");
    } finally {
      setCaptioning(false);
    }
  }, [demoId]);

  /* Review: hidden for now with its tab (see TABS). Restore with it.
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
  */

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
        seek(clamp(time + (e.key === "ArrowRight" ? step : -step), 0, lay?.duration || 0));
      } else if (e.key === "Escape") {
        setSelection(null);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        // Delete removes whatever is selected — a blur, a zoom, a caption, a
        // cut. Every one of them is undoable, so this needs no confirmation;
        // asking on each would make clearing six auto-blurs six dialogs.
        if (!selection) return;
        e.preventDefault();
        removeSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepBack, stepForward, time, lay, selection, removeSelected, seek]);

  /* ── Screens before the editor ────────────────────────────────────────── */

  if (error) {
    return (
      <Centred>
        <p style={{ color: "var(--bad)", fontSize: 14, marginBottom: 16 }}>{error}</p>
        <Btn onClick={onExit}>Back to recordings</Btn>
      </Centred>
    );
  }

  if (!demo) return <EditorSkeleton narrow={narrow} />;

  if (demo.status === "preparing" || demo.recording.status === "processing") {
    return (
      <Centred>
        <h2 style={{ margin: "0 0 8px", fontSize: 19, fontWeight: 680, color: "var(--ink)" }}>Getting the recording ready</h2>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-mute)" }}>{demo.stage || "This takes a few seconds."}</p>
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
        <p style={{ color: "var(--bad)", fontSize: 14, marginBottom: 6, maxWidth: 380, textAlign: "center", lineHeight: 1.6 }}>
          {demo.error || "Something went wrong with this recording."}
        </p>
        <Btn onClick={onExit} style={{ marginTop: 14 }}>Back to recordings</Btn>
      </Centred>
    );
  }

  if (!tl) {
    return (
      <Centred>
        <h2 style={{ margin: "0 0 8px", fontSize: 19, fontWeight: 680, color: "var(--ink)" }}>Ready to edit</h2>
        <p style={{ margin: "0 0 20px", fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-mute)", maxWidth: 380, textAlign: "center" }}>
          This recording hasn't been analysed yet. The studio will find the steps, cut the waiting, plan the zooms and
          blur anything private.
        </p>
        <Btn kind="primary" size="l" icon={<Icon name="wand" size={15} />} disabled={starting} onClick={startAnalyse}>
          {starting ? "Starting…" : "Edit it automatically"}
        </Btn>
      </Centred>
    );
  }

  /* ── The editor ───────────────────────────────────────────────────────── */

  const total = lay?.duration || 0;
  const panelProps = { tl, selection, onSelect: select, edit, time, seek };

  // The uploaded image the canvas names, if it names one and it is still there.
  const bgChoice = tl.canvas?.background;
  const bgImageUrl =
    bgChoice?.kind === "image" ? (backgrounds || []).find((b) => b.id === bgChoice.value)?.url || "" : "";

  /**
   * Whether the model has read what is ON the screens of this recording.
   *
   * `frames_read` is the honest measure and the only one: a demo analysed
   * before the model pass became optional has a number here, one analysed
   * without it has zero, and so does one whose reading failed. All three mean
   * the same thing to a creator about to export — nothing on these frames has
   * been checked — so all three say it.
   */
  // Read only by the Steps panel, which is hidden for now (see TABS).
  // const screensRead = (demo.analysis?.frames_read || 0) > 0;
  /**
   * ── READING THE FRAMES AND CHECKING THEM ARE DIFFERENT PROMISES ───────────
   * The blur pass can be paused while the rest of the vision pass runs, and
   * when it is, the frames have been read for the steps and checked for
   * nothing. Keyed off `screensRead` the panel said "Every sampled frame was
   * checked for emails, keys, tokens and personal details" when none had been —
   * which is the one claim this product must never make. The server now says
   * which of the two happened. See analysis.blur_checked.
   */
  const blurChecked = demo.analysis?.blur_checked === true;
  /** What that reading costs, so the button can say so before it is pressed. */
  const readCost =
    (config?.pricing?.analyse_per_min || 0) * Math.max(1, Math.ceil((demo.recording?.duration || 0) / 60));

  const header = (
    <header
      style={{
        flexShrink: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        padding: narrow ? "8px 10px" : "9px 14px", borderBottom: "1px solid var(--line)",
        background: "var(--card)", minHeight: 54,
      }}
    >
      <Btn kind="quiet" size="s" icon={<Icon name="back" size={14} />} onClick={onExit}>
        {narrow ? "" : "Recordings"}
      </Btn>
      <input
        value={demo.title}
        onChange={(e) => setDemo({ ...demo, title: e.target.value })}
        onBlur={(e) => renameDemo(demoId, e.target.value).catch(() => {})}
        placeholder="Untitled recording"
        style={{
          flex: "1 1 160px", minWidth: 110, background: "transparent", border: "1px solid transparent",
          borderRadius: 8, padding: "5px 8px", fontFamily: "inherit", fontSize: 15.5, fontWeight: 680,
          letterSpacing: "-0.02em", color: "var(--ink)", outline: "none",
        }}
        onFocus={(e) => { e.target.style.borderColor = "var(--line)"; }}
        onBlurCapture={(e) => { e.target.style.borderColor = "transparent"; }}
      />
      <Btn size="s" kind="quiet" onClick={stepBack} disabled={!undo.current.length} title="Undo (Ctrl+Z)" icon={<Icon name="undo" size={15} />}>
        {narrow ? "" : "Undo"}
      </Btn>
      <Btn size="s" kind="quiet" onClick={stepForward} disabled={!redo.current.length} title="Redo (Ctrl+Shift+Z)" icon={<Icon name="redo" size={15} />}>
        {narrow ? "" : "Redo"}
      </Btn>
      <Btn kind="primary" size="s" icon={<Icon name="download" size={14} />} onClick={() => setExporting(true)}>
        Export
      </Btn>
    </header>
  );

  const banner = notice ? (
    <div
      role="status"
      style={{
        flexShrink: 0, display: "flex", alignItems: "center", gap: 10,
        padding: "9px 14px", fontSize: 12.5, lineHeight: 1.5,
        borderBottom: "1px solid var(--line)", background: "var(--made-tint)", color: "var(--ink-body)",
      }}
    >
      <span style={{ flex: 1 }}>{notice}</span>
      <button
        type="button"
        onClick={() => setNotice("")}
        aria-label="Dismiss"
        style={{ border: "none", background: "transparent", color: "var(--ink-mute)", cursor: "pointer", fontFamily: "inherit", display: "grid", placeItems: "center" }}
      >
        <Icon name="close" size={13} />
      </button>
    </div>
  ) : null;

  const preview = (
    <div
      ref={stageRef}
      className="st-fullscreen"
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: full ? "column" : "row" }}
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
        onSelect={select}
        onChange={changeItem}
        // Up against the header on a desk, so the spare height goes to the
        // timeline's side. Full screen and phones stay centred.
        align={full || narrow ? "center" : "top"}
        backgroundUrl={bgImageUrl}
      />
      {full && (
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "12px 4px 0", color: "#fff" }}>
          <Btn
            kind="primary"
            size="s"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Pause" : "Play"}
            icon={<Icon name={playing ? "pause" : "play"} size={14} />}
            style={{ width: 40, height: 34, padding: 0 }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            {fmtTime(time, true)} <span style={{ opacity: 0.6, fontWeight: 500 }}>/ {fmtTime(total, true)}</span>
          </span>
          <button type="button" onClick={toggleFull} title="Exit full screen (Esc)" aria-label="Exit full screen" style={fullBtn(true)}>
            <Icon name="shrink" size={16} />
          </button>
        </div>
      )}
    </div>
  );

  const transport = (
    <div
      className="st-stage"
      style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: narrow ? "8px 14px" : "10px 2px 2px" }}
    >
      <Btn
        kind="primary"
        size="s"
        onClick={() => setPlaying((p) => !p)}
        aria-label={playing ? "Pause" : "Play"}
        title="Play / pause (Space)"
        icon={<Icon name={playing ? "pause" : "play"} size={14} />}
        style={{ width: 40, height: 34, padding: 0 }}
      />
      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
        {fmtTime(time, true)} <span style={{ color: "var(--ink-mute)", fontWeight: 500 }}>/ {fmtTime(total, true)}</span>
      </span>
      {selection && (
        <Btn size="s" kind="danger" icon={<Icon name="trash" size={13} />} onClick={removeSelected} title="Delete (Del)">
          Delete
        </Btn>
      )}
      {/* Shape, size, corners, shadow and background: they change the whole
          picture, so they sit under it (CanvasBar.js). */}
      <div style={{ marginLeft: "auto" }}>
        <CanvasBar
          tl={tl}
          edit={edit}
          backgrounds={backgrounds}
          onUploaded={(b) => setBackgrounds((list) => [b, ...(list || []).filter((x) => x.id !== b.id)])}
          onDeleted={(id) => setBackgrounds((list) => (list || []).filter((x) => x.id !== id))}
        />
      </div>
      {/* Cut from the playhead: a transport action, so it sits with play and
          full screen rather than at the far end of the timeline. */}
      <Btn
        size="s"
        icon={<Icon name="scissors" size={13} />}
        onClick={() => addCut(time)}
        title="Cut two seconds from here"
      >
        Cut here
      </Btn>
      <button type="button" onClick={toggleFull} title="Full screen" aria-label="Full screen" style={fullBtn(false)}>
        <Icon name="expand" size={15} />
      </button>
    </div>
  );

  const tabs = (
    <div
      role="tablist"
      aria-label="Edit"
      className="st-scroll"
      style={{
        flexShrink: 0, display: "flex", gap: 2, overflowX: "auto", overflowY: "hidden",
        padding: "0 8px", borderBottom: "1px solid var(--line)", background: "var(--card)",
      }}
    >
      {TABS.map((t) => {
        const on = tab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => openTab(t.id)}
            style={{
              flexShrink: 0, padding: "11px 11px 9px", fontSize: 12.5, fontWeight: on ? 680 : 600,
              color: on ? "var(--ink)" : "var(--ink-mute)", fontFamily: "inherit",
              border: "none", borderBottom: `2px solid ${on ? "var(--ink)" : "transparent"}`,
              marginBottom: -1, background: "none", cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );

  const panel = (
    <>
      {/* Steps: hidden for now with its tab (see TABS).
      {tab === "steps" && (
        <StepsPanel
          tl={tl}
          time={time}
          seek={seek}
          summary={demo.analysis?.summary}
          narration={tl.narration}
          read={screensRead}
          reading={reading}
          onRead={onRead}
          readCost={readCost}
        />
      )}
      */}
      {tab === "zoom" && <ZoomPanel {...panelProps} />}
      {tab === "blur" && <BlurPanel {...panelProps} read={blurChecked} reading={reading} onRead={onRead} readCost={readCost} />}
      {tab === "captions" && (
        <CaptionsPanel
          {...panelProps}
          onGenerate={onCaptions}
          onGenerateFromScript={onCaptionsFromScript}
          generating={captioning}
          hasAudio={demo.recording.has_audio}
        />
      )}
      {tab === "cursor" && <CursorPanel tl={tl} edit={edit} />}
      {/* Canvas and Review: hidden with their tabs (see TABS).
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
      */}
    </>
  );

  const ruler = (
    <Timeline
      tl={tl}
      time={time}
      onSeek={seek}
      selection={selection}
      onSelect={select}
      onChange={changeItem}
      onRemoveCut={removeCut}
      onAdd={addAt}
      onDelete={removeSelected}
      // Taller lanes on a desk: bigger chips to grab, drag and resize.
      height={narrow ? 30 : 42}
    />
  );

  const dialog = exporting ? (
    <ExportDialog
      demo={demo}
      config={config}
      outputSeconds={total}
      onClose={() => setExporting(false)}
      onChanged={() => load(true)}
      beforeExport={save}
    />
  ) : null;

  /**
   * ── WHY THE INSPECTOR ROWS ARE max-content ──────────────────────────────
   * The inspector is a grid with a fixed height, and every card in it clips
   * its overflow. A grid item that clips is allowed to shrink to nothing, so
   * when the cards did not fit, the grid squeezed each one instead of letting
   * the column scroll: the fourth step and the end of the voiceover script were
   * cut off with no scrollbar to reach them. Rows sized to their content make
   * the column taller than its window, which is what makes it scroll.
   */
  /**
   * ── TWO LAYOUTS, NOT ONE THAT REFLOWS ────────────────────────────────────
   * The same arrangement as src/components/Edit/Workspace.js, for the same
   * reason: on a phone the inspector cannot be a column beside the picture, it
   * has to be a sheet under it, and the timeline has to come out of the way
   * entirely. A single grid with media queries produces a layout that is wrong
   * at both ends; two explicit ones are each right.
   *
   * Every scrolling region is marked. The inspector is the one that mattered —
   * a voiceover script is longer than any screen and it had no scrollbar, so
   * the end of it was simply unreachable.
   */
  if (narrow) {
    return (
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {header}
        {banner}
        <div className="st-stage" style={{ flexShrink: 0, height: "min(42vh, 380px)", padding: "10px 12px 4px", display: "flex" }}>
          {preview}
        </div>
        {transport}
        {tabs}
        <div className="st-scroll" style={{ flex: 1, minHeight: 0, display: "grid", gap: 12, alignContent: "start", gridAutoRows: "max-content", padding: "12px 14px 28px", background: "var(--paper)" }}>
          {panel}
        </div>
        <div style={{ flexShrink: 0, borderTop: "1px solid var(--line)", background: "var(--card)", padding: "10px 12px 12px", overflowX: "auto" }}>
          {ruler}
        </div>
        {dialog}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {header}
      {banner}
      {/* ── THE TIMELINE RUNS THE FULL WIDTH ───────────────────────────────
          Picture and inspector share the top row; the timeline has the whole
          bottom row to itself, under the inspector too. Every second of the
          ruler is wider, so a short zoom is something a pointer can actually
          catch, and nothing on it is hidden behind the side panel. The
          inspector scrolls inside its own column when its settings outgrow
          the height the timeline leaves it. */}
      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(330px, 400px)", gridTemplateRows: "minmax(0,1fr) auto" }}>
        <div className="st-stage" style={{ gridColumn: 1, gridRow: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "8px 18px 8px" }}>
          {preview}
          {transport}
        </div>
        <aside style={{ gridColumn: 2, gridRow: 1, minHeight: 0, display: "flex", flexDirection: "column", borderLeft: "1px solid var(--line)", background: "var(--paper)" }}>
          {tabs}
          <div className="st-scroll" style={{ flex: 1, minHeight: 0, display: "grid", gap: 12, alignContent: "start", gridAutoRows: "max-content", padding: "14px 16px 28px" }}>
            {panel}
          </div>
        </aside>
        <div style={{ gridColumn: "1 / -1", gridRow: 2, minWidth: 0, borderTop: "1px solid var(--line)", background: "var(--card)", padding: "12px 16px 14px" }}>
          {ruler}
        </div>
      </div>
      {dialog}
    </div>
  );
}

const LABELS = { zoom: "Zoom", blur: "Blur", cue: "Caption" };

function sourceOf(outT, lay) {
  for (const s of lay.segments) {
    if (outT >= s.out_start && outT <= s.out_end) return s.src_start + (outT - s.out_start);
  }
  return lay.segments.length ? lay.segments[lay.segments.length - 1].src_end : 0;
}

/** True while the window is too narrow for a picture and an inspector side by side. */
function useNarrow(px = 900) {
  const [narrow, setNarrow] = useState(() => (typeof window === "undefined" ? false : window.innerWidth < px));
  useEffect(() => {
    const q = window.matchMedia(`(max-width: ${px - 1}px)`);
    const on = () => setNarrow(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, [px]);
  return narrow;
}

/**
 * The editor before its demo arrives: header, stage, inspector and timeline in
 * the places they are about to occupy, in both of the editor's layouts. The
 * word "Opening…" alone in the middle of the page said the same thing and gave
 * the eye nothing to settle on, and then everything jumped into place at once.
 */
function EditorSkeleton({ narrow }) {
  // The stage is warm grey, and the default skeleton grey vanishes on it.
  const onStage = { backgroundColor: "#E2DFDA" };
  const header = (
    <div
      style={{
        flexShrink: 0, display: "flex", alignItems: "center", gap: 10,
        padding: narrow ? "8px 10px" : "9px 14px", borderBottom: "1px solid var(--line)",
        background: "var(--card)", minHeight: 54,
      }}
    >
      <Skeleton variant="rectangular" width={narrow ? 32 : 104} height={30} />
      <Skeleton variant="rectangular" width={narrow ? "38%" : 220} height={18} style={{ borderRadius: 6 }} />
      <Skeleton variant="rectangular" width={84} height={32} style={{ marginLeft: "auto" }} />
    </div>
  );
  const transport = (
    <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: narrow ? "8px 14px" : "10px 2px 2px" }}>
      <Skeleton variant="rectangular" width={40} height={34} style={onStage} />
      <Skeleton variant="rectangular" width={90} height={12} style={{ ...onStage, borderRadius: 6 }} />
    </div>
  );
  const tabs = (
    <div style={{ flexShrink: 0, display: "flex", gap: 16, padding: "14px 16px 12px", borderBottom: "1px solid var(--line)", background: "var(--card)" }}>
      {[46, 40, 38, 58, 50].map((w, i) => (
        <Skeleton key={i} variant="rectangular" width={w} height={12} style={{ borderRadius: 6 }} />
      ))}
    </div>
  );
  const cards = [96, 72, 120].map((h, i) => <Skeleton key={i} variant="rectangular" height={h} style={{ borderRadius: 12 }} />);
  // The ruler, then one bar per lane, at the lane height the real timeline uses.
  const ruler = (
    <div style={{ display: "grid", gap: 6 }}>
      <Skeleton variant="rectangular" height={10} style={{ borderRadius: 5, marginBottom: 4 }} />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} variant="rectangular" height={narrow ? 30 : 42} />
      ))}
    </div>
  );

  if (narrow) {
    return (
      <div role="status" aria-label="Opening the recording" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {header}
        <div className="st-stage" style={{ flexShrink: 0, height: "min(42vh, 380px)", padding: "10px 12px 4px", display: "flex" }}>
          <Skeleton variant="rectangular" height="auto" style={{ ...onStage, flex: 1, borderRadius: 10 }} />
        </div>
        <div className="st-stage">{transport}</div>
        {tabs}
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "grid", gap: 12, alignContent: "start", padding: "12px 14px" }}>
          {cards}
        </div>
      </div>
    );
  }

  return (
    <div role="status" aria-label="Opening the recording" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {header}
      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(330px, 400px)", gridTemplateRows: "minmax(0,1fr) auto" }}>
        <div className="st-stage" style={{ gridColumn: 1, gridRow: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "8px 18px 8px" }}>
          <Skeleton variant="rectangular" height="auto" style={{ ...onStage, flex: 1, minHeight: 0, borderRadius: 10 }} />
          {transport}
        </div>
        <aside style={{ gridColumn: 2, gridRow: 1, minHeight: 0, overflow: "hidden", borderLeft: "1px solid var(--line)", background: "var(--paper)" }}>
          {tabs}
          <div style={{ display: "grid", gap: 12, padding: "14px 16px" }}>{cards}</div>
        </aside>
        <div style={{ gridColumn: "1 / -1", gridRow: 2, minWidth: 0, borderTop: "1px solid var(--line)", background: "var(--card)", padding: "12px 16px 14px" }}>
          {ruler}
        </div>
      </div>
    </div>
  );
}

function Centred({ children }) {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "56vh", padding: 20, textAlign: "center" }}>
      <div style={{ display: "grid", placeItems: "center" }}>{children}</div>
    </div>
  );
}

/** The full-screen toggle: quiet in the editor, light on the dark full-screen ground. */
function fullBtn(onDark) {
  return {
    width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center",
    marginLeft: onDark ? "auto" : 0,
    border: onDark ? "1px solid rgba(255,255,255,.25)" : "1px solid var(--line)",
    background: onDark ? "rgba(255,255,255,.08)" : "var(--card)",
    color: onDark ? "#fff" : "var(--ink-body)",
    borderRadius: 8, cursor: "pointer",
  };
}
