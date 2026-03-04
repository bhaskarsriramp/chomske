/**
 * SchemaRegistry — persistent cache of schema fingerprints per MongoDB URI.
 *
 * Keyed by a SHA-256 hash of the user's MongoDB URI so that re-connecting to
 * the same database skips the expensive 6-pass fingerprint and only re-processes
 * collections whose document count changed significantly (>5% delta or >100 docs).
 *
 * Storage backends (in priority order):
 *   1. MongoDB  — when REGISTRY_MONGO_URI env var is set (production / multi-instance)
 *   2. File     — backend/graphs/fp-{hash}.json  (default, zero-config)
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '../graphs');
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

function hashUri(uri) {
  return createHash('sha256').update(uri).digest('hex').slice(0, 16);
}

// ── Optional MongoDB backend ──────────────────────────────────────────────────
// Lazily initialised so the server boots even if REGISTRY_MONGO_URI is absent.

let _mongoClient = null;
let _mongoCol    = null;

async function _getMongoCol() {
  if (_mongoCol) return _mongoCol;
  const { MongoClient } = await import('mongodb');
  _mongoClient = new MongoClient(process.env.REGISTRY_MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS:         5000,
  });
  await _mongoClient.connect();
  _mongoCol = _mongoClient.db('founderdb_registry').collection('fingerprints');
  return _mongoCol;
}

// ── SchemaRegistry ────────────────────────────────────────────────────────────

export class SchemaRegistry {
  static _usesMongo() { return !!process.env.REGISTRY_MONGO_URI; }
  static _filePath(key) { return join(CACHE_DIR, `fp-${key}.json`); }

  /**
   * load(mongoUri) → cached fingerprint data | null
   *
   * Returns: { profiles, edges, semanticEq, websiteTerms, metrics,
   *             docCounts, fingerprintedAt }
   * Returns null if no cache exists for this URI.
   */
  static async load(mongoUri) {
    const key = hashUri(mongoUri);

    if (SchemaRegistry._usesMongo()) {
      try {
        const col = await _getMongoCol();
        const doc = await col.findOne({ _id: key });
        if (doc) {
          const { _id, ...data } = doc;
          console.log(`[SchemaRegistry] Loaded from MongoDB (key=${key}, fingerprinted=${data.fingerprintedAt})`);
          return data;
        }
      } catch (e) {
        console.warn('[SchemaRegistry] MongoDB load failed, falling back to file:', e.message);
      }
    }

    const file = SchemaRegistry._filePath(key);
    if (!existsSync(file)) return null;
    try {
      const data = JSON.parse(readFileSync(file, 'utf8'));
      console.log(`[SchemaRegistry] Loaded from file (key=${key}, fingerprinted=${data.fingerprintedAt})`);
      return data;
    } catch (e) {
      console.warn('[SchemaRegistry] File load failed:', e.message);
      return null;
    }
  }

  /**
   * save(mongoUri, data) — persist fingerprint data.
   *
   * data should contain: { profiles, edges, semanticEq, websiteTerms, metrics, docCounts }
   */
  static async save(mongoUri, data) {
    const key     = hashUri(mongoUri);
    const payload = { ...data, fingerprintedAt: new Date().toISOString() };

    if (SchemaRegistry._usesMongo()) {
      try {
        const col = await _getMongoCol();
        await col.replaceOne({ _id: key }, { _id: key, ...payload }, { upsert: true });
        console.log(`[SchemaRegistry] Saved to MongoDB (key=${key})`);
        return;
      } catch (e) {
        console.warn('[SchemaRegistry] MongoDB save failed, falling back to file:', e.message);
      }
    }

    const file = SchemaRegistry._filePath(key);
    writeFileSync(file, JSON.stringify(payload, null, 2));
    console.log(`[SchemaRegistry] Saved to file: ${file}`);
  }
}
