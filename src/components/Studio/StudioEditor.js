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
 * what the browser last read; a mismatch means something else saved in between
 * — nearly always the server's own work (a product demo, a voiceover) and not
 * another tab — and the answer is to merge, field by field, rather than to
 * overwrite work this tab never saw or to throw away the edit (mergeTimelines).
 *
 * ── NOTHING TO EDIT UNTIL IT IS FINISHED ─────────────────────────────────────
 * While the automatic edit runs, and while a product demo is built on top of
 * it, the editor is not shown at all: one animated screen (Working.js) carries
 * the whole wait with one percentage, and opens on the finished edit.
 *
 * ── AN EDIT IS NAMED ─────────────────────────────────────────────────────────
 * Every call to `edit()` carries a label — "Zoom level", "Add blur". It is what
 * undo announces, and it is also what makes a run of small changes to the same
 * control collapse into one undo step instead of forty.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onLiveEvent } from "../../realtime/socket";
// requestReview and resolveSuggestion are hidden with the Review tab (see TABS).
import { getDemo, saveTimeline, renameDemo, readScreens, requestCaptions, captionsFromScript, /* requestReview, resolveSuggestion, */ listBackgrounds, followBlur, getFollows, makeVoice, getVoice } from "./studioApi";
import { blurSig, applyState } from "./follow.mjs";
import { voiceSig } from "./voices.mjs";
import VoicePanel from "./VoicePanel";
import Working, { editPhase, demoPhase } from "./Working";
import Preview from "./Preview";
import Timeline from "./Timeline";
import ExportDialog from "./ExportDialog";
import { create } from "./create";
import { clipsOf, clipIdAt, splitPatch, deleteClipPatch, trimPatch } from "./clips";
// StepsPanel is hidden for now with the Steps tab (see TABS); put it back in
// this import when the tab returns.
// CanvasPanel and SuggestionsPanel are hidden with their tabs (see TABS): the
// canvas controls moved under the preview (CanvasBar.js).
import { VideoPanel, ZoomPanel, BlurPanel, CaptionsPanel, CaptionLine, CursorPanel, /* CanvasPanel, StepsPanel, SuggestionsPanel */ } from "./panels";
import CanvasBar from "./CanvasBar";
import CommandChat from "./CommandChat";
// The auto product demo: its screens and its status, from its own files.
import { AutoDemoDialog, AutoDemoStrip } from "./AutoDemo";
import { useAutoDemo } from "./autoDemoApi";
import Skeleton from "../Shell/Skeleton";
import { Btn, Icon, Drawer } from "./ui";
import { layout, clamp, fmtTime, toSource } from "./model";
import "./studio.css";

/** The inspector tab each kind of selectable thing is edited in. */
const TAB_OF = { clip: "video", zoom: "zoom", blur: "blur", cue: "captions" };

const TABS = [
  // Steps is hidden for now, not removed. Restoring it is this line, the
  // StepsPanel import above, `screensRead` and the panel block in `panel`, and
  // the default tab back to "steps".
  // { id: "steps", label: "Steps", icon: "steps" },
  // The recording as clips (panels.js VideoPanel, clips.js).
  { id: "video", label: "Video", icon: "film" },
  { id: "zoom", label: "Zoom", icon: "zoom" },
  { id: "blur", label: "Blur", icon: "blur" },
  { id: "captions", label: "Captions", icon: "caption" },
  { id: "cursor", label: "Cursor", icon: "cursor" },
  // The AI voiceover that reads the captions (VoicePanel.js).
  { id: "voice", label: "Voice", icon: "mic" },
  // Canvas moved under the preview (CanvasBar.js); Review is hidden for now.
  // Both are commented out, not removed, with their panel blocks in `panel`.
  // { id: "canvas", label: "Canvas", icon: "canvas" },
  // { id: "review", label: "Review", icon: "sparkle" },
];

/**
 * While a blur is applying, how often the editor checks on it itself, beside
 * the live messages (see the Apply section below), and how long without any
 * sign of progress before it says it is taking longer than usual.
 */
const APPLY_POLL_MS = 3000;
const APPLY_SLOW_MS = 25000;

/** Two sets of follows, keeping for each blur whichever was asked for last. */
function mergeFollows(a, b) {
  const out = { ...a };
  for (const [id, f] of Object.entries(b || {})) {
    if (!out[id] || (f.seq || 0) >= (out[id].seq || 0)) out[id] = f;
  }
  return out;
}

/**
 * ── AN AUTOMATIC EDIT CHOSEN AFTER RECORDING ─────────────────────────────────
 * "Zoom on clicks" (EditChoice.js) is answered while the recording uploads,
 * and the edit cannot start until the server has prepared the recording, which
 * happens after the editor opens. So the answer is written down here, by the
 * address the editor opens at, and the editor starts the edit itself the
 * moment the recording is ready (see "starts by itself" below). In
 * sessionStorage, so a reload in that window still starts it, and nothing
 * outlives the tab.
 */
