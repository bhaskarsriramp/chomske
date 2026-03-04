import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import dbConnection from "./db.js";


// Load .env from the backend directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

import express from 'express';
import cors from 'cors';
import apiRouter from './routes/usersOn.js';


dbConnection(); // assume this sets up mongoose connection

const app = express();
const PORT = process.env.PORT || 8003;

app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});


// 1) Single source of truth for CORS check
function isAllowedOrigin(origin) {
  if (!origin) return true; // curl, native apps

  try {
    const url = new URL(origin);

    // allow http(s) only
    if (!["http:", "https:"].includes(url.protocol)) return false;

    // localhost dev
    if (origin === "http://localhost:3000") return true;

    // apex domain
    if (url.hostname === "chomske.com") return true;

    // all subdomains
    if (url.hostname.endsWith(".chomske.com")) return true;

    return false;
  } catch {
    return false;
  }
}

const corsOptions = {
  origin(origin, cb) {
    if (isAllowedOrigin(origin)) return cb(null, true);
    console.error("❌ CORS blocked Origin:", origin); // <— keep for PM2 logs
    return cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
};

// 2) Put cors BEFORE any routes
app.use(cors(corsOptions));


app.use(express.json({ limit: '2mb' }));

app.use('/usersOn', apiRouter);

// Error handling middleware
app.use((err, _req, res, _next) => {
  console.error('[Error]', err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`FounderDB backend running on ${PORT}`);
});
