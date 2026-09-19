import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * StudioJob: one piece of heavy work for the demo studio, waiting or running.
 *
 * Same design as the script editor's queue (models/EditJob.js), and separate
 * from it on purpose: analysing a demo and exporting one have their own
 * concurrency limits, and a queue shared with eight-minute script renders would
 * let one product's backlog stall the other's.
 *
 * ── WHY A COLLECTION AND NOT AN IN-MEMORY QUEUE ──────────────────────────────
 * An analysis takes minutes and a deploy takes seconds. A queue that lived in
 * the process would lose everything in flight on each restart and leave demos
 * saying "Analysing 40%" for ever with the credits taken.
 *
 * A job is CLAIMED by setting a lease. The worker holding it extends the lease
 * while it works; if the process dies the lease runs out and any instance picks
 * it up again. Two instances can never run the same job, because the claim is
 * one atomic findOneAndUpdate.
 */
const StudioJobSchema = new Schema({
  demo: { type: Schema.Types.ObjectId, ref: "StudioDemo", required: true, index: true },
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },

  //   prepare   the uploaded capture: probe, remux, proxy, speech track, thumbnail
  //   analyse   the Gemini pipeline: UI, steps, zooms, blur, annotations
  //   captions  transcribe the audio, on its own. Captions are opt-in, and a
  //             creator who decides later must not pay for the whole pipeline
  //             again to get them
  //   render    one export
  //   review    the quality pass over a finished edit, on its own so a creator
  //             can ask for fresh suggestions without re-analysing anything
  type: { type: String, enum: ["prepare", "analyse", "captions", "render", "review"], required: true },
  ref: { type: String, default: "" },   // render id, where the job is about one

  status: { type: String, enum: ["queued", "running", "done", "failed"], default: "queued" },
  attempts: { type: Number, default: 0 },
  lease_until: { type: Date, default: null },
  worker: { type: String, default: "" },
  error: { type: String, default: "" },

  // After a network fault (storage or the model unreachable): not to be claimed
  // before `not_before`, and how many such faults it has waited out. These do
  // not count as attempts, so a dropped connection holds an export up rather
  // than failing it.
  not_before: { type: Date, default: null },
  retries: { type: Number, default: 0 },

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

StudioJobSchema.index({ status: 1, type: 1, created_at: 1 });

export default mongoose.models.StudioJob || mongoose.model("StudioJob", StudioJobSchema, "studio_jobs");
