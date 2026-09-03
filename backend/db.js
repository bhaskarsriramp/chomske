/**
 * db.js — one Mongo connection for the process.
 *
 * Chomske has its own Atlas cluster, so this is deliberately plain: username and
 * host sit in code, only the password comes from the environment. Same shape as
 * betaFounderProduction.
 *
 * The one thing worth keeping is the `/hinglish` in the path. A URI that ends
 * `…mongodb.net/?appName=…` connects to the cluster's default `test` database
 * instead, which is where data goes to quietly get lost.
 *
 * Unlike the reference project (which fires connect() and never awaits it), this
 * AWAITS and rethrows: a server that boots against a dead database answers every
 * request with a confusing 500 instead of failing loudly at startup.
 */
import mongoose from "mongoose";

const username = "sreeram_db_user";
const password = process.env.MONGODB_PASSWORD;

const dbUrl =
  "mongodb+srv://" + username + ":" + password +
  "@cluster0.ds8pal0.mongodb.net/hinglish?retryWrites=true&w=majority&appName=Cluster0";

export default async function connectToMongo() {
  if (!password) {
    throw new Error("MONGODB_PASSWORD is not set — add it to backend/.env.");
  }

  mongoose.connection.on("error", (err) => console.error("[mongo] error:", err.message));
  mongoose.connection.on("disconnected", () => console.warn("[mongo] disconnected"));

  await mongoose.connect(dbUrl, { serverSelectionTimeoutMS: 15000 });
  console.log(`[mongo] connected → db "${mongoose.connection.name}"`);
}
