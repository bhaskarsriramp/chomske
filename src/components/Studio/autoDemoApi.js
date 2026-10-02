/**
 * autoDemoApi.js: the auto product demo's requests, and a hook that follows one.
 * See backend/routes/autodemo.js and backend/services/studio/autodemo/.
 *
 * Kept out of studioApi.js on purpose: the auto demo is its own feature, and
 * everything it needs from the browser lives in this file and AutoDemo.js.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import api from "../../api";
import { onLiveEvent } from "../../realtime/socket";

/** Ask for a demo built from this description, in this voice. Answers { autodemo }. */
export const requestAutoDemo = (id, { brief, voice }) =>
  api.post(`/studio/autodemo/${id}`, { brief, voice }).then((r) => r.data);
/** Where the demo's auto demo is: { autodemo } (null when there never was one). */
export const getAutoDemo = (id) => api.get(`/studio/autodemo/${id}`).then((r) => r.data);
/** Put back the captions, script and voice the last auto demo replaced. */
export const undoAutoDemo = (id) => api.post(`/studio/autodemo/${id}/undo`).then((r) => r.data);

export const isActive = (ad) => !!ad && (ad.status === "waiting" || ad.status === "running");

/** How often the status is read while one is being made. */
const POLL_MS = 2500;

/**
 * The auto demo of one recording, kept current.
 *
 * Read once, then every POLL_MS while it is waiting or running, and again on
 * any live "autodemo" event. `ad` is undefined until the first answer (the
 * editor holds its screen until it knows whether a demo is being built), then
 * the auto demo or null. `onSettled(ad)` is called once when a run ends
 * (done or failed) or is undone, so the editor can read the demo again.
 */
export function useAutoDemo(demoId, { onSettled } = {}) {
  const [ad, setAd] = useState(undefined);
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;

  const refresh = useCallback(async () => {
    if (!demoId) return null;
    const res = await getAutoDemo(demoId).catch(() => null);
    // A failed first read is "none", so nothing waits on it; a failed poll
    // later keeps what was known.
    setAd((cur) => (res ? res.autodemo || null : cur === undefined ? null : cur));
    return res?.autodemo || null;
  }, [demoId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const active = isActive(ad);
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [active, refresh]);

  useEffect(
    () =>
      onLiveEvent("studio:update", (e) => {
        if (e?.autodemo) refresh();
      }),
    [refresh]
  );

  // A run that was going and now is not: tell the editor once.
  const was = useRef(null);
  useEffect(() => {
    const before = was.current;
    was.current = ad?.status || null;
    if ((before === "waiting" || before === "running") && ad && !isActive(ad)) settledRef.current?.(ad);
  }, [ad]);

  const start = useCallback(
    async (brief, voice) => {
      const res = await requestAutoDemo(demoId, { brief, voice });
      setAd(res.autodemo || null);
      return res.autodemo;
    },
    [demoId]
  );

  const undo = useCallback(async () => {
    await undoAutoDemo(demoId);
    const next = await refresh();
    settledRef.current?.(next || { status: "undone" });
  }, [demoId, refresh]);

  return { ad, active, refresh, start, undo };
}

export default { requestAutoDemo, getAutoDemo, undoAutoDemo, useAutoDemo, isActive };
