/**
 * server.js: Lipi API.
 *
 * Deliberately small: auth, transcribe, health. Everything expensive lives behind
 * a signed-in user and a daily cap, because reading a video is the only real cost
 * in this product and an open endpoint would be someone else's free GPU.
 */
import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";

import connectToMongo from "./db.js";
import authRoutes from "./routes/auth.js";
import transcribeRoutes from "./routes/transcribe.js";
import newsRoutes from "./routes/news.js";
import scriptRoutes from "./routes/script.js";
import sourceRoutes from "./routes/source.js";
import statsRoutes from "./routes/stats.js";
import billingRoutes from "./routes/billing.js";
import profileRoutes from "./routes/profiles.js";
import adminRoutes from "./routes/admin.js";
import showcaseRoutes from "./routes/showcase.js";
import VoiceProfile from "./models/VoiceProfile.js";
import User from "./models/User.js";
import { startNewsScheduler } from "./services/newsScheduler.js";
import { warmApidirectKeys } from "./services/apidirectClient.js";
import { initSocketServer } from "./socket/index.js";

const app = express();
const PORT = parseInt(process.env.PORT || "8001", 10);

// Behind Cloud Run / nginx / Cloudflare the client IP arrives in X-Forwarded-For.
// Without this, express-rate-limit sees the proxy's IP and rate-limits everyone
// as if they were one person.
app.set("trust proxy", 1);

const allowedOrigins = String(process.env.CORS_ORIGINS || "http://localhost:4800")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      // No Origin header = same-origin, curl, or a health checker. Allow those;
      // the cookie is what actually guards the endpoints.
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);

      // Refused by omitting the CORS headers, NOT by throwing. Passing an Error
      // here makes the cors middleware hand it to Express, which turns a browser
      // on the wrong origin into a 500 plus a ten-line stack trace in the logs.
      // The browser blocks the response either way, so the Error bought nothing
      // and cost the ability to read the log: these traces were interleaved with
      // a real failure and made it look like part of it.
      console.warn(`[cors] refused origin ${origin}`);
      return cb(null, false);
    },
    credentials: true, // required for the session cookie to cross origins
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// Blunt global ceiling. The real spend control is the per-user daily cap in
// routes/transcribe.js; this just keeps a loop from hammering the process.
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get("/health", (req, res) => res.json({ ok: true, ts: Date.now() }));

app.use("/auth", authRoutes);
app.use(
  "/transcribe",
  // Tighter limit on the expensive path, on top of the per-user daily cap.
  rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false }),
  transcribeRoutes
);
// Reads only, the collection/ranking cost is on the scheduler's clock, not the
// caller's, so this needs no per-user cap beyond the global limiter.
app.use("/news", newsRoutes);
app.use(
  "/script",
  // Generation costs real money per call, so it gets its own ceiling on top of
  // the per-user daily cap inside the route.
  rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false }),
  scriptRoutes
);
// Preparing material a creator brought themselves. Free to them, but not free
// to us: a preview can spend an apidirect metadata lookup, a fan-out of page
// fetches and, for a lookup, a small model call. Its own ceiling for the same
// reason /transcribe has one, and the per-user daily cap lives in the route.
app.use(
  "/source",
  rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false }),
  sourceRoutes
);
app.use(
  "/billing",
  // Payment endpoints are the ones worth brute-forcing: order creation costs us
  // a Razorpay call each, and verify is where a forged signature would be
  // hammered. Tighter than the global ceiling, and well above what a real
  // person clicking Buy could reach.
  rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false }),
  billingRoutes
);
// Managing channels: cheap reads and small writes, no model calls except
// /profiles/:id/analyse, itself bounded by how many videos a profile holds.
app.use("/profiles", profileRoutes);
app.use("/stats", statsRoutes);

