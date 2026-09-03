# Hinglish

Paste a YouTube link, get the transcript **in the language it was spoken in**.
Hindi comes back in Devanagari, Telugu in Telugu script, and Hinglish keeps its
code-mixing exactly as said — no translation, no romanisation.

Production domain: **chomske.com**

---

## What's here

```
Hinglish/
├── backend/            Node + Express + Mongoose API
│   ├── server.js       boot, CORS, rate limits, config assertions
│   ├── db.js           Mongo connection + the database-separation guard
│   ├── models/         User, Transcript
│   ├── middleware/     session cookie auth
│   ├── routes/         auth (Google), transcribe
│   ├── services/       geminiClient — the actual video read
│   └── utils/          YouTube URL parsing
└── src/                React frontend (CRA)
    ├── components/Landing/     marketing page
    └── components/Dashboard/   the app
```

---

## Setup

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env      # then fill it in — see below
npm start                 # http://localhost:5000
```

You must fill three things in `backend/.env`:

| Key | Where to get it |
|---|---|
| `MONGODB_PASSWORD` | Same Atlas password as betaFounderProduction |
| `AISTUDIO_KEY` | [aistudio.google.com](https://aistudio.google.com/apikey) → Get API key. Comma-separate several to spread rate limits. |
| `GOOGLE_CLIENT_ID` | Google Cloud Console → Credentials → OAuth 2.0 Client ID (Web application) |

`JWT_SECRET` is already generated in the committed-locally `.env`; regenerate any time with:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 2. Frontend

```bash
npm install
cp .env.example .env      # set REACT_APP_GOOGLE_CLIENT_ID + REACT_APP_API_URL
npm start                 # http://localhost:3000
```

`REACT_APP_GOOGLE_CLIENT_ID` **must be the same client id** as the backend's
`GOOGLE_CLIENT_ID`, or the backend's audience check rejects every login.

### 3. Google OAuth setup

In Google Cloud Console → Credentials → your OAuth client, add:

- **Authorised JavaScript origins**: `http://localhost:3000`, `https://chomske.com`
- **Authorised redirect URIs**: not needed — `@react-oauth/google` uses the
  popup/ID-token flow, not a redirect.

---

## Two things worth knowing before you change anything

### The database is deliberately separate

This connects to the **same Atlas cluster** as betaFounderProduction but its own
database (`hinglish`). That's not a style choice: betaFounderProduction connects
with no database in its URI, so it lands in the cluster's default database, and
its `User` model writes to a collection called `users` — the same name this
project uses. One shared database would mean Hinglish signups landing in
betaFounder's live user table.

`db.js` refuses to start if that's ever misconfigured. Both guards are tested:

```
MONGODB_DB=test          → Refusing to run against database "test" …
MONGODB_URI without /db  → MONGODB_URI has no database name in it …
```

### Gemini's YouTube constraints are user-facing

The video is read straight from its URL — no download, no ffmpeg, no storage.
The limits that come with that surface as real error messages:

- **Public videos only.** Unlisted and private both fail.
- **Free tier caps at ~8 hours of video per day**, per API key — a per-key
  ceiling, not per-user. Add more keys to `AISTUDIO_KEY` to raise it.
- Long videos take minutes, which is why transcription is asynchronous: `POST
  /transcribe` returns a row immediately and the client polls it. Don't "simplify"
  that into one blocking request — it dies on proxy idle timeouts.

---

## Cost control

Reading a video is the only real cost in this product, so it's gated three ways:

1. Sign-in required on every `/transcribe` route
2. `DAILY_TRANSCRIBE_LIMIT` per user per rolling 24h (default 10)
3. A unique index on `(user, video_id)` — the same video is never paid for twice,
   enforced by the database rather than by application logic that a double-click
   can race

---

## API

| Method | Route | Notes |
|---|---|---|
| `POST` | `/auth/google` | Body `{ credential }` — the Google ID token. Verified server-side. |
| `GET` | `/auth/me` | Current user, or 401 |
| `POST` | `/auth/logout` | Clears the cookie |
| `POST` | `/transcribe` | Body `{ url }`. Returns `202` + a `processing` row, or the cached one |
| `GET` | `/transcribe/:id` | Poll target |
| `GET` | `/transcribe` | History + today's quota |
| `GET` | `/health` | Uptime check |

---

## Verified working

- Backend: all modules import, server boots, Mongo connects to `hinglish`
- Both database-separation guards fire correctly
- Auth and transcribe correctly return 401 when signed out
- YouTube parser: 14/14 cases (watch, youtu.be, Shorts, live, embed, m., bare id,
  playlist/timestamp params, and correct rejection of non-YouTube URLs)
- Frontend: production build compiles clean (85 kB gzipped)
- **End-to-end transcription, on a real video** — `youtube.com/shorts/re5iwZ5tigw`,
  a Hindi tech Short. 11.4s, 1,988 chars, detected as `hi-en` / "Hinglish
  (Hindi-English)". Hindi returned in Devanagari; `AI`, `Nvidia`, `GPUs`,
  `Colossus`, `SMIC`, `Huawei` and a whole English sentence stayed in English,
  exactly as spoken. Neither failure mode (translating to English, romanising to
  Latin letters) occurred.

### A note on the model name

The Gemini docs reference `gemini-3.8-flash`, **which does not exist** on a
current AI Studio key. Listing the key's models returns `gemini-2.5-flash`,
`gemini-3.5-flash`, `gemini-3-flash-preview`, `gemini-3.1-flash-lite` and others.
The shipped default is now `gemini-3.5-flash` (tested, works).

If transcription starts failing with a model error, list what your key can
actually reach rather than guessing:

```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=$AISTUDIO_KEY" \
  | grep -o '"models/[^"]*"'
```

then change `GEMINI_VIDEO_MODEL` in `.env`. It's config, not code, for exactly
this reason.
