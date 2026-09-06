import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import api from "../api";

/**
 * The account's channel.
 *
 * ── ONE CHANNEL PER ACCOUNT ─────────────────────────────────────────────────
 * This used to hold a list of channels plus which one you were working in, kept
 * in localStorage and switched from a menu in the app bar. It was built before
 * there was anyone running two, and it charged every screen for a case that did
 * not exist: a selection to read, a selection to keep in sync, and a way to add
 * a video to the wrong channel and pay a transcription to undo it.
 *
 * So there is no selection. The server creates one profile on first read and
 * never hands back an empty list for a signed-in account (ensureProfile), which
 * makes profiles[0] the channel rather than a guess.
 *
 * ── THE SHAPE IS STILL A LIST, ON PURPOSE ───────────────────────────────────
 * Nothing was deleted to collapse this. profile_id still threads through every
 * model, route and query, consumers still read `profiles` and `activeId`, and
 * the two UI pieces are still on disk and merely unmounted (Shell/TopBar.js,
 * Profile/NewProfileDialog.js). Bringing channels back is MAX_PROFILES plus
 * those two components, not a rebuild. See backend/services/profileService.js.
 */
const Ctx = createContext(null);

const FALLBACK = {
  profiles: [], activeId: null, active: null, loading: false,
  refresh: async () => [],
};

export function useProfiles() {
  return useContext(Ctx) || FALLBACK;
}

export default function ProfileProvider({ children }) {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/profiles");
      const list = data.profiles || [];
      setProfiles(list);
      return list;
    } catch {
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const active = useMemo(() => profiles[0] || null, [profiles]);

  const value = useMemo(
    () => ({ profiles, active, activeId: active?.id || null, loading, refresh }),
    [profiles, active, loading, refresh]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