// ── Outreach showcases ──────────────────────────────────────────────────────
// The admin workbench, and the private share links it produces.
//
// /v/ carries a tighter ceiling than anything else here because it is the only
// surface reachable with NO account at all: the slug is the whole credential,
// so the open endpoint is the one place a stranger could sit and guess. Eight
// random base62 characters against 10 attempts a minute is not a threat, but
// the limiter is what makes that sentence true rather than hopeful.
app.use("/admin", adminRoutes);
app.use(
  "/v",
  rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false }),
  showcaseRoutes
);

// 404 + error handler. Errors are logged in full and answered generically,
// stack traces and provider messages must never reach the browser.
app.use((req, res) => res.status(404).json({ success: false, message: "Not found" }));
app.use((err, req, res, _next) => {
  console.error("[server] unhandled:", err);
  const status = /not allowed by CORS/.test(err?.message || "") ? 403 : 500;
  res.status(status).json({ success: false, message: status === 403 ? "Origin not allowed" : "Server error" });
});

// Fail fast and loudly on missing config rather than 500ing at the first request.
function assertConfig() {
  const required = ["JWT_SECRET", "GOOGLE_CLIENT_ID", "AISTUDIO_KEY"];
  const missing = required.filter((k) => !String(process.env[k] || "").trim());
  if (missing.length) {
    throw new Error(`Missing required env: ${missing.join(", ")}. Copy .env.example to .env and fill it in.`);
  }
}

(async () => {
  try {
    assertConfig();
    await connectToMongo();

    // ── Drop the old one-voice-per-user unique index ────────────────────────
    // voice_profiles used to carry `unique: true` on `user`. Removing it from
    // the schema does NOT remove it from a database that already has it,
    // Mongoose creates missing indexes but never drops stale ones, so without
    // this, a second profile's voice fails with E11000 in production while
    // working perfectly against a fresh local database. syncIndexes() makes the
    // collection match the schema exactly, and adds the unique index on
    // `profile` that now enforces one voice per channel.
    //
    // Cheap: voice_profiles holds a handful of rows per user. Failures are
    // logged rather than fatal, a server that will not boot because an index
    // could not be rebuilt is a worse outage than one profile failing.
    //
    // NOTE: this cannot create the unique { profile: 1 } index while rows still
    // have profile: null (they all collide on null). Run
    // scripts/migrateProfiles.js --apply, which backfills first.
    await VoiceProfile.syncIndexes().catch((err) =>
      console.error("[server] voice_profiles index sync failed:", err.message)
    );

    // ── Make google_sub's unique index SPARSE ───────────────────────────────
    // Same class of problem, opposite direction. `users.google_sub` carried a
    // plain unique index, which is right for accounts that came from a sign-in
    // and impossible for a showcase, which has no Google account behind it. A
    // plain unique index treats every missing value as the same value, so the
    // FIRST showcase inserts and the second fails with E11000 against a
    // database that has the old index, while working locally against a fresh
    // one. Exactly the trap the note above describes.
    //
    // syncIndexes() rebuilds it sparse, and adds the unique sparse index on
    // showcase.slug that guarantees two links can never collide.
    await User.syncIndexes().catch((err) =>
      console.error("[server] users index sync failed:", err.message)
    );

    // http.createServer rather than app.listen, because Socket.IO attaches to
    // the SERVER and not to the Express app, app.listen makes one internally
    // and gives no way to reach it. Everything else is unchanged: Express still
    // handles every ordinary request, the socket server only claims /socket.io.
    const server = http.createServer(app);
    initSocketServer(server, { allowedOrigins });

    server.listen(PORT, () => {
      console.log(`[server] Lipi API listening on :${PORT} (${process.env.NODE_ENV || "development"})`);
      console.log(`[server] CORS: ${allowedOrigins.join(", ")}`);
      startNewsScheduler();
      // Load the key pool once at boot. Without this, isApidirectConfigured()
      // stays false until something forces a load, and nothing would, because
      // the duration gate is itself behind that check, so it would silently
      // never run after a restart.
      warmApidirectKeys().catch((err) =>
        console.error("[apidirect] key warmup failed:", err.message)
      );
    });
  } catch (err) {
    console.error("[server] failed to start:", err.message);
    process.exit(1);
  }
})();
