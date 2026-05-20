/* ============================================================================
   READY-SET-BAG! TEACHER DASHBOARD - SCRIPTS
   ============================================================================ */

// Global variables
let teacherId = null;
let teacherSection = null;
let teacherRecentActivityListener = null;

// Load teacher info on page load
window.addEventListener('load', () => {
  // Debug: log session + firebase state early
  try { console.log('Teacher dashboard load - session:', {
    userRole: sessionStorage.getItem('userRole'),
    teacherId: sessionStorage.getItem('teacherId'),
    teacherSection: sessionStorage.getItem('teacherSection'),
    teacherLastPage: sessionStorage.getItem('teacherLastPage')
  }, 'firebaseReady=', window.firebaseReady); } catch (e) {}

  window.addEventListener('error', (ev) => {
    console.error('Unhandled error on teacher dashboard:', ev.error || ev.message, ev);
    try { showToast('Error: ' + (ev.error?.message || ev.message), 'error'); } catch (e) {}
  });

  initAuthGuard();
  // Pre-paint restore: if head script set an initial page, apply it now and clear restoring marker
  try {
    const initial = document.documentElement.getAttribute('data-teacher-initial');
    if (initial) {
      const navs = document.querySelectorAll('.nav-item');
      let btn = null;
      for (let i=0;i<navs.length;i++){
        const on = navs[i].getAttribute('onclick') || '';
        if (on.indexOf("'"+initial+"'")!==-1 || on.indexOf('\"'+initial+'\"')!==-1) { btn = navs[i]; break; }
      }
      if (document.getElementById('page-' + initial)) {
        navigate(initial, btn);
      }
      document.documentElement.classList.remove('js-restoring');
      document.documentElement.removeAttribute('data-teacher-initial');
    }
  } catch (e) { console.warn('prepaint teacher restore failed', e); } finally {
    // Always clear restoring marker to avoid leaving the page hidden
    try { document.documentElement.classList.remove('js-restoring'); document.documentElement.removeAttribute('data-teacher-initial'); } catch (_) {}
  }

  const username = sessionStorage.getItem('username');
  const section = sessionStorage.getItem('teacherSection');
  
  if (username && section) {
    // Update sidebar-user
    document.querySelector('.sidebar-user .name').textContent = username.toUpperCase();
    document.querySelector('.sidebar-user .section-tag').textContent = section;
    
    // Update welcome-card
    document.querySelector('.welcome-greeting').textContent = `👋 WELCOME BACK, TEACHER ${username.toUpperCase()}!`;
    document.querySelectorAll('.welcome-meta-item')[0].textContent = `🏫 ${section}`;
  }
  
  teacherId = sessionStorage.getItem('teacherId');
  teacherSection = section;
  
  // Load student count for this teacher
  loadTeacherStudentCount();
  
  // Load recent activity when reports page is viewed
  document.addEventListener('click', (e) => {
    if (e.target.closest('.nav-item') && e.target.closest('.nav-item').textContent.includes('REPORTS')) {
      loadTeacherRecentActivity();
    }
  });

  // If Firebase doesn't initialize within a short time, show offline placeholders
  setTimeout(() => {
    try {
      if (!window.db) showTeacherOfflineFallback();
    } catch (e) { /* ignore */ }
  }, 1500);
});

// Ensure a page is visible even if navigation didn't run
setTimeout(() => {
  try {
    if (!document.querySelector('.page.active')) {
      const firstNav = document.querySelector('.nav-item');
      if (document.getElementById('page-home')) navigate('home', firstNav);
    }
  } catch (e) { console.warn('forced nav fallback failed', e); }
}, 200);

function showTeacherOfflineFallback() {
  try {
    const countEl = document.getElementById('welcome-student-count');
    if (countEl) countEl.textContent = '0 students';
    const container = document.getElementById('teacher-recent-activity');
    if (container) container.innerHTML = '<div class="activity-item"><div class="activity-desc">Offline: recent activity unavailable.</div></div>';
    showToast('Firebase not available. Showing offline placeholders.', 'info');
  } catch (e) { console.warn('showTeacherOfflineFallback failed', e); }
}

