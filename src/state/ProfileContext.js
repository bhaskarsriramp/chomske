import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import api from "../api";

/**
 * The creator's channels, and which one they are working in.
 *
 * ── ONE SELECTION, EVERYWHERE ───────────────────────────────────────────────
 * Topics, My voice, My scripts and Dashboard are all about ONE profile at a
 * time, and they share this single value on purpose. Someone running a tech
 * channel and a sports channel is working on one of them right now — reading its
 * feed, writing in its voice, checking how it is doing. Per-screen selections
 * would let those four silently disagree, and "why is my dashboard showing the
 * other channel" becomes a question with no visible cause.
 *
 * The choice survives a reload (localStorage) because it is a working context,
 * not a filter someone re-applies every session. Reading it is wrapped: a
 * browser with storage disabled must not take the app down.
 */
const Ctx = createContext(null);

const KEY = "hg.profile";

const FALLBACK = {
  profiles: [], activeId: null, active: null, loading: false, max: 1,
  setActive: () => {}, refresh: async () => [],
};

export function useProfiles() {
  return useContext(Ctx) || FALLBACK;
}

function readStored() {
  try { return window.localStorage.getItem(KEY) || null; } catch { return null; }
}
function writeStored(id) {
  try {
    if (id) window.localStorage.setItem(KEY, id);
    else window.localStorage.removeItem(KEY);
  } catch { /* private mode, or storage blocked — the choice still works in-session */ }
}

export default function ProfileProvider({ children }) {
  const [profiles, setProfiles] = useState([]);
  const [activeId, setActiveId] = useState(readStored);
  const [loading, setLoading] = useState(true);
  const [max, setMax] = useState(1);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/profiles");
      const list = data.profiles || [];
      setProfiles(list);
      setMax(data.max || 1);

      // Keep the current selection if it still exists; otherwise fall back to
      // the server's default. A stored id can outlive the profile it names —
      // deleted in another tab, or on another device.
      setActiveId((prev) => {
        if (prev && list.some((p) => p.id === prev)) return prev;
        return data.active || list[0]?.id || null;
      });
      return list;
    } catch {
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const setActive = useCallback((id) => {
    setActiveId(id);
    writeStored(id);
    // Tell the server too, so the next device — and the next session before the
    // list loads — opens on the same channel.
    if (id) api.patch(`/profiles/${id}`, { is_default: true }).catch(() => {});
  }, []);

  const active = useMemo(
    () => profiles.find((p) => p.id === activeId) || profiles.find((p) => p.is_default) || profiles[0] || null,
    [profiles, activeId]
  );

  const value = { profiles, activeId: active?.id || null, active, loading, max, setActive, refresh };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
