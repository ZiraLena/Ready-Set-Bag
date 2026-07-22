/* ============================================================================
   READY-SET-BAG! — SHARED REPORTS ANALYTICS HELPER
   ----------------------------------------------------------------------------
   Pure, framework-free aggregation utilities used by BOTH the admin and teacher
   dashboards so every metric is computed the same way. No Firestore calls in
   here — the dashboards fetch sessionResults / students and pass the plain
   arrays in. Exposes window.RSBAnalytics.

   Data source: the "sessionResults" collection. Each result doc has:
     sessionId, sessionCode, teacherId, studentId, studentName, section,
     score (0-100), completionTime (seconds), attempts, stage
     ("Cognitive"|"Associative"|"Autonomous"), essentials, essentialsMax,
     errors, difficulty, createdAt.

   Completion rate definition (confirmed): students who have >= 1 result
   divided by total students in scope.
   ============================================================================ */
(function () {
  'use strict';

  var SUPPORT_THRESHOLD = 70; // avg score below this = "needs support"

  // ---- small utilities -----------------------------------------------------
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

  function round(v, d) {
    d = d || 0;
    var f = Math.pow(10, d);
    return Math.round(num(v) * f) / f;
  }

  // Escape text for safe innerHTML insertion.
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Seconds -> "m:ss" (e.g. 150 -> "2:30"). Returns "—" for no data.
  function formatTime(seconds) {
    var s = num(seconds);
    if (s <= 0) return '—';
    var m = Math.floor(s / 60);
    var r = Math.round(s % 60);
    if (r === 60) { m += 1; r = 0; }
    return m + ':' + (r < 10 ? '0' + r : r);
  }

  // Normalize a raw Firestore doc's data into a consistent result object.
  function normalizeResult(d) {
    d = d || {};
    var essMax = num(d.essentialsMax) || 15;
    return {
      sessionId: d.sessionId || '',
      sessionCode: d.sessionCode || '',
      teacherId: d.teacherId || '',
      studentId: d.studentId || '',
      studentName: d.studentName || '',
      section: d.section || 'Unknown',
      score: num(d.score),
      completionTime: num(d.completionTime),
      attempts: num(d.attempts),
      stage: d.stage || '',
      essentials: num(d.essentials),
      essentialsMax: essMax,
      errors: num(d.errors),
      difficulty: (d.difficulty || '').toLowerCase(),
      createdAt: d.createdAt && d.createdAt.toDate ? d.createdAt.toDate() : (d.createdAt || null)
    };
  }

  // Apply {section, difficulty} filters. Empty / "all" values mean no filter.
  function applyFilters(results, filters) {
    filters = filters || {};
    var section = (filters.section || '').trim();
    var difficulty = (filters.difficulty || '').trim().toLowerCase();
    var wantAllSection = !section || /^all/i.test(section);
    var wantAllDiff = !difficulty || /^all/i.test(difficulty);
    return results.filter(function (r) {
      if (!wantAllSection && r.section !== section) return false;
      if (!wantAllDiff && r.difficulty !== difficulty) return false;
      return true;
    });
  }

  function avg(arr, key) {
    if (!arr.length) return 0;
    var sum = 0;
    for (var i = 0; i < arr.length; i++) sum += num(arr[i][key]);
    return sum / arr.length;
  }

  // Reduce results to one "best" row per student (highest score; tiebreak: fewer
  // errors, then faster time). Also carries per-student averages + run count.
  function perStudentBest(results) {
    var byStudent = {};
    results.forEach(function (r) {
      var key = r.studentId || r.studentName;
      if (!key) return;
      if (!byStudent[key]) {
        byStudent[key] = { runs: [], best: r };
      }
      byStudent[key].runs.push(r);
      var b = byStudent[key].best;
      if (r.score > b.score ||
        (r.score === b.score && r.errors < b.errors) ||
        (r.score === b.score && r.errors === b.errors && r.completionTime < b.completionTime)) {
        byStudent[key].best = r;
      }
    });
    return Object.keys(byStudent).map(function (k) {
      var entry = byStudent[k];
      var runs = entry.runs;
      return {
        studentId: entry.best.studentId,
        studentName: entry.best.studentName,
        section: entry.best.section,
        bestScore: round(entry.best.score),
        avgScore: round(avg(runs, 'score')),
        avgTime: round(avg(runs, 'completionTime')),
        attempts: runs.length,
        stage: entry.best.stage,
        essentials: entry.best.essentials,
        essentialsMax: entry.best.essentialsMax,
        errors: entry.best.errors,
        best: entry.best
      };
    });
  }

  // ---- headline metrics -----------------------------------------------------
  // students: array of student docs in scope (already scoped by caller, e.g.
  // by teacher). filters narrow the RESULTS (section/difficulty).
  function computeMetrics(rawResults, students, filters) {
    var results = applyFilters((rawResults || []).map(normalizeResult), filters);
    students = students || [];

    // Scope student roster to the section filter too (so "total students" and
    // completion rate reflect the chosen section).
    var section = (filters && filters.section || '').trim();
    var wantAllSection = !section || /^all/i.test(section);
    var scopedStudents = wantAllSection ? students
      : students.filter(function (s) { return s.section === section; });

    var totalStudents = scopedStudents.length;
    var studentIdsWithResults = {};
    results.forEach(function (r) { if (r.studentId) studentIdsWithResults[r.studentId] = true; });
    var playedCount = Object.keys(studentIdsWithResults).length;

    var sectionCount = {};
    scopedStudents.forEach(function (s) { if (s.section) sectionCount[s.section] = true; });

    return {
      totalStudents: totalStudents,
      sectionsCount: Object.keys(sectionCount).length,
      avgScore: results.length ? round(avg(results, 'score')) : 0,
      avgTime: results.length ? round(avg(results, 'completionTime')) : 0,
      completionRate: totalStudents ? round((playedCount / totalStudents) * 100) : 0,
      playedCount: playedCount,
      resultCount: results.length,
      hasData: results.length > 0
    };
  }

  // Average score per section: [{section, avg, count, played}] sorted desc.
  function sectionAverages(rawResults, students, filters) {
    var results = applyFilters((rawResults || []).map(normalizeResult), filters);
    var bySection = {};
    results.forEach(function (r) {
      if (!bySection[r.section]) bySection[r.section] = { section: r.section, total: 0, count: 0, students: {} };
      bySection[r.section].total += r.score;
      bySection[r.section].count++;
      if (r.studentId) bySection[r.section].students[r.studentId] = true;
    });
    var arr = Object.keys(bySection).map(function (k) {
      var s = bySection[k];
      return {
        section: s.section,
        avg: s.count ? round(s.total / s.count) : 0,
        count: s.count,
        played: Object.keys(s.students).length,
        needsSupport: (s.count ? (s.total / s.count) : 0) < SUPPORT_THRESHOLD
      };
    });
    arr.sort(function (a, b) { return b.avg - a.avg; });
    return arr;
  }

  // Stage distribution across results as percentages {Cognitive, Associative, Autonomous}.
  function stageDistribution(rawResults, filters) {
    var results = applyFilters((rawResults || []).map(normalizeResult), filters);
    var buckets = { Cognitive: 0, Associative: 0, Autonomous: 0 };
    results.forEach(function (r) {
      if (buckets[r.stage] !== undefined) buckets[r.stage]++;
    });
    var total = results.length;
    return {
      total: total,
      Cognitive: total ? round((buckets.Cognitive / total) * 100) : 0,
      Associative: total ? round((buckets.Associative / total) * 100) : 0,
      Autonomous: total ? round((buckets.Autonomous / total) * 100) : 0
    };
  }

  // Students who need support: per-student avg score below threshold, ascending.
  function studentsNeedingSupport(rawResults, filters, threshold) {
    threshold = threshold == null ? SUPPORT_THRESHOLD : threshold;
    var results = applyFilters((rawResults || []).map(normalizeResult), filters);
    var perStudent = perStudentBest(results);
    return perStudent
      .filter(function (s) { return s.avgScore < threshold; })
      .sort(function (a, b) { return a.avgScore - b.avgScore; });
  }

  // Leaderboard ranked by best score (tiebreak fewer errors, faster time).
  function leaderboard(rawResults, filters) {
    var results = applyFilters((rawResults || []).map(normalizeResult), filters);
    var perStudent = perStudentBest(results);
    perStudent.sort(function (a, b) {
      if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
      if (a.errors !== b.errors) return a.errors - b.errors;
      return (a.best.completionTime || 0) - (b.best.completionTime || 0);
    });
    perStudent.forEach(function (s, i) { s.rank = i + 1; });
    return perStudent;
  }

  // Individual results, one aggregated row per student (best run), sorted by score desc.
  function individualRows(rawResults, filters) {
    var results = applyFilters((rawResults || []).map(normalizeResult), filters);
    var rows = perStudentBest(results);
    rows.sort(function (a, b) { return b.bestScore - a.bestScore; });
    return rows;
  }

  // Distinct sections present in results (for populating filter dropdowns).
  function distinctSections(rawResults, students) {
    var set = {};
    (rawResults || []).map(normalizeResult).forEach(function (r) { if (r.section) set[r.section] = true; });
    (students || []).forEach(function (s) { if (s.section) set[s.section] = true; });
    return Object.keys(set).sort();
  }

  window.RSBAnalytics = {
    SUPPORT_THRESHOLD: SUPPORT_THRESHOLD,
    esc: esc,
    formatTime: formatTime,
    normalizeResult: normalizeResult,
    computeMetrics: computeMetrics,
    sectionAverages: sectionAverages,
    stageDistribution: stageDistribution,
    studentsNeedingSupport: studentsNeedingSupport,
    leaderboard: leaderboard,
    individualRows: individualRows,
    distinctSections: distinctSections
  };
})();
