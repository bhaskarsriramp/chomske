/**
 * db.js — one Mongo connection for the process.
 *
 * ── SHARED CLUSTER, SEPARATE DATABASE ────────────────────────────────────────
 * This points at the SAME Atlas cluster as betaFounderProduction (same account,
 * same credentials, no extra cost) but at its own database: `hinglish`.
 *
 * That separation is not optional. betaFounderProduction connects with NO
 * database in its URI (…mongodb.net/?appName=Cluster0), so it lands in the
 * cluster's default database, and its User model writes to a collection called
 * `users` — the same name this project uses. Sharing one database would mean
 * Hinglish signups landing in betaFounder's live users collection and its
 * queries returning rows of a schema they know nothing about. The `/hinglish`
 * path below is what keeps the two apart.
 *
 * Unlike the reference project (which fires connect() and never awaits it), this
 * AWAITS and rethrows: a server that boots against a dead database answers every
 * request with a confusing 500 instead of failing loudly at startup.
 */
import mongoose from "mongoose";

const DB_NAME = process.env.MONGODB_DB || "hinglish";

function buildUri() {
  // Full override wins, for anyone pointing at a different cluster entirely.
  // Guard it: a URI with no database path would silently land in the shared
  // default database — the exact collision this file exists to prevent.
  const explicit = (process.env.MONGODB_URI || "").trim();
  if (explicit) {
    const hasDbPath = /mongodb(\+srv)?:\/\/[^/]+\/[^/?]+/.test(explicit);
    if (!hasDbPath) {
      throw new Error(
        "MONGODB_URI has no database name in it. Add one (…mongodb.net/hinglish?…) — " +
        "without it this connects to the cluster's default database, which is shared " +
        "with betaFounderProduction and uses the same `users` collection name."
      );
    }
    return explicit;
  }

  // Otherwise build it from parts. None of these carry a default on purpose: a
  // cluster hostname and a database username are two thirds of a credential, and
  // baking them into a tracked source file means a leaked password is instantly
  // a usable connection string. Config belongs in the environment, all of it.
  const user = required("MONGODB_USER");
  const password = required("MONGODB_PASSWORD");
  const host = required("MONGODB_HOST");

  return `mongodb+srv://${user}:${encodeURIComponent(password)}@${host}/${DB_NAME}?retryWrites=true&w=majority&appName=Hinglish`;
}

/** Read a required setting, or fail at boot with a message that says what to do. */
function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`${name} is not set — copy .env.example to .env and fill it in.`);
  }
  return value;
}

export default async function connectToMongo() {
  mongoose.connection.on("error", (err) => console.error("[mongo] error:", err.message));
  mongoose.connection.on("disconnected", () => console.warn("[mongo] disconnected"));

  await mongoose.connect(buildUri(), { serverSelectionTimeoutMS: 15000 });
  console.log(`[mongo] connected → db "${mongoose.connection.name}"`);

  // Loud, deliberate guard. If this ever reports the shared default database,
  // something has gone wrong with the URI and we are one write away from
  // polluting betaFounderProduction's collections.
  if (mongoose.connection.name === "test" || !mongoose.connection.name) {
    throw new Error(
      `Refusing to run against database "${mongoose.connection.name}" — that is the shared ` +
      `default database used by betaFounderProduction. Set MONGODB_DB or fix MONGODB_URI.`
    );
  }
}
