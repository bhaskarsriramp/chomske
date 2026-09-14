import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * EditProject: one video being edited.
 *
 * Two kinds, fixed when the project is made:
 *   script  a recording cut to one of the creator's scripts (`script` is set)
 *   free    any video, uploaded on its own from Edit videos, captioned from
 *           whatever was said
 *
 * ── WHAT LIVES HERE AND WHAT DOES NOT ────────────────────────────────────────
 * The footage does not. It lives in storage (services/media/storage.js) under
 * one prefix per project, and this row holds the keys. The timeline does, as a
 * plain document (services/edit/timeline.js owns its shape), because it is
 * small, it is read whole, and it changes on every trim.
 *
 * ── IT EXPIRES ───────────────────────────────────────────────────────────────
 * Footage is heavy and the finished video is the point, so a project's files
 * are deleted EDIT_RETENTION_DAYS after it was last touched. `expires_at` moves
 * forward on every upload, save and export. The row survives the purge with
 * `purged: true`, so My videos can say what happened instead of showing a
 * project that silently fails to open.
 */
const MediaSchema = new Schema(
  {
    id:        { type: String, required: true },
    // recording: the creator talking, which is matched to the script.
    // asset:     B-roll, images and music, placed by hand.
    kind:      { type: String, enum: ["recording", "asset"], required: true },
    type:      { type: String, enum: ["video", "image", "audio"], required: true },
    status:    { type: String, enum: ["uploading", "uploaded", "processing", "ready", "failed"], default: "uploading" },
    filename:  { type: String, default: "" },
    mime:      { type: String, default: "" },
    size:      { type: Number, default: 0 },
    order:     { type: Number, default: 0 },

    key:       { type: String, default: "" },
    proxy_key: { type: String, default: "" },
    audio_key: { type: String, default: "" },
    thumb_key: { type: String, default: "" },

    duration:  { type: Number, default: 0 },
    width:     { type: Number, default: 0 },
    height:    { type: Number, default: 0 },
    has_audio: { type: Boolean, default: false },

    error:      { type: String, default: "" },
    created_at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const RenderSchema = new Schema(
  {
    id:          { type: String, required: true },
    status:      { type: String, enum: ["queued", "rendering", "done", "failed"], default: "queued" },
    stage:       { type: String, default: "" },
    progress:    { type: Number, default: 0 },
    error:       { type: String, default: "" },
    aspect:      { type: String, default: "9:16" },
    output_key:  { type: String, default: "" },
    size:        { type: Number, default: 0 },
    duration:    { type: Number, default: 0 },
    charged:     { type: Number, default: 0 },
    created_at:  { type: Date, default: Date.now },
    finished_at: { type: Date, default: null },
  },
  { _id: false }
);

const EditProjectSchema = new Schema({
  user:    { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  profile: { type: Schema.Types.ObjectId, ref: "Profile", default: null },
  script:  { type: Schema.Types.ObjectId, ref: "Script", default: null, index: true },
  mode:    { type: String, enum: ["script", "free"], default: "script" },

  // Copied for the list screen, so it does not need the script to render a row.
  // For a free project it is the name the creator gave it, and renameable.
  headline:       { type: String, default: "" },
  language_label: { type: String, default: "" },

  // The matching, which is the one long step a project goes through.
  //   draft      uploading, nothing matched yet
  //   analysing  listening and matching, or writing captions (see stage/progress)
  //   ready      there is an edit
  //   failed     analysis failed; `error` says why and the charge was refunded
  status:   { type: String, enum: ["draft", "analysing", "ready", "failed"], default: "draft" },
  stage:    { type: String, default: "" },
  progress: { type: Number, default: 0 },
  error:    { type: String, default: "" },

  media: { type: [MediaSchema], default: [] },

  analysis: {
    charged:     { type: Number, default: 0 },
    seconds:     { type: Number, default: 0 },
    started_at:  { type: Date, default: null },
    finished_at: { type: Date, default: null },
    stats:       { type: Schema.Types.Mixed, default: null },
    // Free projects caption recordings as they arrive: `targets` are the ones
    // the running job is writing captions for, `transcribed` every one that has
    // been, so a recording is never charged for twice.
    targets:     { type: [String], default: [] },
    transcribed: { type: [String], default: [] },
    usage:       { type: Schema.Types.Mixed, default: null },
  },

  timeline:     { type: Schema.Types.Mixed, default: null },
  timeline_rev: { type: Number, default: 0 },
  // The edit's running time, written on every save, so the list screen and the
  // export price do not have to lay the timeline out to learn it.
  duration:     { type: Number, default: 0 },

  renders: { type: [RenderSchema], default: [] },

  // The caption translation in flight, or its result waiting for the editor to
  // take it into the edit. Kept OUT of the timeline on purpose: the creator
  // keeps editing while it runs, and a job that wrote the timeline would turn
  // every one of those edits into a save conflict. Shape:
  //   { id, status: running|done|failed|applied, lang, ids, charged, error,
  //     items: { [segment id]: text }, started_at, finished_at }
  translation: { type: Schema.Types.Mixed, default: null },

  expires_at: { type: Date, required: true, index: true },
  purged:     { type: Boolean, default: false },

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now, index: true },
});

EditProjectSchema.index({ user: 1, updated_at: -1 });

export default mongoose.models.EditProject || mongoose.model("EditProject", EditProjectSchema, "edit_projects");
