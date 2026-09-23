import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * StudioDemo: one screen recording and the edit built from it.
 *
 * ── ONE RECORDING, NOT A PROJECT OF MANY ─────────────────────────────────────
 * The script editor's projects hold a pile of takes that get matched to lines.
 * A demo is the opposite shape: one continuous capture, and everything
 * interesting is what was DERIVED from it. So there is one recording here, and
 * the document's weight is in `timeline`.
 *
 * ── WHAT LIVES HERE AND WHAT DOES NOT ────────────────────────────────────────
 * The video does not. It goes to storage under one prefix per demo
 * (services/media/storage.js) and this row holds the keys. The timeline does:
 * it is small, it is read whole, and it changes on every adjustment.
 *
 * The recovered pointer path lives inside the timeline, and it is the one part
 * that can get big — sixty samples a second over twenty minutes. It is thinned
 * by the tracker and capped in sanitizeTimeline(); if it ever needs to grow
 * past what a document can hold, it moves to its own collection keyed by demo,
 * not into an array here.
 *
 * ── IT EXPIRES ───────────────────────────────────────────────────────────────
 * Footage is heavy and the finished video is the point, so the files are
 * deleted STUDIO_RETENTION_DAYS after the demo was last touched. `expires_at`
 * moves forward on every upload, save and export. The row survives with
 * `purged: true` so the library can say what happened rather than showing a
 * demo that silently fails to open.
 */

const RecordingSchema = new Schema(
  {
    status: { type: String, enum: ["uploading", "uploaded", "processing", "ready", "failed"], default: "uploading" },

    key: { type: String, default: "" },        // what the browser sent
    mp4_key: { type: String, default: "" },    // remuxed, with a real duration
    proxy_key: { type: String, default: "" },  // the 540p copy the editor plays
    audio_key: { type: String, default: "" },  // the speech track captions read
    thumb_key: { type: String, default: "" },

    // An upload in flight: the browser's own name for it, so asking twice
    // starts one upload rather than two, and the resumable session, so a
    // dropped connection carries on from the last byte. Never sent out.
    client_key: { type: String, default: "" },
    upload_url: { type: String, default: "" },

    filename: { type: String, default: "" },
    mime: { type: String, default: "" },
    size: { type: Number, default: 0 },
    duration: { type: Number, default: 0 },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    fps: { type: Number, default: 0 },
    has_audio: { type: Boolean, default: false },
    error: { type: String, default: "" },
  },
  { _id: false }
);

/**
 * What the browser saw while it was recording.
 *
 * Kept for two reasons. It is what the analysis is re-run FROM when a threshold
 * in services/studio/events.js changes, without asking anybody to record again.
 * And `tracker` records which version of the recovery code produced it, so a
 * demo analysed by an older tracker can be told apart from one that simply had
 * a difficult screen.
 */
