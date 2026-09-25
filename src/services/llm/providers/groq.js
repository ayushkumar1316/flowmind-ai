/**
 * Groq Provider — Failover for when Gemini quota is exhausted / 429.
 *
 * DESIGN: Same as Gemini provider — THROWS on error so factory can observe
 * and decide whether to retry. Does NOT silently fallback.
 *
 * Groq supports structured JSON via `response_format` with a JSON schema.
 * We use the same field names as Gemini (sharedSchema.js) so the frontend
 * never knows which provider answered.
 *
 * @module services/llm/providers/groq
 */

import {
    PLAN_SCHEMA,
    SAVE_MY_DAY_SCHEMA,
    ANALYSIS_SCHEMA,
    PLAN_SYSTEM_INSTRUCTION,
    SAVE_MY_DAY_SYSTEM_INSTRUCTION,
    RECALCULATE_SYSTEM_INSTRUCTION
} from "../sharedSchema.js";
import { ProviderError } from "./gemini.js";

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;

/**
 * Convert our canonical schema object to a plain JSON schema object
 * that Groq's OpenAI-compatible API accepts as `response_format.json_schema.schema`.
 * (Drops Gemini-specific wrapper; keeps fields, required, and nested objects.)
 */
function toPlainJsonSchema(schemaObj) {
    if (!schemaObj || typeof schemaObj !== "object") return schemaObj;
    const out = {};
    for (const [k, v] of Object.entries(schemaObj)) {
        if (k === "type" && typeof v === "string") {
            const map = { OBJECT: "object", STRING: "string", INTEGER: "integer", NUMBER: "number", ARRAY: "array" };
            out.type = map[v] || v;
        } else if (k === "properties" && typeof v === "object") {
            const props = {};
            for (const [pk, pv] of Object.entries(v)) {
                props[pk] = toPlainJsonSchema(pv);
            }
            out.properties = props;
        } else if (k === "items" && typeof v === "object") {
            out.items = toPlainJsonSchema(v);
        } else {
            out[k] = v;
        }
    }
    return out;
}

/**
 * Build the `response_format` object that Groq (OpenAI-compatible) expects.
 */
function buildResponseFormat(name, schemaObj) {
    const plain = toPlainJsonSchema(schemaObj);
    return {
        type: "json_schema",
        json_schema: {
            name,
            strict: true,
            schema: plain
        }
    };
}

export class GroqProvider {
    constructor() {
        this.name = "Groq";
        this.model = "llama-3.3-70b-versatile";
    }

    isConfigured() {
        return Boolean(GROQ_API_KEY);
    }

    /**
     * Generic Groq chat completion call.
     */
    async _chatCompletion(systemInstruction, userMessage, responseFormat) {
        if (!GROQ_API_KEY) {
            throw new ProviderError("VITE_GROQ_API_KEY is not configured.", {
                provider: this.name,
                retryable: false,
            });
        }

        let rawText;
        try {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${GROQ_API_KEY}`
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        { role: "system", content: systemInstruction },
                        { role: "user", content: userMessage }
                    ],
                    response_format: responseFormat,
                    temperature: 0.2,
                    max_tokens: 2048
                })
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => "");
                const status = response.status;
                const retryable = status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
                throw new ProviderError(`Groq API ${status}: ${errorText}`, {
                    provider: this.name,
                    status,
                    retryable,
                });
            }

            const data = await response.json();
            rawText = data?.choices?.[0]?.message?.content;

        } catch (error) {
            if (error instanceof ProviderError) throw error;
            const retryable = /timeout|overloaded|rate.?limit|quota|network|fetch/i.test(String(error?.message || ""));
            throw new ProviderError(`Groq request failed: ${error?.message || error}`, {
                provider: this.name,
                status: null,
                retryable,
                cause: error,
            });
        }

        if (!rawText) {
            throw new ProviderError("Groq returned an empty response.", {
                provider: this.name,
                retryable: true,
            });
        }

        try {
            return JSON.parse(rawText);
        } catch (error) {
            throw new ProviderError("Groq returned malformed JSON.", {
                provider: this.name,
                retryable: false,
                cause: error,
            });
        }
    }

    async generatePlan(promptUserContext) {
        return this._chatCompletion(
            PLAN_SYSTEM_INSTRUCTION,
            `Generate my execution plan based on this: ${promptUserContext}`,
            buildResponseFormat("FlowMindPlan", PLAN_SCHEMA)
        );
    }

    async generateSaveMyDay(availableHours, currentPlan) {
        return this._chatCompletion(
            SAVE_MY_DAY_SYSTEM_INSTRUCTION,
            `I only have ${availableHours} hours available today. Re-evaluate this plan: ${JSON.stringify(currentPlan)}`,
            buildResponseFormat("FlowMindSaveMyDay", SAVE_MY_DAY_SCHEMA)
        );
    }

    async recalculateAnalysis(completedTasks, remainingTasks, currentPlan) {
        return this._chatCompletion(
            RECALCULATE_SYSTEM_INSTRUCTION,
            `Completed Tasks: ${JSON.stringify(completedTasks)}\nRemaining Tasks: ${JSON.stringify(remainingTasks)}\nCurrent Plan: ${JSON.stringify(currentPlan)}`,
            buildResponseFormat("FlowMindAnalysis", ANALYSIS_SCHEMA)
        );
    }
}

export const groqProvider = new GroqProvider();
