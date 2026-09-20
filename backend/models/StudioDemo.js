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
    // What the model cost us, against what the creator was charged. The two
    // are not the same number and the gap is the thing worth watching.
    usd: { type: Number, default: 0 },
    calls: { type: Number, default: 0 },
    charged: { type: Number, default: 0 },
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
