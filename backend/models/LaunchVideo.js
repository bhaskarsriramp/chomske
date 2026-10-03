import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * LaunchVideo: a product demo generated from a website address, with no
 * recording (the launch/ pipeline, run by services/launch/launchRunner.js).
 *
 * ── THE DOCUMENT IS ALSO ITS QUEUE ───────────────────────────────────────────
 * A video has at most one piece of work at a time (the first cut, or the next
 * refinement), so the job lives on the video rather than in studio_jobs, whose
 * rows all belong to a recording. It is claimed the same way: an atomic
 * findOneAndUpdate that sets a lease, extended while the work runs, so a
 * worker that dies leaves the job to be picked up when the lease lapses.
 *
 *   status    queued | running | done | failed
 *   pending   what the queued/running work is: { kind: create|refine, text, at }
 *   versions  every finished cut, newest last; `key` is the MP4 in storage
 *   chat      the conversation shown beside the video: the creator's requests
 *             and the replies. A request whose work failed is marked failed and
 *             does not count against the day's allowance.
 *   work_key  where the job folder (screenshots, drafts, voice takes, music)
 *             is kept in storage, so any worker can run the next refinement
 */
const VersionSchema = new Schema(
  {
    v: { type: Number, required: true },
    key: { type: String, required: true },
    seconds: { type: Number, default: 0 },
    scenes: { type: Number, default: 0 },
    voiced: { type: Boolean, default: true },
    request: { type: String, default: "" },
    // The same cut with the Clipo watermark burned in (services/launch/
    // watermark.js): what plays while the demo is a free one not yet paid for.
    preview_key: { type: String, default: "" },
    created_at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ChatSchema = new Schema(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    text: { type: String, default: "" },
    kind: { type: String, default: "" }, // "create" | "refine" for a user request
    v: { type: Number, default: 0 },     // the version a reply delivered
    failed: { type: Boolean, default: false },
    // Credits a change took (routes/launch.js): given back, and zeroed, if it fails.
    charged: { type: Number, default: 0 },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const LaunchVideoSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  slug: { type: String, required: true, unique: true },
  url: { type: String, required: true },
  domain: { type: String, default: "" },
  title: { type: String, default: "" },
  notes: { type: String, default: "" },

  status: { type: String, enum: ["queued", "running", "done", "failed"], default: "queued", index: true },
  pending: {
    kind: { type: String, default: "" },
    text: { type: String, default: "" },
    at: { type: Date, default: null },
  },
  stage: { type: String, default: "" },
  progress: { type: Number, default: 0 },
  error: { type: String, default: "" },

  attempts: { type: Number, default: 0 },
  lease_until: { type: Date, default: null },
  worker: { type: String, default: "" },

  versions: { type: [VersionSchema], default: [] },
  chat: { type: [ChatSchema], default: [] },
  thumb_key: { type: String, default: "" },
  work_key: { type: String, default: "" },
  work_files: { type: [String], default: [] },

  /**
   * Whether this demo is paid for (routes/launch.js): { paid, trial, credits,
   * paid_at }. Generating costs DEMO_CREDITS, taken when it is asked for. A
   * first-time creator's one free demo is `trial`: it plays with the watermark
   * and its clean file is paid for when it is downloaded. Absent on demos made
   * during the free beta, which count as paid.
   */
  billing: { type: Schema.Types.Mixed, default: undefined },

  created_at: { type: Date, default: Date.now, index: true },
  updated_at: { type: Date, default: Date.now },
});

LaunchVideoSchema.index({ status: 1, lease_until: 1, updated_at: 1 });

export default mongoose.models.LaunchVideo || mongoose.model("LaunchVideo", LaunchVideoSchema, "launch_videos");