const AUTO_EDIT = (key) => `clipo:auto-edit:${key}`;
export function rememberAutoEdit(key, opts = {}) {
  try {
    sessionStorage.setItem(AUTO_EDIT(key), JSON.stringify({ captions: !!opts.captions }));
  } catch {
    /* without storage the editor offers its button instead */
  }
}
function readAutoEdit(key) {
  try {
    const v = sessionStorage.getItem(AUTO_EDIT(key));
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
function forgetAutoEdit(key) {
  try {
    sessionStorage.removeItem(AUTO_EDIT(key));
  } catch {
    /* nothing to forget */
  }
}

const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * Three timelines into one, a top-level field at a time: `base` is what this
 * tab last had from the server, `mine` is what it has now, `theirs` is what
 * the server has now. A field this tab changed since `base` keeps this tab's
 * value; every other field is the server's. The server's own writes touch whole
 * fields of their own (captions and voice, a blur's follow), so this keeps both
 * sides' work in every case but the one where both changed the same field —
 * and there the creator's change, the one they can see, wins.
 */
function mergeTimelines(base, mine, theirs) {
  if (!theirs) return mine;
  if (!mine || !base) return theirs;
  const out = { ...theirs };
  for (const k of new Set([...Object.keys(mine), ...Object.keys(base)])) {
    if (same(mine[k], base[k])) continue;
    if (mine[k] === undefined) delete out[k];
    else out[k] = mine[k];
  }
  return out;
}

/** Of the whole wait for a product demo, the share that is the automatic edit. */
const EDIT_SHARE = 0.55;

/** Changes closer together than this, to the same thing, are one undo step. */
const COALESCE_MS = 700;
const SAVE_MS = 1000;

export default function StudioEditor({ demoId, config, onExit, onAnalyse }) {
  const [demo, setDemo] = useState(null);
  const [tl, setTl] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // The first tab, Video, while Steps is hidden (see TABS).
  const [tab, setTab] = useState("video");
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

  // ── Blurs that follow what they cover (follow.mjs, backend blurTrack.js) ──
  // `follows`: each blur's follow as the server has it, merged by when it was
  // asked for, so a late answer never replaces a newer one. `following`: the
  // blurs being applied right now, { sig, progress, waiting, slow, since,
  // last } or { sig, failed, message }, for the timeline, the Blur panel, the
  // picture and Export (follow.mjs applyState).
  const [follows, setFollows] = useState({});
  const [following, setFollowing] = useState({});
  // The AI voiceover being made (VoicePanel, backend voice.js): { sig,
  // progress } or { sig, failed, message }; null when none is.
  const [voicing, setVoicing] = useState(null);
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
  // The timeline as the server last had it, for merging (mergeTimelines).
  const baseRef = useRef(null);
  // Merges in a row; a server that keeps saying "stale" is not looped on.
  const staleRun = useRef(0);
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
            baseRef.current = d.demo.timeline;
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

  // The auto product demo (AutoDemo.js): followed on its own, and the demo is
  // read again whenever a run finishes or is undone, so its captions and voice
  // appear without a reload.
  // A product demo that has just finished keeps the working screen up until
  // the demo it made has been read, so the editor opens on the finished edit
  // rather than on the old one for a moment.
  const [held, setHeld] = useState(false);
  const auto = useAutoDemo(demoId, {
    onSettled: async () => {
      try {
        await load(true);
      } finally {
        setHeld(false);
      }
    },
  });
  useEffect(() => {
    if (auto.active) setHeld(true);
  }, [auto.active]);
  const [autoOpen, setAutoOpen] = useState(false);

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
      // A blur being followed, or its follow: applied here, without reading
      // the whole demo again — these arrive twice a second while one runs.
      if (e.follow || e.following) {
        if (e.follow) {
          setFollows((p) => mergeFollows(p, { [e.follow.id]: e.follow }));
          setFollowing((p) => {
            if (!p[e.follow.id]) return p;
            const n = { ...p };
            delete n[e.follow.id];
            return n;
          });
        }
        if (e.following) {
          setFollowing((p) => {
            const was = p[e.following.id] || {};
            const moved = (e.following.progress || 0) > (was.progress || 0);
            return {
              ...p,
              [e.following.id]: {
                ...was,
                ...e.following,
                // Started once there is any progress at all; "last" is when
                // there last was, which is what "slow" is measured from.
                waiting: !!was.waiting && !moved,
                slow: moved ? false : !!was.slow,
                last: moved ? Date.now() : was.last || Date.now(),
              },
            };
          });
        }
        if (e.notice) setNotice(e.notice);
        return;
      }
      // What the chat is doing while it works ("Looking at the frame…"): the
      // chat reads it itself (CommandChat.js); nothing in the demo changed.
      if (e.command) return;
      // The voiceover being made: its progress, without reading the demo again.
      // Only for the one asked for last; an older one still finishing is not it.
      if (e.voicing) {
        setVoicing((p) => (p && p.sig !== e.voicing.sig ? p : { ...(p || {}), ...e.voicing }));
        return;
      }
      if (e.voiceover) setVoicing((p) => (p && p.sig === e.voiceover.sig ? null : p));
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
        baseRef.current = current;
        staleRun.current = 0;
        // Clean only if nothing was edited while this was on the wire.
        if (editGen.current === gen) dirty.current = false;
      } catch (err) {
        if (err?.response?.data?.stale && staleRun.current < 3) {
          /**
           * ── SOMETHING ELSE SAVED: KEEP BOTH ───────────────────────────────
           * Almost never another tab. The server writes this timeline too —
           * a product demo's captions and voice, a voiceover, a blur following
           * what it covers — and an edit made after one of those landed, before
           * this tab re-read it, arrives with the old revision. That used to
           * throw the edit away, reload, and announce "This recording changed
           * in another tab", which was untrue and lost the creator's change.
           * Now the two are merged (mergeTimelines) and the merge is saved at
           * once with the new revision. Quietly, because nothing was lost.
           */
          staleRun.current += 1;
          try {
            const d = await getDemo(demoId);
            const merged = mergeTimelines(baseRef.current, tlRef.current, d.demo.timeline);
            setDemo(d.demo);
            revRef.current = d.demo.rev;
            baseRef.current = d.demo.timeline;
            if (merged) {
              tlRef.current = merged;
              setTl(merged);
            }
            retryIn = 1;
          } catch {
            retryIn = SAVE_MS * 4;
          }
        } else if (err?.response?.data?.stale) {
          // Merged three times and still refused: take the server's copy.
          staleRun.current = 0;
          setNotice("This recording was changed somewhere else, so it was reloaded.");
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

  // Read by changeItem at the moment of an edit, without re-creating it on
  // every frame the playhead moves.
  const timeRef = useRef(0);
  timeRef.current = time;
  const layRef = useRef(null);

  const changeItem = useCallback(
    ({ kind, id, patch }) => {
      const list = { zoom: "zooms", blur: "blurs", cue: "cues" }[kind];
      if (!list) return;
      // A blur's rectangle moved or resized on the picture: it is now right
      // at THIS moment of the recording, which is where following it starts.
      const placed =
        kind === "blur" && ("x" in patch || "y" in patch || "w" in patch || "h" in patch) && layRef.current
          ? { at: Math.round(toSource(timeRef.current, layRef.current) * 1000) / 1000 }
          : null;
      edit(
        { [list]: (tlRef.current?.[list] || []).map((x) => (x.id === id ? { ...x, ...patch, ...placed } : x)) },
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
    if (sel.kind === "clip") {
      const clip = clipsOf(cur, layout(cur)).find((c) => c.id === sel.id);
      if (clip) deleteClipRef.current?.(clip);
      return;
    }
    const list = { zoom: "zooms", blur: "blurs", cue: "cues" }[sel.kind];
    if (!list) return;
    edit({ [list]: (cur[list] || []).filter((x) => x.id !== sel.id) }, `Remove ${sel.kind === "cue" ? "caption" : sel.kind}`);
    setSelection(null);
  }, [selection, edit]);

  /**
   * ── AN EDIT ASKED FOR IN WORDS (CommandChat.js) ────────────────────────────
   * The server says what to change; it is changed here, through edit(), so it
   * autosaves, previews and undoes like one made by hand. Applied against the
   * timeline as it is NOW: a zoom the creator deleted while the answer was on
   * its way is simply not there to trim.
   *
   * What comes back is how to take it back again, and only it: the chat's own
   * Undo removes what this added and puts back what it removed or shortened,
   * so it still works after other edits, where stepping the undo stack back
   * would throw those away too.
   */
  const applyCommand = useCallback(
    (ops, label) => {
      const cur = tlRef.current;
      if (!cur || !ops) return null;
      const drop = new Set(ops.remove || []);
      const ends = new Map((ops.trim || []).map((t) => [t.id, t.end]));
      const removed = [];
      const trimmed = [];
      const kept = [];
      for (const z of cur.zooms || []) {
        if (drop.has(z.id)) {
          removed.push(z);
        } else if (ends.has(z.id) && ends.get(z.id) < z.end) {
          trimmed.push({ id: z.id, end: z.end });
          kept.push({ ...z, end: ends.get(z.id) });
        } else {
          kept.push(z);
        }
      }
      const added = (ops.add || []).filter((z) => !kept.some((k) => k.id === z.id));

      // Blurs the same way: made in their applied form (the server builds
      // them like appliedForm does), so the caller only has to follow them.
      const dropBlurs = new Set(ops.removeBlurs || []);
      const removedBlurs = (cur.blurs || []).filter((b) => dropBlurs.has(b.id));
      const keptBlurs = (cur.blurs || []).filter((b) => !dropBlurs.has(b.id));
      const addedBlurs = (ops.addBlurs || []).filter((b) => !keptBlurs.some((k) => k.id === b.id));

      if (!added.length && !removed.length && !trimmed.length && !addedBlurs.length && !removedBlurs.length) return null;
      const patch = {};
      if (added.length || removed.length || trimmed.length) patch.zooms = [...kept, ...added];
      if (addedBlurs.length || removedBlurs.length) patch.blurs = [...keptBlurs, ...addedBlurs];
      edit(patch, label);
      return {
        added: added.map((z) => z.id),
        removed,
        trimmed,
        addedBlurs: addedBlurs.map((b) => b.id),
        removedBlurs,
        // For the caller to follow: blurs are applied the moment they are made.
        newBlurs: addedBlurs,
      };
    },
    [edit]
  );

  const undoCommand = useCallback(
    (u) => {
      const cur = tlRef.current;
      if (!cur || !u) return false;
      const patch = {};
      const gone = new Set(u.added || []);
      if (gone.size || u.removed?.length || u.trimmed?.length) {
        const ends = new Map((u.trimmed || []).map((t) => [t.id, t.end]));
        let zooms = (cur.zooms || []).filter((z) => !gone.has(z.id)).map((z) => (ends.has(z.id) ? { ...z, end: ends.get(z.id) } : z));
        const have = new Set(zooms.map((z) => z.id));
        zooms = [...zooms, ...(u.removed || []).filter((z) => !have.has(z.id))];
        patch.zooms = zooms;
      }
      const goneBlurs = new Set(u.addedBlurs || []);
      if (goneBlurs.size || u.removedBlurs?.length) {
        // A blur put back keeps its id, so its follow (still stored under that
        // id, and signed for exactly this blur) applies to it again.
        let blurs = (cur.blurs || []).filter((b) => !goneBlurs.has(b.id));
        const have = new Set(blurs.map((b) => b.id));
        blurs = [...blurs, ...(u.removedBlurs || []).filter((b) => !have.has(b.id))];
        patch.blurs = blurs;
      }
      edit(patch, "Undo chat edit");
      setSelection((s) => (s && ((s.kind === "zoom" && gone.has(s.id)) || (s.kind === "blur" && goneBlurs.has(s.id))) ? null : s));
      return true;
    },
    [edit]
  );

  /* ── Clips and cuts ───────────────────────────────────────────────────── */

  const lay = useMemo(() => (tl ? layout(tl) : null), [tl]);
  layRef.current = lay;

  // Follows the server already has, whenever the demo is read.
  useEffect(() => {
    if (demo?.follows) setFollows((p) => mergeFollows(p, demo.follows));
  }, [demo?.follows]);

  /**
   * ── APPLY ──────────────────────────────────────────────────────────────────
   * A blur is placed (dragged over the secret at one moment of the recording)
   * and then applied, when the creator says so: it is followed through the
   * WHOLE recording from that moment, and covers the secret wherever and
   * whenever it is on screen. So applying also widens it to the whole
   * recording; where it actually shows comes from the follow, not from a span
   * anyone has to drag. Nothing is followed behind the creator's back any
   * more: a blur that quietly stood still while the page scrolled, with
   * nothing saying it was still being worked on, read as a blur that does not
   * work. Each blur says where it is (follow.mjs applyState), and the editor
   * checks on the ones applying itself every APPLY_POLL_MS rather than relying
   * on live messages alone, so nothing can sit on "Applying…" for ever.
   */
  const requestFollow = useCallback(
    (b) => {
      const sig = blurSig(b);
      const now = Date.now();
      setFollowing((p) => ({ ...p, [b.id]: { sig, progress: 0, waiting: true, slow: false, since: now, last: now } }));
      followBlur(demoId, b).catch((err) => {
        setFollowing((p) =>
          p[b.id]?.sig === sig
            ? { ...p, [b.id]: { sig, failed: true, message: err?.response?.data?.message || "We couldn't apply that blur" } }
            : p
        );
      });
    },
    [demoId]
  );

  /** The blur as it is applied: anchored where it was placed, over the whole recording. */
  const appliedForm = useCallback((b) => {
    const cur = tlRef.current;
    const lay0 = layRef.current;
    const whole = cur?.duration || b.end;
    // Never placed by hand: it is applied as it is shown, at the moment on
    // screen if that is inside it, or at its start.
    const at = b.at ?? Math.round(clamp(lay0 ? toSource(timeRef.current, lay0) : b.start, b.start, b.end) * 1000) / 1000;
    return { ...b, at, start: 0, end: Math.round(whole * 1000) / 1000 };
  }, []);

  /** Apply these blurs (ids), as one undo step. */
  const applyBlurs = useCallback(
    (ids) => {
      const cur = tlRef.current;
      if (!cur) return;
      const want = new Set(ids);
      const done = [];
      const blurs = (cur.blurs || []).map((b) => {
        if (!want.has(b.id)) return b;
        const nb = appliedForm(b);
        done.push(nb);
        return nb;
      });
      if (!done.length) return;
      edit({ blurs }, done.length === 1 ? "Apply blur" : "Apply blurs");
      for (const b of done) requestFollow(b);
    },
    [appliedForm, edit, requestFollow]
  );
  const applyBlur = useCallback(
    (b) => {
      select({ kind: "blur", id: b.id });
      applyBlurs([b.id]);
    },
    [applyBlurs, select]
  );

  // Checking on the blurs being applied. Only while there are any.
  const applyingIds = useMemo(
    () => (tl?.blurs || []).filter((b) => applyState(b, follows, following).kind === "applying").map((b) => b.id).join(","),
    [tl, follows, following]
  );
  useEffect(() => {
    if (!applyingIds) return undefined;
    let live = true;
    const check = async () => {
      let res = null;
      try {
        res = await getFollows(demoId);
      } catch {
        // A missed check is only a missed check; the next one, or a live
        // message, catches up.
      }
      if (!live) return;
      if (res?.follows) setFollows((p) => mergeFollows(p, res.follows));
      const jobs = res?.jobs || {};
      const now = Date.now();
      setFollowing((p) => {
        let n = p;
        for (const [id, run] of Object.entries(p)) {
          if (!run || run.failed) continue;
          const job = jobs[id];
          let next = run;
          if (job && job.sig === run.sig) {
            if (job.status === "failed") next = { sig: run.sig, failed: true, message: job.error || "We couldn't apply that blur" };
            else if (job.status === "running" && run.waiting) next = { ...run, waiting: false, last: now };
          }
          if (!next.failed && !next.slow && now - (next.last || next.since || now) > APPLY_SLOW_MS) next = { ...next, slow: true };
          if (next !== run) {
            if (n === p) n = { ...p };
            n[id] = next;
          }
        }
        return n;
      });
    };
    const timer = setInterval(check, APPLY_POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [applyingIds, demoId]);

  // Blurs being applied that this tab did not ask for. The ones the vision
  // pass finds are applied by the server the moment it saves them, and a tab
  // opened or reloaded after that missed the live "started" message, so it
  // would offer "Apply" on a blur already being applied. Asked once each time
  // the set of blurs showing as not applied changes.
  const unappliedIds = useMemo(
    () => (tl?.blurs || []).filter((b) => applyState(b, follows, following).kind === "unapplied").map((b) => b.id).join(","),
    [tl, follows, following]
  );
  useEffect(() => {
    if (!unappliedIds) return undefined;
    let live = true;
    getFollows(demoId)
      .then((res) => {
        if (!live) return;
        if (res?.follows) setFollows((p) => mergeFollows(p, res.follows));
        const jobs = res?.jobs || {};
        const now = Date.now();
        setFollowing((p) => {
          let n = p;
          for (const id of unappliedIds.split(",")) {
            const job = jobs[id];
            const b = (tlRef.current?.blurs || []).find((x) => x.id === id);
            if (!job || !b || blurSig(b) !== job.sig || p[id]?.sig === job.sig) continue;
            let run = null;
            if (job.status === "failed") run = { sig: job.sig, failed: true, message: job.error || "We couldn't apply that blur" };
            else if (job.status === "queued" || job.status === "running") {
              run = { sig: job.sig, progress: 0, waiting: job.status === "queued", slow: false, since: now - (job.age || 0) * 1000, last: now };
            }
            if (!run) continue;
            if (n === p) n = { ...p };
            n[id] = run;
          }
          return n;
        });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [unappliedIds, demoId]);

  /**
   * ── THE AI VOICEOVER ──────────────────────────────────────────────────────
   * Apply makes it on the server from the captions as they are now, in the
   * voice chosen, and turns it on. Captions and voice unchanged since the one
   * already made: it is only turned on, nothing is made again.
   */
  const applyVoice = useCallback(
    (voice) => {
      const cur = tlRef.current;
      if (!cur) return;
      const cues = (cur.cues || []).filter((c) => String(c.text || "").trim());
      if (!cues.length) return;
      if (!cur.voice?.on) edit({ voice: { ...(cur.voice || {}), on: true } }, "Voiceover on");
      const sig = voiceSig(voice, cues);
      if (demoRef.current?.voiceover?.sig === sig) return;
      setVoicing({ sig, progress: 0 });
      makeVoice(demoId, voice, cues)
        .then((r) => setVoicing((p) => (p && p.sig === sig && r?.sig && r.sig !== sig ? { ...p, sig: r.sig } : p)))
        .catch((err) =>
          setVoicing((p) => (p && p.sig === sig ? { sig, failed: true, message: err?.response?.data?.message || "We couldn't make the voiceover. Try again." } : p))
        );
    },
    [demoId, edit]
  );

  // Checked on while one is being made, beside the live messages, so a lost
  // one never leaves "Making the voiceover…" up for ever.
  const voicingSig = voicing && !voicing.failed ? voicing.sig : "";
  useEffect(() => {
    if (!voicingSig) return undefined;
    let live = true;
    const timer = setInterval(async () => {
      const res = await getVoice(demoId).catch(() => null);
      if (!live || !res) return;
      if (res.voiceover?.sig === voicingSig) {
        setVoicing((p) => (p && p.sig === voicingSig ? null : p));
        load(true);
      } else if (res.job?.sig === voicingSig && res.job.status === "failed") {
        setVoicing((p) => (p && p.sig === voicingSig ? { sig: voicingSig, failed: true, message: res.job.error } : p));
      }
    }, APPLY_POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [voicingSig, demoId, load]);

  // One already being made when the tab opens (the page was reloaded while it
  // ran, say): shown as being made rather than offered again.
  useEffect(() => {
    if (tab !== "voice" || voicing) return undefined;
    let live = true;
    getVoice(demoId)
      .then((res) => {
        const job = res?.job;
        if (!live || !job || !["queued", "running"].includes(job.status) || res.voiceover?.sig === job.sig) return;
        setVoicing((p) => p || { sig: job.sig, progress: 0 });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [tab, voicing, demoId]);

  // "Cut here" on the video lane: split the clip under that moment in two,
  // taking nothing out (clips.js). A moment too near a clip's edge is ignored.
  const addSplit = useCallback(
    (srcT) => {
      const cur = tlRef.current;
      if (!cur) return;
      const patch = splitPatch(cur, layout(cur), srcT);
      if (patch) edit(patch, "Cut");
    },
    [edit]
  );

  // A clip's edge let go of after a drag on the timeline (clips.js trimPatch).
  // The clip stays selected: its id follows its start, so a trimmed start
  // gives it a new one.
  const trimClip = useCallback(
    (clip, side, to) => {
      const cur = tlRef.current;
      if (!cur) return;
      const r = trimPatch(cur, clip, side, to);
      if (!r) return;
      edit(r.patch, "Trim clip");
      select({ kind: "clip", id: clipIdAt(r.start) });
    },
    [edit, select]
  );

  // Take a clip out: a cut over exactly its stretch. The last clip stays,
  // because a demo with nothing left in it cannot be exported.
  const deleteClipRef = useRef(null);
  const deleteClip = useCallback(
    (clip) => {
      const cur = tlRef.current;
      if (!cur) return;
      if (clipsOf(cur, layout(cur)).length <= 1) {
        setNotice("A demo needs at least one clip, so the last one stays.");
        return;
      }
      edit(deleteClipPatch(cur, clip), "Delete clip");
      setSelection(null);
    },
    [edit]
  );
  deleteClipRef.current = deleteClip;

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
  const startAnalyse = useCallback(async (opts) => {
    setStarting(true);
    setNotice("");
    try {
      await onAnalyse(demo, opts);
    } finally {
      await load(true);
      setStarting(false);
    }
  }, [onAnalyse, demo, load]);

  /**
   * ── AN AUTOMATIC EDIT WAS CHOSEN: IT STARTS BY ITSELF ──────────────────────
   * Right after recording the edit cannot start yet (the recording is still
   * being prepared), which is why the creator would otherwise press "Edit it
   * automatically" here. When they already chose an automatic edit after
   * recording — "Zoom on clicks" (rememberAutoEdit), or a product demo, which
   * is built on top of one — that press is made for them, once, the moment the
   * recording is ready: the same button's action, the same price. If it could
   * not start (credits, a limit), the normal screen and its button come back
   * with the reason.
   */
  const autoWaiting = auto.ad?.status === "waiting";
  const [autoIntent] = useState(() => readAutoEdit(demoId));
  const wantAuto = autoWaiting || !!autoIntent;
  const canAutoStart =
    !!demo && !tl && demo.status === "ready" && demo.recording?.status === "ready" &&
    !["running", "failed"].includes(demo.analysis?.status);
  const autoStarted = useRef(false);
  const [autoTried, setAutoTried] = useState(false);
  useEffect(() => {
    if (!wantAuto || !canAutoStart || autoStarted.current) return;
    autoStarted.current = true;
    // Asked once: a refusal shows the button and its reason, and a reload does
    // not ask again.
    forgetAutoEdit(demoId);
    startAnalyse({ captions: !autoWaiting && !!autoIntent?.captions }).finally(() => setAutoTried(true));
  }, [wantAuto, canAutoStart, startAnalyse, demoId, autoWaiting, autoIntent]);

  /**
   * ── ONE WAIT, ONE SCREEN, ONE NUMBER ───────────────────────────────────────
   * What the working screen shows, or null when there is nothing to wait for.
   * A product demo is one percentage across both halves: the automatic edit
   * is the first EDIT_SHARE of it and the demo the rest, so the number never
   * goes back to zero halfway. A demo made again from inside the editor, on an
   * edit that already exists, is the demo's stages alone ("demoOnly"); which of
   * the two a build is, is decided when it is first seen and kept.
   */
  const building = auto.active || held;
  const buildTrack = useRef(null);
  if (!building) buildTrack.current = null;
  else if (!buildTrack.current && demo) buildTrack.current = tl && demo.status !== "analysing" ? "demoOnly" : "demo";
  const track = building || autoWaiting ? buildTrack.current || "demo" : "edit";
  const editShare = track === "demo" ? EDIT_SHARE : 1;

  let working = null;
  if (demo && !error) {
    const preparing = demo.status === "preparing" || demo.recording?.status === "processing";
    if (preparing && wantAuto) {
      working = { track, phase: track === "demoOnly" ? "script" : "watch", progress: 0.01 + 0.01 * (demo.progress || 0) };
    } else if (demo.status === "analysing") {
      working = { track, phase: editPhase(demo.stage, demo.progress), progress: editShare * (demo.progress || 0) };
    } else if (!tl && wantAuto && demo.status !== "failed" && (!autoTried || starting)) {
      working = { track, phase: "watch", progress: 0.02 };
    } else if (tl && building) {
      const ad = auto.ad;
      const p = ad?.status === "running" ? ad.progress || 0 : ad?.status === "waiting" ? 0 : 1;
      working = track === "demoOnly"
        ? { track, phase: demoPhase(ad?.stage), progress: p }
        : { track, phase: demoPhase(ad?.stage), progress: EDIT_SHARE + (1 - EDIT_SHARE) * p };
    }
  }

  // When the wait ends the screen stays a moment longer, runs its number to
  // 100 and then hands over (Working.js `complete`), instead of cutting away
  // from 87% to the editor.
  const [veil, setVeil] = useState(false);
  const lastWork = useRef(null);
  if (working) lastWork.current = working;
  const isWorking = !!working;
  useEffect(() => {
    if (isWorking) setVeil(true);
  }, [isWorking]);

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
        baseRef.current = d.demo.timeline;
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
      // Typing belongs to the field. A slider or a toggle is not typing: with
      // one focused (just after dragging Size, say) Delete still deletes the
      // selection, and only the arrow keys are left to the control itself.
      const control = el?.tagName === "INPUT" && ["range", "checkbox", "radio", "color", "button"].includes(el.type);
      if (el && ((el.tagName === "INPUT" && !control) || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) stepForward();
        else stepBack();
      } else if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !control) {
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

  // The finale only for a finished edit: not after a refusal (no edit) or a
  // demo that failed (the strip in the editor says so instead).
  const finale = veil && !!lastWork.current && !!tl && demo.status !== "failed" && auto.ad?.status !== "failed";
  if (working || finale) {
    const w = working || lastWork.current;
    return (
      <Working
        track={w.track}
        phase={w.phase}
        progress={w.progress}
        complete={!working}
        onComplete={() => setVeil(false)}
      />
    );
  }

  // Whether a product demo is building is read separately from the demo; until
  // that answer is in, an edit that may be about to be replaced is not shown.
  if (tl && auto.ad === undefined) return <EditorSkeleton narrow={narrow} />;

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
        <Btn kind="primary" size="l" icon={<Icon name="wand" size={15} />} disabled={starting} onClick={() => startAnalyse()}>
          {starting ? "Starting…" : "Edit it automatically"}
        </Btn>
      </Centred>
    );
  }

  /* ── The editor ───────────────────────────────────────────────────────── */

  const total = lay?.duration || 0;
  const panelProps = { tl, selection, onSelect: select, edit, time, seek };

  // Where the blurs are with being applied, for Export: exporting one that is
  // not applied draws it standing still while what it covers scrolls away.
  const blurStates = (tl.blurs || []).map((b) => applyState(b, follows, following).kind);
  const blurCounts = {
    unapplied: blurStates.filter((k) => k === "unapplied" || k === "failed").length,
    applying: blurStates.filter((k) => k === "applying").length,
  };
  const applyAll = () =>
    applyBlurs((tl.blurs || []).filter((b) => ["unapplied", "failed"].includes(applyState(b, follows, following).kind)).map((b) => b.id));

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
      <Btn
        size="s"
        kind="quiet"
        onClick={() => setAutoOpen(true)}
        disabled={auto.active}
        title={auto.active ? "Your product demo is being built" : "Write a script, captions and a voice from a description"}
        icon={<Icon name="wand" size={15} />}
      >
        {narrow ? "" : "Product demo"}
      </Btn>
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

  const noticeBar = notice ? (
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
  const banner = (
    <>
      {noticeBar}
      <AutoDemoStrip demoId={demoId} ad={auto.ad} onUndo={auto.undo} onRetry={() => setAutoOpen(true)} />
    </>
  );

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
        follows={follows}
        following={following}
        onApplyBlur={applyBlur}
        // The AI voiceover, played with the picture when it is on.
        voice={{ url: demo.voiceover?.url || "", on: !!(tl.voice?.on && demo.voiceover?.url), keepOriginal: !!tl.voice?.keep_original }}
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

  /**
   * One row under the picture: play and the time on the left; the frame
   * around the picture (shape, size, corners, shadow, background: CanvasBar.js)
   * towards the right; full screen at the far end. Everything is compact so it
   * fits one line on a laptop, and wraps rather than clips on anything narrower.
   * "Cut here" is on the timeline's video lane.
   */
  const transport = (
    <div
      className="st-stage"
      style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: narrow ? "8px 14px" : "10px 2px 2px" }}
    >
      <Btn
        kind="primary"
        size="xs"
        onClick={() => setPlaying((p) => !p)}
        aria-label={playing ? "Pause" : "Play"}
        title="Play / pause (Space)"
        icon={<Icon name={playing ? "pause" : "play"} size={12} />}
        style={{ width: 32, height: 28, padding: 0 }}
      />
      <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
        {fmtTime(time, true)} <span style={{ color: "var(--ink-mute)", fontWeight: 500 }}>/ {fmtTime(total, true)}</span>
      </span>
      {/* No Delete button here: a selection is deleted with the Delete key,
          or from its row in the sidebar, and a button that appeared and
          vanished with the selection kept pushing this row onto two lines. */}
      <div style={{ marginLeft: "auto" }}>
        <CanvasBar
          tl={tl}
          edit={edit}
          backgrounds={backgrounds}
          onUploaded={(b) => setBackgrounds((list) => [b, ...(list || []).filter((x) => x.id !== b.id)])}
          onDeleted={(id) => setBackgrounds((list) => (list || []).filter((x) => x.id !== id))}
        />
      </div>
      <button type="button" onClick={toggleFull} title="Full screen" aria-label="Full screen" style={{ ...fullBtn(false), width: 28, height: 28 }}>
        <Icon name="expand" size={14} />
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
      {tab === "video" && (
        <VideoPanel
          tl={tl}
          selection={selection}
          onSelect={select}
          seek={seek}
          onDeleteClip={deleteClip}
          onRestoreCut={removeCut}
        />
      )}
      {tab === "zoom" && <ZoomPanel {...panelProps} />}
      {tab === "blur" && (
        <BlurPanel
          {...panelProps}
          read={blurChecked}
          reading={reading}
          onRead={onRead}
          readCost={readCost}
          follows={follows}
          following={following}
          onApply={applyBlur}
        />
      )}
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
      {tab === "voice" && (
        <VoicePanel tl={tl} edit={edit} demo={demo} voicing={voicing} onApply={applyVoice} onGoCaptions={() => openTab("captions")} />
      )}
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

  // ── One caption line, in a drawer over the inspector ─────────────────────
  // It used to open as a card under the list of lines, below the fold of a
  // column that was already long; a drawer puts it in front of the creator
  // the moment they pick a line, and closing it (x, Escape, or picking
  // nothing) leaves the list exactly as it was.
  const cues = tl.cues || [];
  const cueSel = tab === "captions" && selection?.kind === "cue" ? cues.find((c) => c.id === selection.id) || null : null;
  const cueNo = cueSel ? [...cues].sort((a, b) => a.start - b.start).findIndex((c) => c.id === cueSel.id) + 1 : 0;
  const lineDrawer = (
    <Drawer
      open={!!cueSel}
      title="This line"
      sub={cueSel ? `Line ${cueNo} of ${cues.length} · ${fmtTime(cueSel.start, true)}` : ""}
      onClose={() => select(null)}
    >
      {cueSel && <CaptionLine tl={tl} cue={cueSel} edit={edit} />}
    </Drawer>
  );

  // The chat: a button over the inspector's corner, and a drawer over the
  // inspector when open, so the picture and the timeline stay in view while
  // the edit it makes lands on them.
  const chat = (
    <CommandChat
      demoId={demoId}
      tl={tl}
      time={time}
      total={total}
      selection={selection}
      onApply={applyCommand}
      onUndo={undoCommand}
      onFollow={requestFollow}
      onSelect={select}
      onSeek={seek}
    />
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
      onSplit={addSplit}
      onTrim={trimClip}
      onDelete={removeSelected}
      follows={follows}
      following={following}
      onApplyBlur={applyBlur}
      // Taller lanes on a desk: bigger chips to grab, drag and resize.
      height={narrow ? 30 : 42}
    />
  );

  const dialog = exporting ? (
    <ExportDialog
      demo={demo}
      config={config}
      outputSeconds={total}
      blurs={blurCounts}
      onApplyBlurs={applyAll}
      onClose={() => setExporting(false)}
      onChanged={() => load(true)}
      beforeExport={save}
    />
  ) : null;
  const autoDialog = autoOpen ? (
    <AutoDemoDialog
      ad={auto.ad}
      hasCaptions={(tl.cues || []).length > 0}
      onClose={() => setAutoOpen(false)}
      onStart={async (brief, voice) => {
        // Anything unsaved goes first, so the demo is written over the edit
        // as the creator has it rather than racing their autosave.
        await save();
        await auto.start(brief, voice);
      }}
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
        <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
          {/* Bottom padding clears the chat button, so the last card can scroll out from under it. */}
          <div className="st-scroll" style={{ flex: 1, minHeight: 0, display: "grid", gap: 12, alignContent: "start", gridAutoRows: "max-content", padding: "12px 14px 80px", background: "var(--paper)" }}>
            {panel}
          </div>
          {lineDrawer}
          {chat}
        </div>
        <div style={{ flexShrink: 0, borderTop: "1px solid var(--line)", background: "var(--card)", padding: "10px 12px 12px", overflowX: "auto" }}>
          {ruler}
        </div>
        {dialog}
        {autoDialog}
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
        <aside style={{ gridColumn: 2, gridRow: 1, minHeight: 0, position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", borderLeft: "1px solid var(--line)", background: "var(--paper)" }}>
          {tabs}
          {/* Bottom padding clears the chat button, so the last card can scroll out from under it. */}
          <div className="st-scroll" style={{ flex: 1, minHeight: 0, display: "grid", gap: 12, alignContent: "start", gridAutoRows: "max-content", padding: "14px 16px 80px" }}>
            {panel}
          </div>
          {lineDrawer}
          {chat}
        </aside>
        <div style={{ gridColumn: "1 / -1", gridRow: 2, minWidth: 0, borderTop: "1px solid var(--line)", background: "var(--card)", padding: "12px 16px 14px" }}>
          {ruler}
        </div>
      </div>
      {dialog}
      {autoDialog}
    </div>
  );
}

const LABELS = { zoom: "Zoom", blur: "Blur", cue: "Caption" };

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
  // The row under the picture: play and time, the canvas controls, full screen.
  const transport = (
    <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: narrow ? "8px 14px" : "10px 2px 2px" }}>
      <Skeleton variant="rectangular" width={32} height={28} style={onStage} />
      <Skeleton variant="rectangular" width={84} height={11} style={{ ...onStage, borderRadius: 6 }} />
      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
        <Skeleton variant="rectangular" width={140} height={24} style={onStage} />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="rectangular" width={100} height={10} style={{ ...onStage, borderRadius: 5 }} />
        ))}
        <Skeleton variant="rectangular" width={104} height={26} style={onStage} />
      </span>
      <Skeleton variant="rectangular" width={28} height={28} style={onStage} />
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
      {[0, 1, 2, 3].map((i) => (
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
