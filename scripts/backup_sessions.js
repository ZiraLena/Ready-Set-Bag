const fs = require('fs');
const admin = require('../functions/node_modules/firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
  const [sessionsSnap, resultsSnap] = await Promise.all([
    db.collection('sessions').get(),
    db.collection('sessionResults').get()
  ]);
  const dump = {
    sessions: sessionsSnap.docs.map(d => ({ id: d.id, data: d.data() })),
    sessionResults: resultsSnap.docs.map(d => ({ id: d.id, data: d.data() }))
  };
  const path = __dirname + '/_backup_sessions_pre_cleanup.json';
  fs.writeFileSync(path, JSON.stringify(dump, null, 2));
  console.log('Backed up', dump.sessions.length, 'sessions and', dump.sessionResults.length, 'sessionResults to', path);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
