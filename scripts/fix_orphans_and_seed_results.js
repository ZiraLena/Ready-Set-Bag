// Cleans up orphaned production `sessions` (teacherId not matching any real
// teacher) and the broken blank sessionResults doc, then seeds real
// sessions/sessionResults for students that actually exist. A backup was
// already taken via scripts/backup_sessions.js before running this.
const admin = require('../functions/node_modules/firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

let _seed = 42;
function rand() { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; }
function randInt(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }

const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
function stageForScore(score) {
  if (score < 60) return 'Cognitive';
  if (score < 82) return 'Associative';
  return 'Autonomous';
}

async function deleteInBatches(refs) {
  const CHUNK = 400;
  for (let i = 0; i < refs.length; i += CHUNK) {
    const batch = db.batch();
    refs.slice(i, i + CHUNK).forEach(ref => batch.delete(ref));
    await batch.commit();
  }
}

async function main() {
  const [teachersSnap, studentsSnap, sessionsSnap, resultsSnap] = await Promise.all([
    db.collection('teachers').get(),
    db.collection('students').get(),
    db.collection('sessions').get(),
    db.collection('sessionResults').get()
  ]);

  const teachers = teachersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const students = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const teacherIds = new Set(teachers.map(t => t.id));

  // ---- 1. delete orphaned sessions (teacherId not matching any real teacher) ----
  const orphanRefs = sessionsSnap.docs.filter(d => !teacherIds.has(d.data().teacherId)).map(d => d.ref);
  await deleteInBatches(orphanRefs);
  console.log(`Deleted ${orphanRefs.length} orphaned sessions.`);

  // ---- 2. delete broken/blank sessionResults ----
  const brokenRefs = resultsSnap.docs.filter(d => !d.data().studentId).map(d => d.ref);
  await deleteInBatches(brokenRefs);
  console.log(`Deleted ${brokenRefs.length} broken sessionResults.`);

  // ---- 3. group real students by teacher ----
  const studentsByTeacher = {};
  for (const s of students) {
    studentsByTeacher[s.teacherId] = studentsByTeacher[s.teacherId] || [];
    studentsByTeacher[s.teacherId].push(s);
  }
  const teachersWithStudents = teachers.filter(t => (studentsByTeacher[t.id] || []).length > 0);

  // ---- 4. ensure each teacher-with-students has at least a few valid sessions ----
  const remainingSessionsSnap = await db.collection('sessions').get();
  const validSessionsByTeacher = {};
  for (const doc of remainingSessionsSnap.docs) {
    const teacherId = doc.data().teacherId;
    validSessionsByTeacher[teacherId] = validSessionsByTeacher[teacherId] || [];
    validSessionsByTeacher[teacherId].push({ id: doc.id, ...doc.data() });
  }

  for (const t of teachersWithStudents) {
    const existing = validSessionsByTeacher[t.id] || [];
    const needed = Math.max(0, 3 - existing.length);
    for (let i = 0; i < needed; i++) {
      const code = Array.from({ length: 5 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[randInt(0, 29)]).join('');
      const createdAt = new Date(Date.now() - randInt(1, 14) * 86400000);
      const ref = await db.collection('sessions').add({
        sessionCode: code,
        teacherId: t.id,
        difficulty: pick(DIFFICULTIES),
        playersJoined: randInt(2, (studentsByTeacher[t.id] || []).length || 2),
        playersList: [],
        status: 'ended',
        createdAt: admin.firestore.Timestamp.fromDate(createdAt),
        updatedAt: admin.firestore.Timestamp.fromDate(createdAt),
        endedAt: admin.firestore.Timestamp.fromDate(new Date(createdAt.getTime() + 20 * 60000))
      });
      existing.push({ id: ref.id, sessionCode: code, teacherId: t.id });
    }
    validSessionsByTeacher[t.id] = existing;
    console.log(`${t.firstName} ${t.lastName}: ${existing.length} sessions available (created ${needed}).`);
  }

  // ---- 5. seed sessionResults for real students only, matching real section/teacher/session ----
  let resultCount = 0;
  for (const t of teachersWithStudents) {
    const sessionsForTeacher = validSessionsByTeacher[t.id];
    const teacherStudents = studentsByTeacher[t.id];
    for (let idx = 0; idx < teacherStudents.length; idx++) {
      const s = teacherStudents[idx];
      if (rand() < 0.15) continue; // ~15% of students haven't played yet, realistic
      const runs = randInt(1, 2);
      for (let r = 0; r < runs; r++) {
        const ability = 45 + ((idx * 7) % 50);
        const score = Math.max(30, Math.min(100, Math.round(ability + randInt(-12, 12))));
        const essentialsMax = 15;
        const essentials = Math.max(0, Math.min(essentialsMax, Math.round((score / 100) * essentialsMax + randInt(-2, 1))));
        const errors = Math.max(0, Math.round((100 - score) / 12) + randInt(0, 2));
        const completionTime = randInt(90, 300);
        const sess = pick(sessionsForTeacher);
        const createdAt = new Date(Date.now() - randInt(0, 10) * 86400000);
        await db.collection('sessionResults').add({
          sessionId: sess.id,
          sessionCode: sess.sessionCode || '',
          teacherId: t.id,
          studentId: s.id,
          studentName: s.displayName || `${s.firstName} ${s.lastName}`,
          section: s.section, // matches the real student doc's section
          score,
          completionTime,
          attempts: r + 1,
          stage: stageForScore(score),
          essentials,
          essentialsMax,
          errors,
          difficulty: pick(DIFFICULTIES),
          createdAt: admin.firestore.Timestamp.fromDate(createdAt),
          updatedAt: admin.firestore.Timestamp.fromDate(createdAt)
        });
        resultCount++;
      }
    }
  }
  console.log(`Seeded ${resultCount} sessionResults for real students.`);

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
