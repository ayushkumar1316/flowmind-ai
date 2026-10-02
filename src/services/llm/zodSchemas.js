/**
 * Zod validation schemas for LLM provider output.
 *
 * Every AI response is validated against these schemas before reaching the
 * UI, so the frontend can rely on predictable field names and types.
 * Mirrors the JSON contracts in sharedSchema.js.
 *
 * @module services/llm/zodSchemas
 */

import { z } from "zod";

// Plan generation contract (generatePlan)
export const PlanSchema = z.object({
  confidenceScore: z.number().int().min(0).max(100),
  riskLevel: z.enum(["Low", "Moderate", "High"]),
  riskReason: z.string(),
  agentMessage: z.string(),
  todayPlan: z.array(z.string()),
  upcomingTasks: z.array(z.string()),
  deadlineAnalysis: z.object({
    mostUrgentTask: z.string(),
    daysRemaining: z.number().int().min(0),
  }),
  recommendedFocus: z.string(),
  estimatedHoursNeeded: z.number().int().min(0),
  strictlyDoToday: z.array(z.string()),
  postponeTomorrow: z.array(z.string()),
  dropCancel: z.array(z.string()),
});

// Save My Day contract (generateSaveMyDay)
export const SaveMyDaySchema = z.object({
  strictlyDoToday: z.array(
    z.object({
      task: z.string(),
      hours: z.number().min(0),
      reason: z.string(),
    })
  ),
  postponeTomorrow: z.array(
    z.object({
      task: z.string(),
      reason: z.string(),
    })
  ),
  dropCancel: z.array(
    z.object({
      task: z.string(),
      reason: z.string(),
    })
  ),
  confidenceMessage: z.string(),
});

// Recalculate analysis contract (recalculateAnalysis)
export const AnalysisSchema = z.object({
  confidenceScore: z.number().int().min(0).max(100),
  riskLevel: z.enum(["Low", "Moderate", "High"]),
  riskReason: z.string(),
  agentMessage: z.string(),
});

// Weekly AI summary contract (generateWeeklySummary)
export const WeeklySummarySchema = z.object({
  headline: z.string(),
  accomplishment: z.string(),
  challenge: z.string(),
  recommendation: z.string(),
  confidence: z.enum(["High", "Medium", "Low"]),
});

// --- Validation helpers ---
export const safeParsePlan = (data) => {
  try {
    return { data: PlanSchema.parse(data), error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error("Invalid plan data") };
  }
};

export const safeParseSaveMyDay = (data) => {
  try {
    return { data: SaveMyDaySchema.parse(data), error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error("Invalid Save My Day data") };
  }
};

export const safeParseAnalysis = (data) => {
  try {
    return { data: AnalysisSchema.parse(data), error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error("Invalid analysis data") };
  }
};

export const safeParseWeeklySummary = (data) => {
  try {
    return { data: WeeklySummarySchema.parse(data), error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error("Invalid weekly summary data") };
  }
};