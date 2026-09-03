/**
 * server.js — Hinglish API.
 *
 * Deliberately small: auth, transcribe, health. Everything expensive lives behind
 * a signed-in user and a daily cap, because reading a video is the only real cost
 * in this product and an open endpoint would be someone else's free GPU.
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";

import connectToMongo from "./db.js";
import authRoutes from "./routes/auth.js";
import transcribeRoutes from "./routes/transcribe.js";
import newsRoutes from "./routes/news.js";
import scriptRoutes from "./routes/script.js";
import statsRoutes from "./routes/stats.js";
import { startNewsScheduler } from "./services/newsScheduler.js";
import { warmApidirectKeys } from "./services/apidirectClient.js";

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
      return cb(new Error(`Origin ${origin} not allowed by CORS`));
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
// Reads only — the collection/ranking cost is on the scheduler's clock, not the
// caller's, so this needs no per-user cap beyond the global limiter.
app.use("/news", newsRoutes);
app.use(
  "/script",
  // Generation costs real money per call, so it gets its own ceiling on top of
  // the per-user daily cap inside the route.
  rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false }),
  scriptRoutes
);
app.use("/stats", statsRoutes);

// 404 + error handler. Errors are logged in full and answered generically —
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
    app.listen(PORT, () => {
      console.log(`[server] Hinglish API listening on :${PORT} (${process.env.NODE_ENV || "development"})`);
      console.log(`[server] CORS: ${allowedOrigins.join(", ")}`);
      startNewsScheduler();
      // Load the key pool once at boot. Without this, isApidirectConfigured()
      // stays false until something forces a load — and nothing would, because
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
