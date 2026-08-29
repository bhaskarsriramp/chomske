import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import dbConnection from "./db.js";
import bodyParser from "body-parser";
import cors from 'cors';
import usersOnBoard from "./routes/usersOn.js";


dbConnection();
const app = express();
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});


// 1) Single source of truth for CORS check
function isAllowedOrigin(origin) {
  if (!origin) return true; // curl/native apps
  try {
    const { protocol, hostname } = new URL(origin);

    // allow http(s) only
    if (protocol !== "http:" && protocol !== "https:") return false;

    // dev ports/origins
    if (origin === "http://localhost:4800") return true;

    // chomske.com apex or any subdomain
    if (hostname === "chomske.com" || hostname.endsWith(".chomske.com")) {
      return true;
    }

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

// 3) Preflight must use the SAME options
app.options("*", cors(corsOptions));




app.use("/usersOn", usersOnBoard);

// --- Serve static build and fall back to index.html for SPA routes
const BUILD_DIR = path.join(process.cwd(), 'build');
const INDEX_HTML = path.join(BUILD_DIR, 'index.html');

let TEMPLATE_HTML = null;
try {
  TEMPLATE_HTML = fs.readFileSync(INDEX_HTML, 'utf8');
} catch (err) {
  console.warn('Warning: build/index.html not found. Make sure you run `npm run build` before using server to serve static files.');
  TEMPLATE_HTML = null;
}

// Serve static assets (JS/CSS/images)
if (fs.existsSync(BUILD_DIR)) {
  app.use(express.static(BUILD_DIR, { index: false }));
}

// catch-all for client-side routes: serve the SPA shell
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next(); // not SPA
  }

  if (!TEMPLATE_HTML) return next();

  return res.type('html').send(TEMPLATE_HTML);
});



const server = http.createServer(app);

server.listen(8001, () => {
  console.log('Server is running on port 8001');
});
