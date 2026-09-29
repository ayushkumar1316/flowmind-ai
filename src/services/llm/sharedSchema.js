/**
 * Shared structured JSON contract for ALL LLM providers.
 *
 * CRITICAL: This single source of truth guarantees that Gemini and Groq
 * return the SAME shape. The frontend (AIPlanner, Dashboard, TaskBoard)
 * only ever reads these field names — it never knows which provider
 * produced the response.
 *
 * If a provider's responseSchema deviates, the factory normalizes it
 * here BEFORE it reaches the UI, so the app never breaks.
 */

// --- Plan generation contract (generatePlan) ---
export const PLAN_SCHEMA = {
    type: "OBJECT",
    properties: {
        confidenceScore: { type: "INTEGER" },
        riskLevel: { type: "STRING" },
        riskReason: { type: "STRING" },
        agentMessage: { type: "STRING" },
        todayPlan: {
            type: "ARRAY",
            items: { type: "STRING" }
        },
        upcomingTasks: {
            type: "ARRAY",
            items: { type: "STRING" }
        },
        deadlineAnalysis: {
            type: "OBJECT",
            properties: {
                mostUrgentTask: { type: "STRING" },
                daysRemaining: { type: "INTEGER" }
            },
            required: ["mostUrgentTask", "daysRemaining"]
        },
        recommendedFocus: { type: "STRING" },
        estimatedHoursNeeded: { type: "INTEGER" },
        strictlyDoToday: {
            type: "ARRAY",
            items: { type: "STRING" }
        },
        postponeTomorrow: {
            type: "ARRAY",
            items: { type: "STRING" }
        },
        dropCancel: {
            type: "ARRAY",
            items: { type: "STRING" }
        }
    },
    required: [
        "confidenceScore",
        "riskLevel",
        "riskReason",
        "agentMessage",
        "todayPlan",
        "upcomingTasks",
        "deadlineAnalysis",
        "recommendedFocus",
        "estimatedHoursNeeded",
        "strictlyDoToday",
        "postponeTomorrow",
        "dropCancel"
    ]
};

// --- Save My Day contract (generateSaveMyDay) ---
export const SAVE_MY_DAY_SCHEMA = {
    type: "OBJECT",
    properties: {
        strictlyDoToday: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    task: { type: "STRING" },
                    hours: { type: "NUMBER" },
                    reason: { type: "STRING" }
                },
                required: ["task", "hours", "reason"]
            }
        },
        postponeTomorrow: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    task: { type: "STRING" },
                    reason: { type: "STRING" }
                },
                required: ["task", "reason"]
            }
        },
        dropCancel: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    task: { type: "STRING" },
                    reason: { type: "STRING" }
                },
                required: ["task", "reason"]
            }
        },
        confidenceMessage: { type: "STRING" }
    },
    required: ["strictlyDoToday", "postponeTomorrow", "dropCancel", "confidenceMessage"]
};

// --- Recalculate analysis contract (recalculateAnalysis) ---
export const ANALYSIS_SCHEMA = {
    type: "OBJECT",
    properties: {
        confidenceScore: { type: "INTEGER" },
        riskLevel: { type: "STRING" },
        riskReason: { type: "STRING" },
        agentMessage: { type: "STRING" }
    },
    required: ["confidenceScore", "riskLevel", "riskReason", "agentMessage"]
};

// --- System prompts shared across providers ---
export const PLAN_SYSTEM_INSTRUCTION = `You are FlowMind, an autonomous AI Execution Coach.
You replace passive reminders with hard execution coaching.

Rules:
1. confidenceScore: 0-100. Be realistic. Penalize tight deadlines and high workload.
2. riskLevel: exactly one of "Low", "Moderate", "High"
3. agentMessage: speak directly like a coach. Be specific, not generic.
4. todayPlan: exactly what to do TODAY, in order.
5. upcomingTasks: next important tasks after today.
6. deadlineAnalysis: identify the single most urgent task.
7. strictlyDoToday: tasks that MUST happen today or deadlines will be missed.
8. postponeTomorrow: tasks safe to delay without consequences.
9. dropCancel: low-value distractions to ignore today.
10. Never leave arrays empty when inference is possible.
11. Always mention actual task names from user input.`;

export const SAVE_MY_DAY_SYSTEM_INSTRUCTION = `You are FlowMind's execution strategist.
The user only has a limited number of hours today.
Analyze every task in their current plan.
Be ruthless. Prioritize only the highest-impact work.
Never exceed the user's available hours for today's workload.
Return tasks that MUST be completed today, tasks that should move to tomorrow, and tasks that should be dropped entirely.`;

export const RECALCULATE_SYSTEM_INSTRUCTION = `You are FlowMind's AI Progress Analyst.
Analyze:
- completed tasks
- remaining tasks
- current execution plan

Do NOT regenerate today's plan.
Do NOT generate new tasks.
Only recalculate:
- confidenceScore
- riskLevel
- riskReason
- agentMessage

The confidence score should increase when important tasks are completed and decrease when high-priority work remains unfinished.`;

// --- Weekly AI summary contract (generateWeeklySummary) ---
export const WEEKLY_SUMMARY_SCHEMA = {
    type: "OBJECT",
    properties: {
        headline: { type: "STRING" },
        accomplishment: { type: "STRING" },
        challenge: { type: "STRING" },
        recommendation: { type: "STRING" },
        confidence: { type: "STRING" }
    },
    required: ["headline", "accomplishment", "challenge", "recommendation", "confidence"]
};

export const WEEKLY_SUMMARY_SYSTEM_INSTRUCTION = `You are FlowMind's Executive AI Coach.
Given the user's weekly execution data, produce a concise strategic summary.

Rules:
1. headline: 6-10 words, executive tone.
2. accomplishment: one sentence, what went well this week.
3. challenge: one sentence, the primary risk or bottleneck.
4. recommendation: one actionable sentence for next week.
5. confidence: exactly one of "High", "Medium", "Low" — how confident you are in the recommendation.
6. Be specific to the numbers provided. No generic advice.`;