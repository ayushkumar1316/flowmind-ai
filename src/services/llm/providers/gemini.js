/**
 * Gemini Provider (refactored from src/services/gemini.js)
 *
 * DESIGN NOTE — why this provider THROWS instead of returning a fallback:
 * Failover only works if the factory can observe a failure. If this provider
 * swallowed every error and returned fallback data, `withFailover()` would
 * never see an error and Groq would never be called. So: providers throw,
 * and the factory owns fallback + provider selection.
 *
 * @module services/llm/providers/gemini
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import {
    PLAN_SCHEMA,
    SAVE_MY_DAY_SCHEMA,
    ANALYSIS_SCHEMA,
    PLAN_SYSTEM_INSTRUCTION,
    SAVE_MY_DAY_SYSTEM_INSTRUCTION,
    RECALCULATE_SYSTEM_INSTRUCTION
} from "../sharedSchema.js";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

/**
 * Extract a useful status code from a Gemini SDK error so the factory can
 * decide whether the failure is retryable (quota/429/5xx) or fatal.
 */
const extractStatus = (error) => {
    const candidates = [
        error?.status,
        error?.code,
        error?.error?.code,
        error?.response?.status,
        error?.error?.status,
    ];
    for (const c of candidates) {
        if (typeof c === "number") return c;
    }
    const msg = String(error?.message || "");
    const match = msg.match(/\b(4\d\d|5\d\d)\b/);
    return match ? Number(match[1]) : null;
};

export class ProviderError extends Error {
    constructor(message, { provider, status = null, retryable = false, cause = null } = {}) {
        super(message);
        this.name = "ProviderError";
        this.provider = provider;
        this.status = status;
        this.retryable = retryable;
        this.cause = cause;
    }
}

export class GeminiProvider {
    constructor() {
        this.name = "Gemini";
        this.model = "gemini-2.5-flash";
        this.genAI = null;
    }

    isConfigured() {
        return Boolean(GEMINI_API_KEY);
    }

    _getModel(systemInstruction, generationConfig) {
        if (!GEMINI_API_KEY) {
            throw new ProviderError("VITE_GEMINI_API_KEY is not configured.", {
                provider: this.name,
                retryable: false,
            });
        }
        if (!this.genAI) this.genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        return this.genAI.getGenerativeModel({
            model: this.model,
            generationConfig: {
                responseMimeType: "application/json",
                ...generationConfig,
            },
            systemInstruction,
        });
    }

    async _run(systemInstruction, userMessage, responseSchema, generationConfig) {
        const model = this._getModel(systemInstruction, {
            responseSchema,
            temperature: 0.2,
            ...generationConfig,
        });

        let rawText;
        try {
            const result = await model.generateContent(userMessage);
            rawText = result.response.text();
        } catch (error) {
            const status = extractStatus(error);
            const retryable =
                status === 429 ||
                status === 500 ||
                status === 502 ||
                status === 503 ||
                status === 504 ||
                /quota|rate limit|overloaded|unavailable|timeout|deadline/i.test(String(error?.message || ""));
            throw new ProviderError(`Gemini request failed: ${error?.message || error}`, {
                provider: this.name,
                status,
                retryable,
                cause: error,
            });
        }

        if (!rawText) {
            throw new ProviderError("Gemini returned an empty response.", {
                provider: this.name,
                retryable: true,
            });
        }

        try {
            return JSON.parse(rawText);
        } catch (error) {
            // Malformed JSON is a contract violation, not a provider outage —
            // non-retryable, because a different provider would likely behave
            // the same way for the same malformed instruction.
            throw new ProviderError("Gemini returned malformed JSON.", {
                provider: this.name,
                retryable: false,
                cause: error,
            });
        }
    }

    async generatePlan(promptUserContext) {
        return this._run(
            PLAN_SYSTEM_INSTRUCTION,
            `Generate my execution plan based on this: ${promptUserContext}`,
            PLAN_SCHEMA,
            { temperature: 0.2 }
        );
    }

    async generateSaveMyDay(availableHours, currentPlan) {
        return this._run(
            SAVE_MY_DAY_SYSTEM_INSTRUCTION,
            `I only have ${availableHours} hours available today. Re-evaluate this plan: ${JSON.stringify(currentPlan)}`,
            SAVE_MY_DAY_SCHEMA,
            { temperature: 0.1 }
        );
    }

    async recalculateAnalysis(completedTasks, remainingTasks, currentPlan) {
        return this._run(
            RECALCULATE_SYSTEM_INSTRUCTION,
            `Completed Tasks: ${JSON.stringify(completedTasks)}\nRemaining Tasks: ${JSON.stringify(remainingTasks)}\nCurrent Plan: ${JSON.stringify(currentPlan)}`,
            ANALYSIS_SCHEMA,
            { temperature: 0.2 }
        );
    }
}

export const geminiProvider = new GeminiProvider();
