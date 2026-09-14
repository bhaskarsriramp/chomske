import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * EditJob: one piece of heavy work for the editor, waiting or running.
 *
 * ── WHY A COLLECTION AND NOT AN IN-MEMORY QUEUE ──────────────────────────────
 * A render takes minutes and a deploy takes seconds. A queue that lived in the
 * process would lose every render in flight on each restart and leave its
 * project saying "Rendering 40%" for ever, with the credits taken.
 *
 * A job is CLAIMED by setting a lease (services/edit/editRunner.js). The worker
 * holding it extends the lease while it works; if the process dies, the lease
 * runs out and any instance picks the job up again. Two instances can never run
 * the same job, because the claim is one atomic findOneAndUpdate.
 */
const EditJobSchema = new Schema({
  project: { type: Schema.Types.ObjectId, ref: "EditProject", required: true, index: true },
  user:    { type: Schema.Types.ObjectId, ref: "User", required: true },

  //   prepare  one uploaded file: probe, preview copy, speech track, thumbnail
  //   analyse  the whole project: listen, match, build the first edit
  //   render     one export
  //   translate  one caption translation
  type: { type: String, enum: ["prepare", "analyse", "render", "translate"], required: true },
  ref:  { type: String, default: "" },   // media id, render id or translation id

  status:      { type: String, enum: ["queued", "running", "done", "failed"], default: "queued" },
  attempts:    { type: Number, default: 0 },
  lease_until: { type: Date, default: null },
  worker:      { type: String, default: "" },
  error:       { type: String, default: "" },

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

EditJobSchema.index({ status: 1, type: 1, created_at: 1 });

export default mongoose.models.EditJob || mongoose.model("EditJob", EditJobSchema, "edit_jobs");
