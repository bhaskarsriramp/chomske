/**
 * launchApi.js: the requests for demos generated from a website address.
 * See backend/routes/launch.js for what each one answers.
 *
 * Media links come back relative ("/media/file/…") when the server stores
 * files locally; they are completed here, once, like studioApi.js does.
 */
import api, { API_URL } from "../../api";

const ROOT = String(API_URL || "").replace(/\/$/, "");
const abs = (u) => (typeof u === "string" && u.startsWith("/media/") ? `${ROOT}${u}` : u);

const card = (v) => ({ ...v, thumb_url: abs(v.thumb_url) });
const video = (v) => (v ? { ...card(v), versions: (v.versions || []).map((x) => ({ ...x, url: abs(x.url) })) } : v);
const one = (r) => ({ ...r.data, video: video(r.data.video) });

export const listLaunch = () => api.get("/studio/launch").then((r) => ({ ...r.data, videos: (r.data.videos || []).map(card) }));
export const createLaunch = (url, notes) => api.post("/studio/launch", { url, notes }).then(one);
export const getLaunch = (id) => api.get(`/studio/launch/${id}`).then(one);
export const refineLaunch = (id, message) => api.post(`/studio/launch/${id}/refine`, { message }).then(one);
export const retryLaunch = (id) => api.post(`/studio/launch/${id}/retry`).then(one);
export const deleteLaunch = (id) => api.delete(`/studio/launch/${id}`).then((r) => r.data);
export const launchDownload = (id, v) => api.get(`/studio/launch/${id}/download`, { params: { v } }).then((r) => abs(r.data.url));

/** Generated videos are addressed /app/studio/gen-<slug>, beside recordings at /app/studio/<slug>. */
export const GEN = "gen-";
export const isGenKey = (key) => typeof key === "string" && key.startsWith(GEN);
