# FlowMind — Full Test & Audit Report
**Date:** 19 August 2026  
**Tested by:** Playwright (live on flowmind-db.web.app) + Code Audit  
**Environment:** Guest Login → AI Planner → Dashboard → TaskBoard → Insights

---

## 1. Playwright E2E Test Results

### Guest Login & Setup Flow

| Step | Result | Notes |
|------|--------|-------|
| Continue as Guest | PASS | Firebase anonymous auth works |
| Setup form fill (Name, Occupation, Goal, Time) | PASS | All fields accept input |
| "Complete Setup & Enter Workspace" click | PASS | Profile saved (console: "Profile setup completed") |
| Auto-redirect to Dashboard | ISSUE | Page stays on `/setup` with empty DOM snapshot. Manual navigation to `/` loads Dashboard correctly. |

**Verdict:** Setup works but redirect after completion is broken or delayed. User can manually navigate.

---

### AI Planner Flow

| Step | Result | Notes |
|------|--------|-------|
| Quick action "Placement Preparation" | PASS | Pre-fills textarea |
| "Continue" → follow-up questions | PASS | Correct multi-step flow |
| Review screen with detected params | PASS | Shows goal, type, hours |
| "Generate Smart Plan" | PASS | 4 tasks + 4 milestones generated |
| "Add to FlowMind" → Dashboard | PASS | Plan appears on Dashboard |

---

### Dashboard Flow

