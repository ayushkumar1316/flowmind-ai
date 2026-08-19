# FlowMind

<div align="center">

### AI-Powered Personal Execution Intelligence Platform

> **Transform Goals into Daily Execution — Finish What Matters Before Deadlines Find You.**

</div>

---

## Overview

FlowMind is an AI-powered execution intelligence platform that helps users consistently complete meaningful work before deadlines become stressful.

Unlike traditional task managers that only organize tasks, FlowMind transforms your goals into personalized daily execution plans, tracks progress in real time, syncs data across devices via Firebase, and generates AI-powered productivity insights through Google Gemini.

It's not a to-do list. It's a **personal AI execution coach**.

---

## Features

### Smart Authentication
Google Sign-In, Email/Password auth, secure Firebase Authentication, and personalized onboarding flow.

### AI Planner
Describe your goal in plain text. FlowMind uses Google Gemini to generate a structured execution plan with priorities, time blocks, deadlines, and risk analysis.

### Save My Day
Running short on time? Tell FlowMind how many hours you have left and it will AI-triage your tasks — what to do now, what to push tomorrow, what to drop entirely.

### Live Task Board
Real-time task completion with focus sessions, smart sorting (priority → deadline → duration), repeating habit tracking, quick notes, and undo support.

### Execution Dashboard
Live productivity overview with success chance ring, AI coach messages, smart calendar, upcoming deadlines, and completed-today timeline.

### AI Insights
Confidence trend charts, execution DNA profile, productivity analytics, AI prediction engine, and weekly execution intelligence.

### Realtime Sync
Everything syncs instantly across devices via Cloud Firestore. One subscription, shared state across all pages.

---

## Tech Stack

| Category | Technology |
|-----------|------------|
| Frontend | React 19 + Vite |
| Styling | Tailwind CSS |
| AI Engine | Google Gemini 2.5 Flash |
| Auth | Firebase Authentication |
| Database | Cloud Firestore |
| Charts | Recharts |
| Icons | Lucide React |
| Hosting | Firebase Hosting |

---

## Architecture

```
                    User
                      │
                      ▼
         Firebase Authentication
                      │
                      ▼
            User Profile Setup
                      │
                      ▼
          Google Gemini AI Planner
                      │
                      ▼
         Cloud Firestore Database
                      │
      ┌───────────────┼───────────────┐
      ▼               ▼               ▼
 Dashboard      Task Board      AI Insights
      │               │               │
      └───────────────┼───────────────┘
                      ▼
        Realtime Execution Intelligence
```

---

## Local Setup

```bash
git clone https://github.com/ayushkumar1316/flowmind-ai-.git
cd flowmind-ai-
npm install
```

Create a `.env` file:

```env
VITE_GEMINI_API_KEY=your_gemini_api_key
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

Run locally:

```bash
npm run dev
```

---

## Project Structure

```
src/
├── components/          # Shared UI components
│   └── layout/          # MainLayout, Sidebar
├── contexts/            # React Context providers
│   ├── AuthContext.jsx
│   ├── AuthProvider.jsx
│   ├── PlanContext.jsx
│   └── PlanProvider.jsx
├── hooks/               # Custom hooks
│   ├── useAuth.js
│   └── usePlan.js
├── pages/
│   ├── Dashboard.jsx    # Execution overview
│   ├── AIPlanner.jsx    # AI plan generation
│   ├── TaskBoard.jsx    # Task execution workspace
│   ├── Insights.jsx     # Analytics & insights
│   ├── AuthPage.jsx     # Login / signup
│   └── SetupPage.jsx    # Onboarding flow
├── services/
│   ├── firebaseService.js
│   ├── authService.js
│   └── gemini.js        # Gemini AI integration
└── utils/
    └── dashboardMetrics.js
```

---

## Roadmap

- [ ] Save My Day — AI daily triage
- [ ] AI Reanalysis on task completion
- [ ] Settings page & profile editing
- [ ] Guest-to-account upgrade
- [ ] Subtasks & drag-to-reorder
- [ ] Focus timer persistence
- [ ] Dark mode
- [ ] Keyboard shortcuts
- [ ] Offline support (IndexedDB)
- [ ] TypeScript migration

---

## Author

**Ayush Kumar**

---

<div align="center">

**FlowMind — Execute Smarter. Finish Earlier.**

</div>
