/**
 * socket/index.js: the live half of the feed.
 *
 * ── ROOMS ARE CATEGORIES, NOT USERS ──────────────────────────────────────────
 * The reference project rooms per creator (`u:<id>:c:<conv>`) because each
 * conversation belongs to one founder. Nothing here does. A category is
 * collected, ranked and briefed ONCE and serves every creator who picked it,
 * that sharing is why this product is affordable, so the natural room is the
 * category, and one emit reaches everybody waiting on that pass instead of one
 * emit per subscriber.
 *
 * Which rooms a socket may enter is decided from the account, in the handshake
 * (socket/auth.js), never from what the client asks for. A room is the only
 * thing standing between one creator's feed and a category they did not pick.
 *
 * ── WHY REDIS IS IN THE MIDDLE ───────────────────────────────────────────────
 * The pass a browser is waiting on is usually not running on the instance
 * holding that browser's socket: a sign-in kickoff is fire-and-forget, the
 * scheduler runs wherever the lock was won, and PM2 or Cloud Run will happily
 * put the two on different processes. So services publish to Redis and every
 * instance subscribes, see services/newsEvents.js.
 */
import { Server } from "socket.io";
import redis from "../redis.js";
import { socketAuth } from "./auth.js";
import { onNewsEvent, NEWS_CHANNEL } from "../services/newsEvents.js";

const room = (cat) => `cat:${cat}`;

/**
 * ── AND ONE ROOM THAT IS A PERSON ───────────────────────────────────────────
 * Everything above is shared work, so its room is the category. A voice
 * analysis is not: it reads one creator's videos and produces one creator's
 * profile, and the progress of it must not reach anybody else. So every socket
 * also sits in a room of its own account, joined from the handshake's verified
 * id and never from anything the client sends.
 */
const userRoom = (id) => `u:${id}`;

export function initSocketServer(httpServer, { allowedOrigins = [] } = {}) {
  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,   // the session cookie rides the handshake
    },
    // The handshake must carry the cookie, and a websocket-only client sends no
    // cookie on the upgrade in some browsers. Leaving polling in the list keeps
    // the httpOnly session working everywhere; the transport upgrades after.
    transports: ["polling", "websocket"],
  });

  io.use(socketAuth);

  io.on("connection", (socket) => {
    const { id, categories } = socket.user;

    // Joined at connect rather than on request. The client has nothing to tell
    // us that the account does not already say, and a `subscribe` message would
    // only add a way to get it wrong.
    for (const cat of categories) socket.join(room(cat));
    socket.join(userRoom(id));

    socket.on("disconnect", () => {
      // Socket.IO leaves every room on disconnect by itself. Nothing to undo.
    });

    if (process.env.NODE_ENV !== "production") {
      console.log(`[socket] ${id} joined ${categories.map(room).join(", ") || "no categories"}`);
    }
  });

  /**
   * Deliver one event to whoever is listening on this instance.
   *
   * `type` doubles as the client-side event name, so adding an event server-side
   * needs no change here, the browser either has a handler for it or ignores it.
   */
  const emit = (payload) => {
    if (!payload?.type) return;
    // `user` first: an event addressed to an account is private by definition,
    // and must never fall through to a category fan-out even if it somehow
    // carries both fields.
    if (payload.user) io.to(userRoom(payload.user)).emit(payload.type, payload);
    else if (payload.category) io.to(room(payload.category)).emit(payload.type, payload);
  };

  // The no-Redis path (local development): services hand events straight here.
  onNewsEvent(emit);

  if (redis) {
    // ── A DEDICATED CONNECTION, WITH THE QUEUE BACK ON ───────────────────────
    // Dedicated because a client in subscriber mode cannot run ordinary
    // commands, and the shared one is busy holding every cooldown in the app.
    //
    // `enableOfflineQueue: true` overrides the parent, deliberately. The shared
    // client has it OFF because it sits on the request path, where a command
    // against a dead Redis should reject in a millisecond so the caller falls
    // back in-process. A subscriber is on no request path: it issues exactly one
    // command, at boot, and queueing that until the socket is writable is what
    // it should do. duplicate() copies the parent's options, so without this
    // override the subscribe below was rejected with "Stream isn't writeable
    // and enableOfflineQueue options is false" before the handshake finished.
    const sub = redis.duplicate({ enableOfflineQueue: true });

    sub.on("error", (err) => console.warn("[socket] event subscriber:", err.message));

    // ── WHY THIS WAITS FOR `ready` ───────────────────────────────────────────
    // Subscribing inline lost a race with the connection on every boot, and the
    // failure was quiet in the worst way. publishNewsEvent returns as soon as
    // Redis ACCEPTS the publish, so with nobody subscribed the events went into
    // Redis and reached no browser at all: ranking finished and the feed did not
    // move, briefs landed and cards stayed empty, until the creator reloaded.
    // The local fallback in newsEvents.js could not help either, because it only
    // fires when the publish itself fails, and it had not.
    //
    // On `ready` rather than once at boot, so a reconnect after an outage
    // re-subscribes. A dropped subscription that never comes back is the same
    // silent failure arriving later.
    const listen = () => {
      sub.subscribe(NEWS_CHANNEL, (err) => {
        if (err) console.error("[socket] couldn't subscribe to news events:", err.message);
        else console.log(`[socket] subscribed to ${NEWS_CHANNEL}`);
      });
    };

    if (sub.status === "ready") listen();
    sub.on("ready", listen);

    sub.on("message", (_channel, message) => {
      try {
        emit(JSON.parse(message));
      } catch (err) {
        console.warn("[socket] unreadable event payload:", err.message);
      }
    });
  }

  console.log("[socket] live feed ready");
  return io;
}

export default { initSocketServer };
