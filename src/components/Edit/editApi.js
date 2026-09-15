/**
 * editApi.js: every request the editor makes, in one place, named for what it does.
 * See backend/routes/edit.js for what each one answers.
 *
 * ── RELATIVE MEDIA LINKS ─────────────────────────────────────────────────────
 * With local storage the server answers "/media/file/<token>" rather than a full
 * address, because behind nginx it cannot know the "/api" prefix the browser
 * reaches it through. The browser does know (API_URL), so every media link that
 * comes back is completed here, once, before any screen sees it. Cloud Storage
 * links are already absolute and pass through untouched.
 */
import api, { API_URL } from "../../api";

const ROOT = String(API_URL || "").replace(/\/$/, "");
const abs = (u) => (typeof u === "string" && u.startsWith("/media/") ? `${ROOT}${u}` : u);

function withLinks(d) {
  if (d?.project?.media) {
    d.project.media = d.project.media.map((m) => ({
      ...m,
      proxy_url: abs(m.proxy_url),
      thumb_url: abs(m.thumb_url),
      image_url: abs(m.image_url),
    }));
  }
  return d;
}

const data = (r) => withLinks(r.data);

export const getEditConfig = () => api.get("/edit/config").then((r) => r.data);
export const listProjects = () =>
  api.get("/edit/projects").then((r) => (r.data.projects || []).map((p) => ({ ...p, thumb_url: abs(p.thumb_url) })));
export const openProjectForScript = (scriptId) => api.post("/edit/projects", { script_id: scriptId }).then(data);
export const createProject = (name) => api.post("/edit/projects", { name }).then(data);
export const getProject = (id) => api.get(`/edit/projects/${id}`).then(data);
export const renameProject = (id, name) => api.patch(`/edit/projects/${id}`, { name }).then((r) => r.data);
export const deleteProject = (id) => api.delete(`/edit/projects/${id}`).then((r) => r.data);

const session = (r) => ({ ...r.data, upload: r.data.upload ? { ...r.data.upload, url: abs(r.data.upload.url) } : null });

// `clientKey` names this upload, so asking twice (a lost answer, sent again)
// hands back the one upload already started rather than a second.
export const startUpload = (id, { filename, mime, size, kind, clientKey }) =>
  api.post(`/edit/projects/${id}/media`, { filename, mime, size, kind, client_key: clientKey }).then(session);
export const resumeUpload = (id, mediaId) => api.post(`/edit/projects/${id}/media/${mediaId}/resume`).then(session);
export const completeUpload = (id, mediaId) => api.post(`/edit/projects/${id}/media/${mediaId}/complete`).then(data);
export const removeMedia = (id, mediaId) => api.delete(`/edit/projects/${id}/media/${mediaId}`).then(data);
export const reorderRecordings = (id, ids) => api.patch(`/edit/projects/${id}/recordings`, { ids }).then(data);

export const startAnalysis = (id, expectedCost) => api.post(`/edit/projects/${id}/analyse`, { expected_cost: expectedCost }).then(data);
export const openFreeEdit = (id) => api.post(`/edit/projects/${id}/open`).then(data);
export const saveTimeline = (id, timeline, rev) => api.put(`/edit/projects/${id}/timeline`, { timeline, rev }).then((r) => r.data);

export const translationQuote = (id, lang) => api.get(`/edit/projects/${id}/translate/quote`, { params: { lang } }).then((r) => r.data);
export const startTranslation = (id, lang, expectedCost) =>
  api.post(`/edit/projects/${id}/translate`, { lang, expected_cost: expectedCost }).then(data);
export const ackTranslation = (id, translationId) => api.post(`/edit/projects/${id}/translate/ack`, { id: translationId }).then((r) => r.data);

export const startRender = (id, expectedCost, options) =>
  api.post(`/edit/projects/${id}/renders`, { expected_cost: expectedCost, options }).then(data);
export const renderDownloadUrl = (id, renderId, file = "") =>
  api.get(`/edit/projects/${id}/renders/${renderId}/download`, { params: file ? { file } : undefined }).then((r) => abs(r.data.url));
export const deleteRender = (id, renderId) => api.delete(`/edit/projects/${id}/renders/${renderId}`).then(data);