const CaptureSchema = new Schema(
  {
    surface: { type: String, enum: ["monitor", "window", "browser", "unknown"], default: "unknown" },
    label: { type: String, default: "" },
    mic: { type: Boolean, default: false },
    system_audio: { type: Boolean, default: false },
    tracker: { type: String, default: "" },
    samples: { type: Number, default: 0 },
    // The raw tracker report. Conclusions are derived from it every analysis
    // (services/studio/events.js), never stored in place of it.
    track: { type: Schema.Types.Mixed, default: null },
    motion: { type: Schema.Types.Mixed, default: null },
    /**
     * The machine the demo was recorded on: OS family, the display's pixel
     * ratio, and its size in CSS pixels. The pointer's height in the recording
     * follows from the screen's width, and nothing on the server can work that
     * out from the video alone. Zeroes mean the browser did not report it —
     * every recording made before this existed — and the locator then measures
     * the recording as it always did. See capture.js environment().
     */
    env: {
      platform: {
        type: String,
        enum: ["windows", "macos", "linux", "chromeos", "android", "ios", "unknown"],
        default: "unknown",
      },
      scheme: { type: String, enum: ["light", "dark", "unknown"], default: "unknown" },
      dpr: { type: Number, default: 0 },
      screen_w: { type: Number, default: 0 },
      screen_h: { type: Number, default: 0 },
    },
    /**
     * The pointer itself, measured in the browser at full resolution while the
     * recording was being made — which design it is and how tall, the two
     * things services/studio/locate.js otherwise has to discover by searching
     * the encoded video, and which it sometimes discovers wrongly for a whole
     * recording at a stretch.
     *
     * `confidence` is how much the readings agreed with each other. An empty
     * design or a zero height means the browser could not read the pointer —
     * a demo where it never moved far enough to be measured, or one recorded
     * before this existed — and the locator then searches as it always did.
     */
    cursor: {
      design: { type: String, enum: ["light", "dark", ""], default: "" },
      height_px: { type: Number, default: 0 },
      samples: { type: Number, default: 0 },
      confidence: { type: Number, default: 0 },
    },
    /**
     * How often the browser actually handed over a frame while recording.
     *
     * `recording.fps` is frames ÷ duration, and a screen capture only emits a
     * frame when the screen CHANGES — so an average of thirteen a second may be
     * thirty during every scroll and two over a still page. Those two have
     * opposite causes and opposite fixes, and the average cannot tell them
     * apart. This is the distribution: see capture.js cadenceOf().
     *
     * Mixed because it is a measurement whose shape will change as we learn
     * what to ask of it, and because nothing decides anything from it yet.
     * Absent on every recording made before this existed.
     */
    frames: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const AnalysisSchema = new Schema(
  {
    status: { type: String, enum: ["none", "running", "done", "failed"], default: "none" },
    summary: { type: String, default: "" },
    product: { type: String, default: "" },
    language: { type: String, default: "" },
    language_label: { type: String, default: "" },
    frames_read: { type: Number, default: 0 },
    /**
     * Whether those frames were checked for private information. Separate from
     * frames_read because the blur pass can be paused while the rest of the
     * vision pass runs, and the editor promises one thing and not the other.
     */
    blur_checked: { type: Boolean, default: false },
    frames_failed: { type: Number, default: 0 },
    // How far the browser's clock turned out to be from the video's, and
    // whether the opening could be filled in. services/studio/sync.js.
    sync: { type: Schema.Types.Mixed, default: null },
    // What the shape locator made of the pointer: which design it recognised,
    // at what size, and in how many frames it found it. Without this a run that
    // silently fell back to the tracker looks identical to one that did not.
    // services/studio/locate.js.
    locate: { type: Schema.Types.Mixed, default: null },

    /**
     * The controls the model named, one entry per frame it read: t, and each
     * element's type, label and box.
     *
     * Kept because it is EVIDENCE, not a conclusion. Whether a press was on
     * something clickable is decided from this (events.js confirmClicks), and
     * that judgement has already been changed twice. Without the boxes on
     * record, changing it again means paying for the whole vision pass a second
     * time and hoping the model answers the same way — and it means nobody can
     * check why a particular click did or did not earn a zoom.
     */
    elements: { type: Schema.Types.Mixed, default: null },

    /**
     * Every moment the screen visibly changed, measured from the finished video
     * (services/studio/sync.js readScreen, distilled by audit.js changeMoments).
     *
     * ── WHY A LIST OF NOTHING-IN-PARTICULAR IS WORTH STORING ──────────────────
     * It is the only handle on what the click tracking MISSED. A press nobody
     * recovered leaves no event, no zoom and no trace — examining the presses
     * that were found can never reveal it. Subtracting the explained moments
     * from this list can, and what remains is both the audit's candidate set and,
     * read on its own, an honest measure of how much of a recording the pipeline
     * accounted for.
     *
     * A fact about the RECORDING, so it is measured once and never recomputed.
     * Whether a given moment is explained is a fact about the EDIT, which
     * changes whenever the creator does, and is worked out fresh each time.
     */
    changes: { type: Schema.Types.Mixed, default: null },

    /**
     * Every moment the pointer stopped, whether or not anything came of it.
     *
     * The change list above is "the screen did something nobody explained".
     * This is the other half: "the pointer sat still and nobody proposed a
     * press". A click on a toggle, a tab or a checkbox often produces neither
     * an event nor a change big enough to notice, so it is invisible to both
     * the pixel rules and the change list — and visible here, because a person
     * clicks with the pointer held still.
     *
     * A fact about the RECORDING, measured once. Which rests are explained is
     * a fact about the EDIT and is worked out on every audit.
     */
    rests: { type: Schema.Types.Mixed, default: null },

    /**
     * What the cross-check found, including what it decided was nothing.
     *
     * The nos matter as much as the yeses: a run that looked at twenty moments
     * and dismissed all twenty is a run whose thresholds are wrong, and that is
     * only visible if the dismissals are on the record too. The findings that
     * became offers are in `suggestions` as well; these are the full reading.
     */
    findings: { type: Schema.Types.Mixed, default: null },
    audited_at: { type: Date, default: null },
    /**
     * The demo's `rev` when the audit last ran.
     *
     * The audit reads the events and the zooms and asks the recording about the
     * moments they do not account for. Run again on an unchanged edit it asks
     * the same questions of the same frames and gets the same answers, for the
     * same money — and "Check again" is a button a creator can press all day.
     * Unchanged since this rev means the findings still stand.
     */
    audited_rev: { type: Number, default: -1 },

    // What the model cost us, against what the creator was charged. The two
    // are not the same number and the gap is the thing worth watching.
    usd: { type: Number, default: 0 },
    calls: { type: Number, default: 0 },
    charged: { type: Number, default: 0 },
    // And the same for the on-demand reading of the screens, which is a
    // separate purchase made later, from a different button. Kept apart so a
    // failed reading refunds the reading and not the analysis.
    read_charged: { type: Number, default: 0 },
    verdict: { type: String, default: "" },
    suggestions: { type: Schema.Types.Mixed, default: [] },
    // Applied or dismissed suggestion ids, so an editor reopened tomorrow does
    // not offer back the five things already decided on.
    resolved: { type: [String], default: [] },
    finished_at: { type: Date, default: null },
    error: { type: String, default: "" },
  },
  { _id: false }
);

const RenderSchema = new Schema(
  {
    id: { type: String, required: true },
    status: { type: String, enum: ["queued", "rendering", "done", "failed"], default: "queued" },
    stage: { type: String, default: "" },
    progress: { type: Number, default: 0 },
    error: { type: String, default: "" },

    options: { type: Schema.Types.Mixed, default: null },
    // What the render actually drew: counts of zooms, cursor samples, captions,
    // annotations and blurs. An export that came out plain says so instead of
    // looking like a finished edit.
    drew: { type: Schema.Types.Mixed, default: null },

    output_key: { type: String, default: "" },
    srt_key: { type: String, default: "" },
    size: { type: Number, default: 0 },
    duration: { type: Number, default: 0 },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    charged: { type: Number, default: 0 },

    worker: { type: String, default: "" },
    engine: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now },
    finished_at: { type: Date, default: null },
  },
  { _id: false }
);

const StudioDemoSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, default: "" },

  //   new        created, nothing uploaded
  //   uploading  the browser is sending the capture
  //   preparing  probing, remuxing, proxy and thumbnail
  //   analysing  the Gemini pipeline is running
  //   ready      there is a timeline to edit
  //   failed     with `error` saying why, in a sentence a creator can read
  status: { type: String, enum: ["new", "uploading", "preparing", "analysing", "ready", "failed"], default: "new" },
  stage: { type: String, default: "" },
  progress: { type: Number, default: 0 },
  error: { type: String, default: "" },

  recording: { type: RecordingSchema, default: () => ({}) },
  capture: { type: CaptureSchema, default: () => ({}) },
  analysis: { type: AnalysisSchema, default: () => ({}) },

  timeline: { type: Schema.Types.Mixed, default: null },
  /** Bumped on every save. The editor sends the rev it edited; a mismatch is a
   *  second tab having saved first, and the browser reloads rather than
   *  overwriting work it never saw. */
  rev: { type: Number, default: 0 },

  renders: { type: [RenderSchema], default: [] },

  expires_at: { type: Date, default: null, index: true },
  purged: { type: Boolean, default: false },

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

StudioDemoSchema.index({ user: 1, created_at: -1 });

StudioDemoSchema.pre("save", function bumpUpdated(next) {
  this.updated_at = new Date();
  next();
});

export default mongoose.models.StudioDemo || mongoose.model("StudioDemo", StudioDemoSchema, "studio_demos");