// ---- LOAD STUDENT COUNT (REAL-TIME) ----
function loadTeacherStudentCount() {
  // Ensure Firebase is initialized before attaching listener
  (async () => {
    if (!window.firebaseReady && window.firebaseInitPromise) {
      await window.firebaseInitPromise;
    }

    if (!teacherId) return;
    if (!window.db) {
      console.warn('loadTeacherStudentCount: Firebase not ready');
      return;
    }

    // Listen to students collection for this teacher
    window.db.collection('students').where('teacherId', '==', teacherId).onSnapshot((snapshot) => {
      const count = snapshot.size;
      const element = document.getElementById('welcome-student-count');
      if (element) {
        element.textContent = `${count} student${count !== 1 ? 's' : ''}`;
      }
    });
  })();
}

/* ---- NAVIGATION ---- */
function navigate(page, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  if (btn) btn.classList.add('active');
  try { sessionStorage.setItem('teacherLastPage', page); } catch (e) { /* ignore */ }
  // If navigating to reports, ensure recent activity attaches even if Firebase init was delayed
  if (page === 'reports') {
    loadTeacherRecentActivity();
    setTimeout(() => {
      try {
        // If listener didn't attach, try again
        if (!teacherRecentActivityListener && window.db) loadTeacherRecentActivity();
      } catch (e) { /* ignore */ }
    }, 900);
  }
}

/* ---- LOGOUT ---- */
function logout() {
  if (window.auth) {
    window.auth.signOut().catch(err => console.error('Sign out error:', err));
  }
  sessionStorage.clear();
  showToast('Logged out.');
  setTimeout(() => {
    window.location.href = '../index.html';
  }, 500);
}

/* ---- AVATAR MENU ---- */
function toggleAvatarMenu() {
  const menu = document.getElementById('avatar-menu');
  menu.classList.toggle('show');
}

document.addEventListener('click', (e) => {
  const menu = document.getElementById('avatar-menu');
  const avatar = document.querySelector('.topbar-avatar');
  if (!avatar.contains(e.target) && !menu.contains(e.target)) {
    menu.classList.remove('show');
  }
});

/* ---- DIFFICULTY SELECTION ---- */
// Handled by session-manager.js

/* ---- SESSION CODE ---- */
// Handled by session-manager.js

/* ---- STUDENTS JOINED SIMULATION ---- */
// Handled by session-manager.js (real-time Firebase listener)

/* ---- TOAST ---- */
let toastTimer;
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast' + (type === 'error' ? ' error' : '');
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

/* ---- FILTER INDIVIDUAL RESULTS ---- */
function filterResults(query) {
  const q = query.toLowerCase();
  const rows = document.querySelectorAll('#results-tbody tr');
  let visible = 0;
  rows.forEach(row => {
    const match = row.textContent.toLowerCase().includes(q);
    row.style.display = match ? '' : 'none';
    if (match) visible++;
  });
  const total = rows.length;
  const footer = document.getElementById('results-footer');
  if (footer) {
    footer.textContent = `SHOWING ${visible} OF ${total} STUDENTS`;
  }
}

/* ---- LOAD RECENT ACTIVITY ---- */
function loadTeacherRecentActivity() {
  (async () => {
    if (!window.firebaseReady && window.firebaseInitPromise) {
      await window.firebaseInitPromise;
    }

    if (!teacherId) return;
    const container = document.getElementById('teacher-recent-activity');
    if (!container) return;

    // show loader immediately while listener initializes
    try {
      container.innerHTML = '<div class="gif-loader"><img src="/images/loading.gif" class="gif-loader-image" width="72" height="72" style="width:72px;height:72px;" onerror="this.src=\'../images/loading.gif\'"/><div class="gif-loader-text">LOADING…</div></div>';
    } catch (e) { console.warn('show teacher loader failed', e); }

    if (!window.db) {
      console.warn('loadTeacherRecentActivity: Firebase not ready');
      return;
    }

    if (teacherRecentActivityListener) {
      teacherRecentActivityListener();
      teacherRecentActivityListener = null;
    }

    // Listen to sessions collection for this teacher
    teacherRecentActivityListener = window.db.collection('sessions')
      .where('teacherId', '==', teacherId)
      .orderBy('createdAt', 'desc')
      .limit(5)
      .onSnapshot((snapshot) => {
        container.innerHTML = '';

        const rows = snapshot.docs
          .map(doc => ({ id: doc.id, data: doc.data() }))
          .filter(entry => entry.data.startedAt || entry.data.status === 'active' || entry.data.endedAt);

        if (!rows.length) {
          container.innerHTML = '<div class="activity-item"><div class="activity-desc">No recent activity</div></div>';
          return;
        }

        rows.forEach((entry) => {
          const session = entry.data;
          const date = session.createdAt ? new Date(session.createdAt.toDate()).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : 'Unknown';
          const difficulty = session.difficulty || 'Unknown';
          const playerCount = session.playersList ? session.playersList.length : 0;
          const statusLabel = session.status === 'active' || session.startedAt ? 'Started' : 'Created';

          const activityDiv = document.createElement('div');
          activityDiv.className = 'activity-item';
          activityDiv.innerHTML = `
            <div class="activity-date">${date}</div>
            <div class="activity-teacher">${statusLabel} ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} Session</div>
            <div class="activity-desc">Section: ${teacherSection || 'Unknown'}<br>Session Code: ${session.sessionCode}<br>${playerCount} students</div>
          `;
          container.appendChild(activityDiv);
        });
      });
  })();
}

