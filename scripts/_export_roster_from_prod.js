// READ-ONLY export of the real roster (teachers + students) from PRODUCTION.
// Writes to a local JSON file. Does NOT modify production in any way.
const fs = require('fs');
const path = require('path');
const admin = require('../functions/node_modules/firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function dump(col) {
  const snap = await db.collection(col).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function main() {
  const out = {
    teachers: await dump('teachers'),
    students: await dump('students')
  };
  // strip Firestore Timestamp objects (not needed for the roster)
  const clean = JSON.parse(JSON.stringify(out, (k, v) =>
    (v && v._seconds !== undefined) ? null : v));
  const outPath = path.join(__dirname, '_roster_export.json');
  fs.writeFileSync(outPath, JSON.stringify(clean, null, 2));
  console.log(`Exported ${clean.teachers.length} teachers, ${clean.students.length} students -> ${outPath}`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