| Step | Result | Notes |
|------|--------|-------|
| Welcome header + user name | PASS | "Welcome Back, Test User" |
| AI Coach quote | PASS | Shows Firebase-sourced advice |
| Success Chance display | PASS | Shows 0% initially (correct for new plan) |
| Task list (Today's Tasks) | PASS | 4 tasks with priority + time estimates |
| Complete first task | PASS | Success % updates 0% → 25% |
| "Last Synced" indicator | PASS | Shows "20 sec ago" |
| Realtime Ready badge | PASS | Green indicator |
| Smart Calendar | PASS | August 2026 grid renders |
| Upcoming Deadlines | PASS | Shows due tasks with dates |
| Completed Today section | PASS | Shows completed task |
| Streak counter | PASS | Updates from 0 → 1 day |

---

### TaskBoard Flow

| Step | Result | Notes |
|------|--------|-------|
| Good Afternoon greeting | PASS | Personalized with user name |
| Progress bar (1/4) | PASS | Accurate after 1 completion |
| Quick stats (Tasks, Completed, Focus Time, Streak) | PASS | All update correctly |
| Active Execution task cards | PASS | 3 remaining tasks displayed |
| Start Focus → focus timer | PASS | Timer starts counting (19:42 visible) |
| Focus timer expanded view | PASS | Shows task details, timer, notes, complete button |
| Quick Notes textarea | PASS | Visible with "✓ Saved" indicator |
| Mark as Complete from expanded view | PASS | Available button |
| Upcoming tasks section | PASS | Shows future tasks |
| Completed Today count | PASS | Shows "1" |

**Known Issue:** Focus Time stat card shows hardcoded "4.5 hrs" — not real tracked time.

---

### Insights Flow

| Step | Result | Notes |
|------|--------|-------|
| Page loads for fresh user | PASS | Shows "Execution Intelligence Center" |
| Learning state messaging | PASS | "Awaiting Data", "Calibrating Metrics" etc. |
| Date range picker (Week/Month) | NOT TESTED | No data to filter yet |
| Export CSV button | NOT TESTED | No data to export yet |
| Charts (bar chart, confidence trend) | PASS | Empty states render correctly |
| AI Coach section | PASS | Shows learning message |

---

## 2. Code Audit Findings

### CRITICAL BUGS (Fix Immediately)

#### C1. TaskBoard does NOT log completions to Firestore history
**File:** `src/pages/TaskBoard.jsx:205-242`  
**Impact:** Tasks completed from TaskBoard are NOT logged to `completionLog` or `confidenceHistory` collections. Only Dashboard's `handleCompleteTask` calls `logTaskCompletion` and `logConfidenceChange`.  
**Result:** Insights page shows incomplete data — only Dashboard completions appear.  
**Fix:** Add `logTaskCompletion(user.uid, task)` and `logConfidenceChange()` calls to `handleCompleteWithAnimation`.

#### C2. `syncTasks` overwrites AI confidence score with naive percentage
**File:** `src/contexts/PlanProvider.jsx:47-61`  
**Impact:** Dashboard uses `recalculateAnalysis()` (AI-derived score), but TaskBoard's `syncTasks` replaces it with simple `completedCount / total * 100`. Confidence oscillates between two calculation methods.  
**Result:** User sees different Success % depending on which page they completed the last task from.  
**Fix:** Remove naive confidence calculation from `syncTasks`. Let Dashboard handle confidence via `recalculateAnalysis`.

#### C3. `exportToCSV` has broken date format matching
**File:** `src/services/historyService.js:240`  
**Impact:** `confidenceHistory.date` is `"2026-08-19"` but `productivityByDay.day` is `"Mon"`. The `.find()` always returns `undefined`.  
**Result:** CSV export "Tasks Completed" column is always "N/A".  
**Fix:** Match by actual date instead of day name, or use `completionLog` data directly.

---

### HIGH SEVERITY BUGS

#### H1. `handleApplyTriage` fire-and-forget `savePlan`
**File:** `src/pages/Dashboard.jsx:335-342`  
**Impact:** Save My Day triage changes are not awaited. If save fails, user data is lost silently. Modal closes regardless.  
**Fix:** Add `try/catch` with `await savePlan()` and show error toast on failure.

#### H2. Bar chart tooltip/label shows "%" but values are raw counts
**File:** `src/pages/Insights.jsx:39, 737`  
**Impact:** Productivity chart shows "3% Productivity" when 3 tasks were completed. Values are raw counts, not percentages.  
**Fix:** Change tooltip/label to show "X tasks completed" instead of "X% Productivity".

#### H3. Focus timer `useEffect` re-creates interval every second
**File:** `src/pages/TaskBoard.jsx:154-171`  
**Impact:** `remainingSeconds` is a dependency, causing the interval to be cleared and recreated every tick. Wasteful and can cause timing drift.  
**Fix:** Remove `remainingSeconds` from deps. Use a ref to access current value inside interval.

---

### MEDIUM SEVERITY BUGS

| # | File | Issue |
|---|------|-------|
| M1 | `historyService.js:103-109` | `getRecentConfidenceHistory` needs Firestore composite index on `(userId, date, recordedAt)` — silent failure if missing |
| M2 | `historyService.js:44-58` | `logConfidenceChange` doesn't validate `oldScore`/`newScore` — NaN values stored in Firestore |
| M3 | `historyService.js:137-158` | `getProductivityByDay` makes 7-14 sequential Firestore reads (performance) |
| M4 | `migrationService.js:52-98` | Firestore batch writes have no 500-op limit check |
| M5 | `migrationService.js:24-106` | Race condition in multi-tab / Strict Mode — duplicate Firestore writes possible |
| M6 | `Insights.jsx:120-128` | `getProductivityByDay` ignores `dateRange` — always shows 7 days |
| M7 | `Insights.jsx:138-157` | `handleExport` hardcodes 30-day range ignoring user's date selection |
| M8 | `TaskBoard.jsx:543` | Focus Time stat card shows hardcoded "4.5 hrs" |
| M9 | `TaskBoard.jsx:285-301` | `handleDeleteTask` uses stale closure — rapid deletions can cause inconsistent state |
| M10 | `PlanProvider.jsx:13` | App stuck in infinite loading if Firebase fails to initialize |
| M11 | `PlanProvider.jsx:8` | No timeout/fallback for `loadingPlan` stuck state |
| M12 | `Dashboard.jsx:193` | `tasks.map(task => task.raw)` fallback — `task.raw` may be undefined |

---

### LOW SEVERITY ISSUES

| # | File | Issue |
|---|------|-------|
| L1 | `historyService.js:76` | Peak hour extraction may use current hour for very recent completions |
| L2 | `historyService.js:194-204` | Streak calculation timezone edge case |
| L3 | `migrationService.js:83` | `recordedAt` uses `new Date()` instead of `serverTimestamp()` |
| L4 | `TaskBoard.jsx:202, 209, 367` | `setTimeout` cleanup missing (minor memory leaks on unmount) |
| L5 | `TaskBoard.jsx:112-114` | `focusedTaskId` init reads `parsed.remainingSeconds` — NaN if malformed |
| L6 | `Dashboard.jsx:209-217` | Duplicate task titles could cause double-counting in analysis |
| L7 | `PlanProvider.jsx:36-44` | `updatePlan` has stale closure race window |
| L8 | `Insights.jsx:49` | `AnimatedCounter` receives mixed string/number props |

---

## 3. Playwright Testing vs Code Audit Comparison

| Issue | Playwright Detected? | Code Audit Found? |
|-------|---------------------|-------------------|
| TaskBoard missing history logging | NO (looks fine in UI) | YES (C1) — data silently missing |
| Confidence score oscillation | NO (only saw one page) | YES (C2) — needs cross-page testing |
| CSV export broken | NOT TESTED | YES (C3) |
| Focus Time hardcoded "4.5 hrs" | NO (not explicitly checked) | YES (M8) |
| Setup redirect broken | YES | N/A (UI routing issue) |
| Bar chart % labels | NOT VISIBLE (no data) | YES (H2) |
| Firebase init failure = infinite load | NOT TESTED | YES (M10/M11) |

---

## 4. Priority Fix Order

### P0 — Must Fix Before Deploy (3 bugs)
1. **C1** — TaskBoard → add `logTaskCompletion` + `logConfidenceChange` (data integrity)
2. **C2** — Remove naive confidence from `syncTasks` (UX consistency)
3. **C3** — Fix CSV export date matching (broken feature)

### P1 — Fix Before Phase 3 (4 bugs)
4. **H1** — Await `savePlan` in `handleApplyTriage` (data loss)
5. **H2** — Fix bar chart labels from % to task count (misleading UI)
6. **H3** — Fix focus timer interval re-creation (performance)
7. **M8** — Replace hardcoded "4.5 hrs" with real focus time tracking

### P2 — Fix During Phase 3 (8 bugs)
8. **M1** — Create Firestore composite index for confidence queries
9. **M2** — Validate scores in `logConfidenceChange`
10. **M4** — Add batch size chunking in migration
11. **M6/M7** — Make Insights date range properly filter data
12. **M10/M11** — Add Firebase init timeout + error state
13. **M12** — Guard against undefined `task.raw`
14. **M9** — Fix rapid deletion race condition

### P3 — Fix Anytime (8 issues)
15. All L1-L8 low severity items

---

## 5. Phase Progress Summary

| Phase | Tasks Done | Tasks Remaining | Status |
|-------|-----------|----------------|--------|
| Phase 0 (Foundation) | 4/4 | 0 | COMPLETE |
| Phase 1A (Save My Day) | 7/7 | 0 | COMPLETE |
| Phase 1B (Unified State) | 2/2 | 0 | COMPLETE |
| Phase 2A (History Collections) | 2/3 | 1 (migration script — but it exists) | ~COMPLETE |
| Phase 2B (Charts & Tracking) | 3/4 | 1 (time tracking) | ~COMPLETE |
| Phase 3 (Account & Profile) | 0/5 | 5 | NOT STARTED |

### Exit Criteria Status

| Criterion | Met? |
|-----------|------|
| 7-day chart shows real historical data | YES |
| Time tracking captures actual vs estimated | NO (hardcoded) |
| User can filter insights by date range | YES (UI exists, data fetch partial) |
| Export produces valid CSV | NO (broken matching) |
| Users can edit profile after setup | NO (Phase 3) |
| Guest users can upgrade to permanent account | NO (Phase 3) |
| Avatar upload works | NO (Phase 3) |
| Account deletion cleans all data | NO (Phase 3) |
