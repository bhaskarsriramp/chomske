/**
 * socket.js — the one live connection, and the only place that knows it exists.
 *
 * ── WHY THERE IS NO TOKEN IN HERE ────────────────────────────────────────────
 * The reference project reads its JWT out of localStorage and hands it to the
 * server in `auth: { token }`. This app cannot and should not: the session is an
 * httpOnly cookie, unreadable to page JS on purpose, so that an XSS bug cannot
 * walk off with it. `withCredentials` is what replaces that line — the browser
 * attaches the cookie to the handshake itself, and backend/socket/auth.js parses
 * it there.
 *
 * Transports are left at the default (polling, then upgrade). Forcing websocket
 * is the usual production advice and is wrong here for the same reason: some
 * browsers will not send cookies on a cross-origin websocket upgrade, and the
 * handshake is exactly where the cookie is needed.
 *
 * ── CONNECTED LAZILY, SHARED, NEVER TORN DOWN PER SCREEN ─────────────────────
 * One socket per tab. Screens subscribe and unsubscribe; the connection outlives
 * them, because reconnecting on every navigation would cost a handshake and a
 * database read to learn something that has not changed.
 */
import { io } from "socket.io-client";
import { API_URL } from "../api";

let socket = null;

/** The shared connection, opened on first use. */
export function getSocket() {
  if (!socket) {
    socket = io(API_URL, {
      withCredentials: true,   // the session cookie rides the handshake
      autoConnect: true,
      // Reconnect quietly and forever. A creator leaves this tab open all day;
      // a laptop lid closing must not permanently end the live feed.
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    // Logged, never surfaced. Every screen here works without a socket — the
    // live updates are an improvement on polling, not a dependency — so a
    // failed connection must never become an error in front of somebody.
    socket.on("connect_error", (err) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[socket] connect failed:", err.message);
      }
    });
  }
  return socket;
}

/**
 * Listen for one event for as long as the caller wants it.
 *
 * Returns the unsubscribe, so a React effect can `return onNewsEvent(...)`
 * and be certain the handler dies with the component rather than accumulating
 * one more copy on every re-render.
 */
export function onNewsEvent(event, handler) {
  const s = getSocket();
  s.on(event, handler);
  return () => s.off(event, handler);
}

export default getSocket;
