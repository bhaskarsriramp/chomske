import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import api from "../api";

/**
 * The creator's voice sets, and which one is selected.
 *
 * ── ONE SELECTION, EVERYWHERE ───────────────────────────────────────────────
 * Topics, My scripts and Dashboard each show a voice picker, and they share this
 * one value on purpose. A creator running a Hindi channel and an English one is
 * working on ONE of them at a time — writing for it, reading what they wrote for
 * it, checking how it is doing. Per-screen selections would let those three
 * silently disagree, so "why is my dashboard showing the other channel" becomes
 * a question with no visible cause.
 *
 * The choice survives a reload (localStorage) because it is a working context,
 * not a filter someone re-applies every session. Reading it is wrapped: a
 * browser with storage disabled must not take the app down.
 */
const Ctx = createContext(null);

const KEY = "hg.voice";

const FALLBACK = {
  voices: [], activeId: null, active: null, loading: false, max: 1,
  setActive: () => {}, refresh: async () => {}, needsName: null,
};

export function useVoices() {
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

export default function VoiceProvider({ children }) {
  const [voices, setVoices] = useState([]);
  const [activeId, setActiveId] = useState(readStored);
  const [loading, setLoading] = useState(true);
  const [max, setMax] = useState(1);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/voices");
      const list = data.voices || [];
      setVoices(list);
      setMax(data.max || 1);

      // Keep the current selection if it still exists; otherwise fall back to
      // the server's default. A stored id can outlive the voice it names —
      // deleted in another tab, or on another device.
      setActiveId((prev) => {
        if (prev && list.some((v) => v.id === prev)) return prev;
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
    // list loads — opens on the same voice.
    if (id) api.patch(`/voices/${id}`, { is_default: true }).catch(() => {});
  }, []);

  const active = useMemo(
    () => voices.find((v) => v.id === activeId) || voices.find((v) => v.is_default) || voices[0] || null,
    [voices, activeId]
  );

  // The first analysed-but-unnamed set. The app blocks on this: a voice with no
  // name is unusable in the dropdown where credits get spent.
  const needsName = useMemo(() => voices.find((v) => v.needs_name) || null, [voices]);

  const value = { voices, activeId: active?.id || null, active, loading, max, setActive, refresh, needsName };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
