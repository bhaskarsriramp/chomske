import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import dbConnection from "./db.js";
import bodyParser from "body-parser";
import cors from 'cors';
import usersOnBoard from "./routes/usersOn.js";
import mongoose from 'mongoose';
import  socketServer  from "../src/realtime/socketServer.js";
import agenda from './utils/agenda.js';
import { defineProcessActionLockJob } from './jobs/processActionLockJob.js';
import { defineSendWhatsAppAlertJob } from './jobs/sendWhatsAppAlertJob.js';
const { initSocketServer } = socketServer;

defineProcessActionLockJob(agenda);
defineSendWhatsAppAlertJob(agenda);


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
  if (!origin) return true; // curl, native apps

  try {
    const url = new URL(origin);

    // allow http(s) only
    if (!["http:", "https:"].includes(url.protocol)) return false;

    // localhost dev
    if (origin === "http://localhost:4800") return true;

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

// 3) Preflight must use the SAME options
app.options("*", cors(corsOptions));


app.use("/usersOn", usersOnBoard);

// --- Simple helper: extract subdomain from Host header
function extractSubdomain(hostname = '') {
  if (!hostname) return null;
  const host = hostname.split(':')[0].toLowerCase();
  const parts = host.split('.');
  if (parts.length <= 2) return null;        // chomske.com -> no subdomain
  if (parts[0] === 'www') return null;       // ignore www
  return parts.slice(0, parts.length - 2).join('.'); // a.b.chomske.com -> 'a.b'
}




// --- Serve static build and meta-inject index.html for SPA routes
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

// Helper to build meta tags and inject initial profile
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildMetaTags(meta) {
  const tags = [];
  if (meta.title) tags.push(`<title>${escapeHtml(meta.title)}</title>`);
  if (meta.description) tags.push(`<meta name="description" content="${escapeHtml(meta.description)}">`);
  if (meta.url) tags.push(`<link rel="canonical" href="${escapeHtml(meta.url)}">`);

  // Open Graph
  if (meta.title) tags.push(`<meta property="og:title" content="${escapeHtml(meta.title)}">`);
  if (meta.description) tags.push(`<meta property="og:description" content="${escapeHtml(meta.description)}">`);
  if (meta.image) tags.push(`<meta property="og:image" content="${escapeHtml(meta.image)}">`);
  if (meta.url) tags.push(`<meta property="og:url" content="${escapeHtml(meta.url)}">`);

  // Twitter
  if (meta.title) tags.push(`<meta name="twitter:title" content="${escapeHtml(meta.title)}">`);
  if (meta.description) tags.push(`<meta name="twitter:description" content="${escapeHtml(meta.description)}">`);
  if (meta.image) tags.push(`<meta name="twitter:image" content="${escapeHtml(meta.image)}">`);

  return tags.join('\n');
}

// catch-all for client-side routes: inject meta & initial profile for subdomain requests
app.get('*', async (req, res, next) => {
  try {

    if (req.path === '/socket.io' || req.path.startsWith('/socket.io/')) {
  return next(); // let Engine.IO handle it
 }
  if (req.path.startsWith('/api/')) {
    return next(); // not SPA
  }


    // If the request matches an existing static file, let express.static have handled it.
    // If template not loaded, fallback to next middleware (or 404).
    if (!TEMPLATE_HTML) return next();

    const host = req.headers.host || '';
    const subdomain = extractSubdomain(host);
    // const subdomain = 'sid4real';


    // If no subdomain, just serve normal index.html (no injection)
    if (!subdomain) {
      return res.type('html').send(TEMPLATE_HTML);
    }

    // Try to fetch profile from DB
    const profilesColl = mongoose.connection.collection('users');
    const profile = await profilesColl.findOne({ handleUserName: subdomain.toLowerCase() });

    // If no profile, serve default index and let client show 404/notfound UI
    if (!profile) {
      return res.type('html').send(TEMPLATE_HTML);
    }

    // Build meta and initial profile script
    const meta = {
      title: profile.displayName ? `${profile.displayName} — MyHandle` : `${subdomain} — MyHandle`,
      description: profile.bio || profile.shortBio || `View ${profile.displayName || subdomain} on MyHandle`,
      image: profile.ogImage || profile.avatarUrl || `https://chomske.com/static/default-og.png`,
      url: `https://${host}${req.originalUrl}`
    };

    const metaTags = buildMetaTags(meta);

    // Safe JSON for injection (escape < to avoid XSS ending script blocks)
    const safeJson = JSON.stringify(profile).replace(/</g, '\\u003c');

    const initialProfileScript = `<script>window.__INITIAL_PROFILE__ = ${safeJson};</script>`;

    // inject before </head>
    const html = TEMPLATE_HTML.replace(/<\/head>/i, `${metaTags}\n${initialProfileScript}\n</head>`);
    // Cache if you want (not included here)

    return res.type('html').send(html);
  } catch (err) {
    console.error('Error in meta-injection handler:', err);
    // fallback to default index
    if (TEMPLATE_HTML) return res.type('html').send(TEMPLATE_HTML);
    return next(err);
  }
});



const server = http.createServer(app);
initSocketServer(server);

// const io = attachSocket(server, app);
// app.set('io', io);


server.listen(8001, () => {
  console.log('Server is running on port 8001');
});

agenda.on("ready", () => {
  agenda.start();
  console.log("✅ Agenda started");
});





