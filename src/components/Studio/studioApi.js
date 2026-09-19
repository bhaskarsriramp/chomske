/**
 * studioApi.js: every request the demo studio makes, in one place, named for
 * what it does. See backend/routes/studio.js for what each one answers.
 *
 * ── RELATIVE MEDIA LINKS ─────────────────────────────────────────────────────
 * With local storage the server answers "/media/file/<token>" rather than a
 * full address, because behind nginx it cannot know the "/api" prefix the
 * browser reaches it through. The browser does know (API_URL), so every media
 * link is completed here, once, before any screen sees it. Cloud Storage links
 * are already absolute and pass through untouched.
 */
import api, { API_URL } from "../../api";

const ROOT = String(API_URL || "").replace(/\/$/, "");
const abs = (u) => (typeof u === "string" && u.startsWith("/media/") ? `${ROOT}${u}` : u);

function withLinks(d) {
  if (d?.demo) {
    const r = d.demo.recording;
    if (r) {
      r.proxy_url = abs(r.proxy_url);
      r.thumb_url = abs(r.thumb_url);
    }
    if (d.demo.renders) d.demo.renders = d.demo.renders.map((x) => ({ ...x, url: abs(x.url) }));
  }
  return d;
}

const data = (r) => withLinks(r.data);
const session = (r) => ({ ...r.data, upload: r.data.upload ? { ...r.data.upload, url: abs(r.data.upload.url) } : null });

export const getStudioConfig = () => api.get("/studio/config").then((r) => r.data);

export const listDemos = () =>
  api.get("/studio/demos").then((r) => (r.data.demos || []).map((d) => ({ ...d, thumb_url: abs(d.thumb_url) })));

export const createDemo = (title) => api.post("/studio/demos", { title }).then(data);
export const getDemo = (id) => api.get(`/studio/demos/${id}`).then(data);
export const renameDemo = (id, title) => api.patch(`/studio/demos/${id}`, { title }).then((r) => r.data);
export const deleteDemo = (id) => api.delete(`/studio/demos/${id}`).then((r) => r.data);

// `client_key` names this upload, so asking twice — a lost answer, sent again —
// hands back the one upload already started rather than beginning a second.
export const startUpload = (id, { filename, mime, size, clientKey }) =>
  api.post(`/studio/demos/${id}/upload`, { filename, mime, size, client_key: clientKey }).then(session);
export const resumeUpload = (id) => api.post(`/studio/demos/${id}/upload/resume`).then(session);
export const completeUpload = (id, capture) => api.post(`/studio/demos/${id}/upload/complete`, { capture }).then(data);

export const startAnalysis = (id, { expectedCost, captions }) =>
  api.post(`/studio/demos/${id}/analyse`, { expected_cost: expectedCost, captions }).then(data);
export const requestCaptions = (id) => api.post(`/studio/demos/${id}/captions`).then((r) => r.data);
// Captions from the voiceover script the analysis already wrote. Synchronous
// and free — it is a chunking pass over text the demo already holds, not a
// second reading of the recording — so it answers with the whole demo.
export const captionsFromScript = (id) => api.post(`/studio/demos/${id}/captions/from-script`).then(data);
export const requestReview = (id) => api.post(`/studio/demos/${id}/review`).then((r) => r.data);
export const resolveSuggestion = (id, sid, action) =>
  api.post(`/studio/demos/${id}/suggestions/${sid}`, { action }).then(data);

export const saveTimeline = (id, timeline, rev) =>
  api.put(`/studio/demos/${id}/timeline`, { timeline, rev }).then((r) => r.data);

export const startRender = (id, expectedCost, options) =>
  api.post(`/studio/demos/${id}/renders`, { expected_cost: expectedCost, options }).then(data);
export const renderDownloadUrl = (id, rid, file = "") =>
  api.get(`/studio/demos/${id}/renders/${rid}/download`, { params: file ? { file } : undefined }).then((r) => abs(r.data.url));
export const deleteRender = (id, rid) => api.delete(`/studio/demos/${id}/renders/${rid}`).then(data);

const studioApi = {
  getStudioConfig, listDemos, createDemo, getDemo, renameDemo, deleteDemo,
  startUpload, resumeUpload, completeUpload,
  startAnalysis, requestCaptions, captionsFromScript, requestReview, resolveSuggestion,
  saveTimeline, startRender, renderDownloadUrl, deleteRender,
}
export default studioApi;
