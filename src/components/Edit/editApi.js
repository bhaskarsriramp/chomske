/**
 * editApi.js: every request the editor makes, in one place, named for what it does.
 * See backend/routes/edit.js for what each one answers.
 */
import api from "../../api";

const data = (r) => r.data;

export const getEditConfig = () => api.get("/edit/config").then(data);
export const listProjects = () => api.get("/edit/projects").then((r) => r.data.projects || []);
export const openProjectForScript = (scriptId) => api.post("/edit/projects", { script_id: scriptId }).then(data);
export const getProject = (id) => api.get(`/edit/projects/${id}`).then(data);
export const deleteProject = (id) => api.delete(`/edit/projects/${id}`).then(data);

export const startUpload = (id, { filename, mime, size, kind }) =>
  api.post(`/edit/projects/${id}/media`, { filename, mime, size, kind }).then(data);
export const completeUpload = (id, mediaId) => api.post(`/edit/projects/${id}/media/${mediaId}/complete`).then(data);
export const removeMedia = (id, mediaId) => api.delete(`/edit/projects/${id}/media/${mediaId}`).then(data);
export const reorderRecordings = (id, ids) => api.patch(`/edit/projects/${id}/recordings`, { ids }).then(data);

export const startAnalysis = (id, expectedCost) => api.post(`/edit/projects/${id}/analyse`, { expected_cost: expectedCost }).then(data);
export const saveTimeline = (id, timeline, rev) => api.put(`/edit/projects/${id}/timeline`, { timeline, rev }).then(data);

export const startRender = (id, expectedCost) => api.post(`/edit/projects/${id}/renders`, { expected_cost: expectedCost }).then(data);
export const renderDownloadUrl = (id, renderId) => api.get(`/edit/projects/${id}/renders/${renderId}/download`).then((r) => r.data.url);
export const deleteRender = (id, renderId) => api.delete(`/edit/projects/${id}/renders/${renderId}`).then(data);