// ---- CSV EXPORT HELPERS ----
function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

  if (window.navigator && typeof window.navigator.msSaveOrOpenBlob === 'function') {
    window.navigator.msSaveOrOpenBlob(blob, filename);
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}

function formatCsvValue(value) {
  return '"' + String(value ?? '').replace(/"/g, '""') + '"';
}

function formatDateValue(value) {
  if (!value) return '';
  if (value.toDate) return value.toDate().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

// Helper: export a query in pages to CSV to avoid loading entire collections at once
async function exportQueryToCsvPaged_Teacher(filename, headerRow, baseQuery, rowMapper, batchSize = 500) {
  const rows = [headerRow];
  let lastDoc = null;
  while (true) {
    let q = baseQuery.limit(batchSize);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;
    snap.forEach(doc => rows.push(rowMapper(doc)));
    if (snap.size < batchSize) break;
    lastDoc = snap.docs[snap.docs.length - 1];
  }
  downloadCsv(filename, rows.join('\n'));
}

async function exportTeacherSessionResultsCsv() {
  if (!window.db || !teacherId) {
    showToast('Firebase not initialized.', 'error');
    return;
  }

  try {
    const header = ['id','sessionId','sessionCode','teacherId','studentId','studentName','section','score','completionTime','attempts','stage','essentials','essentialsMax','errors','difficulty','createdAt','updatedAt'].join(',');
    const baseQuery = window.db.collection('sessionResults')
      .where('teacherId', '==', teacherId)
      .orderBy('createdAt', 'desc');
    await exportQueryToCsvPaged_Teacher('teacher-session-results.csv', header, baseQuery, (doc) => {
      const result = doc.data();
      return [
        formatCsvValue(doc.id),
        formatCsvValue(result.sessionId || ''),
        formatCsvValue(result.sessionCode || ''),
        formatCsvValue(result.teacherId || teacherId || ''),
        formatCsvValue(result.studentId || ''),
        formatCsvValue(result.studentName || ''),
        formatCsvValue(result.section || teacherSection || ''),
        formatCsvValue(result.score || 0),
        formatCsvValue(result.completionTime || 0),
        formatCsvValue(result.attempts || 0),
        formatCsvValue(result.stage || ''),
        formatCsvValue(result.essentials || 0),
        formatCsvValue(result.essentialsMax || 0),
        formatCsvValue(result.errors || 0),
        formatCsvValue(result.difficulty || ''),
        formatCsvValue(formatDateValue(result.createdAt)),
        formatCsvValue(formatDateValue(result.updatedAt))
      ].join(',');
    });
    showToast('Teacher CSV exported.');
  } catch (err) {
    console.error('Export teacher CSV failed', err);
    showToast('Error exporting CSV: ' + err.message, 'error');
  }

  // After Firebase initializes, if the restored page is REPORTS, load recent activity
  if (window.firebaseInitPromise) {
    window.firebaseInitPromise.then(() => {
      try {
        const isReports = document.getElementById('page-reports')?.classList.contains('active');
        if (isReports) loadTeacherRecentActivity();
      } catch (e) { console.warn('post-init teacher restore', e); }
    });
  }
}
