/**
 * Test-data cleanup script.
 *
 * Deletes documents from Firestore collections that accumulate during testing.
 * Defaults to clearing ONLY the `users` collection. Additional collections can
 * be cleared by passing them as CLI args, e.g.:
 *
 *   node --loader ts-node/esm -r dotenv/config scripts/cleanup-test-data.ts
 *   node --loader ts-node/esm -r dotenv/config scripts/cleanup-test-data.ts users sessions commandLog
 *
 * Add --dry-run to preview what would be deleted without deleting anything.
 *
 * Safety: this permanently removes data and cannot be undone. It requires the
 * same Firebase credentials the server uses (FIREBASE_* env vars).
 */
import admin from 'firebase-admin';
import type { Firestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { config } from '../src/config/index.js';

const DEFAULT_COLLECTIONS = ['users'];
const BATCH_SIZE = 400;

function initFirebase(): Firestore {
  if (!admin.apps.length) {
    const initOptions: admin.AppOptions = { projectId: config.firebase.projectId };
    if (config.firebase.serviceAccountPath) {
      const serviceAccount = JSON.parse(readFileSync(config.firebase.serviceAccountPath, 'utf-8'));
      initOptions.credential = admin.credential.cert(serviceAccount);
    }
    admin.initializeApp(initOptions);
  }
  return admin.firestore();
}

async function clearCollection(db: Firestore, name: string, dryRun: boolean): Promise<number> {
  const snapshot = await db.collection(name).get();
  if (snapshot.empty) {
    console.log(`[cleanup] '${name}': already empty (0 docs).`);
    return 0;
  }

  if (dryRun) {
    console.log(`[cleanup] '${name}': would delete ${snapshot.size} doc(s) (dry-run).`);
    return snapshot.size;
  }

  let deleted = 0;
  let batch = db.batch();
  let ops = 0;
  for (const doc of snapshot.docs) {
    batch.delete(doc.ref);
    ops++;
    deleted++;
    if (ops >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) {
    await batch.commit();
  }
  console.log(`[cleanup] '${name}': deleted ${deleted} doc(s).`);
  return deleted;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const collections = args.filter((a) => !a.startsWith('--'));
  const targets = collections.length > 0 ? collections : DEFAULT_COLLECTIONS;

  console.log(`[cleanup] Project: ${config.firebase.projectId || '(default credentials)'}`);
  console.log(`[cleanup] Collections: ${targets.join(', ')}${dryRun ? ' (dry-run)' : ''}`);

  const db = initFirebase();

  let total = 0;
  for (const name of targets) {
    total += await clearCollection(db, name, dryRun);
  }

  console.log(`[cleanup] Done. ${dryRun ? 'Would delete' : 'Deleted'} ${total} doc(s) total.`);
  process.exit(0);
}

main().catch((error) => {
  console.error('[cleanup] Fatal error:', error);
  process.exit(1);
});
