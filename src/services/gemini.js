/**
 * DEPRECATED — This file is a backwards-compatibility shim.
 *
 * All LLM logic now lives in:
 *   src/services/llm/providers/gemini.js  (Gemini SDK provider)
 *   src/services/llm/providers/groq.js    (Groq HTTP provider)
 *   src/services/llm/factory.js           (Failover logic + public API)
 *   src/services/llm/sharedSchema.js      (Canonical JSON contracts)
 *
 * Do NOT add new features here. Import from ./llm/factory.js directly.
 */

export { generatePlan, generateSaveMyDay, recalculateAnalysis } from "./llm/factory.js";
