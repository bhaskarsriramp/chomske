import { useEffect, useState } from "react";

/**
 * Whether the browser says it has a network, kept current.
 *
 * "Offline" is reliable; "online" only means a network is attached, not that it
 * reaches anything. So this decides what to SHOW, and every request still
 * handles failing on its own.
 */
export default function useOnline() {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}
