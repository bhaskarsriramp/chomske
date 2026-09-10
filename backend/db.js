/**
 * db.js: one Mongo connection for the process.
 *
 * Lipi shares the Atlas account/cluster with betaFounderProduction, so this is
 * deliberately plain: username and host sit in code, only the password comes
 * from the environment.
 *
 * The one thing worth keeping is the `/hinglish` in the path. A URI that ends
 * `…mongodb.net/?appName=…` — the shape betaFounderProduction uses — connects to
 * the cluster's default `test` database instead, which is where data goes to
 * quietly get lost. Same cluster, different database: that path segment is the
 * only thing separating Lipi's collections from betaFounder's.
 *
 * Unlike the reference project (which fires connect() and never awaits it), this
 * AWAITS and rethrows: a server that boots against a dead database answers every
 * request with a confusing 500 instead of failing loudly at startup.
 */
import mongoose from "mongoose";

const username = "myhandlein_db_user";
const password = process.env.MONGODB_PASSWORD;

const dbUrl =
  "mongodb+srv://" + username + ":" + password +
  "@cluster0.itfkrwb.mongodb.net/hinglish?retryWrites=true&w=majority&appName=Cluster0";

export default async function connectToMongo() {
  // Escape hatch, unset in production. Its reason for existing is the migration
  // scripts: running one with --apply against the live cluster having never run
  // it anywhere is not a thing anyone should have to do, and this is what makes
  // "restore a dump locally, point at it, watch what it does" possible.
  const override = String(process.env.MONGODB_URI || "").trim();
  if (override) {
    await mongoose.connect(override, { serverSelectionTimeoutMS: 15000 });
    console.log(`[mongo] connected via MONGODB_URI → db "${mongoose.connection.name}"`);
    return;
  }

  if (!password) {
    throw new Error("MONGODB_PASSWORD is not set. Add it to backend/.env.");
  }

  mongoose.connection.on("error", (err) => console.error("[mongo] error:", err.message));
  mongoose.connection.on("disconnected", () => console.warn("[mongo] disconnected"));

  await mongoose.connect(dbUrl, { serverSelectionTimeoutMS: 15000 });
  console.log(`[mongo] connected → db "${mongoose.connection.name}"`);
}
