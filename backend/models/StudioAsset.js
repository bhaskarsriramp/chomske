import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * StudioAsset: a file a creator brought to the studio that is not a recording.
 *
 * Two kinds: a background image for the canvas, and a music track the creator
 * uploaded for the music lane (services/studio/music.js). Each belongs to the
 * ACCOUNT, not to a demo: the same logo backdrop is used on every demo, so it
 * must outlive any one of them and never be swept away with a demo's files.
 * Its objects live beside the demos' folders in the same bucket, under
 * `<root>/studio/<user>/backgrounds/`, which no demo purge can name.
 *
 * A timeline refers to one by its id (canvas.background.value). The renderer
 * looks it up with the demo's owner as well as the id, so a timeline can never
 * reach somebody else's image by naming it.
 */
const StudioAssetSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  kind: { type: String, enum: ["background", "music"], default: "background" },

  // Storage keys. Never sent to the browser, which gets signed URLs instead.
  key: { type: String, required: true },
  thumb_key: { type: String, default: "" },

  // Of the stored (re-encoded) image, not of whatever was uploaded.
  width: { type: Number, default: 0 },
  height: { type: Number, default: 0 },
  size: { type: Number, default: 0 },

  // Music only: what the creator called the file, how long it plays, and its
  // waveform (0–100 per point) for the music lane.
  title: { type: String, default: "" },
  duration: { type: Number, default: 0 },
  peaks: { type: [Number], default: undefined },

  created_at: { type: Date, default: Date.now },
});

StudioAssetSchema.index({ user: 1, kind: 1, created_at: -1 });

export default mongoose.models.StudioAsset || mongoose.model("StudioAsset", StudioAssetSchema, "studio_assets");
