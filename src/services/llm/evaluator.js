/**
 * FlowMind LLM Evaluator
 *
 * Runs the golden dataset through the actual provider factory,
 * validates outputs, records metrics, and produces a report.
 *
 * Usage (browser console):
 *   import { runEvaluation } from '../services/llm/evaluator.js';
 *   await runEvaluation();
 *
 * @module services/llm/evaluator
 */

import { generatePlan, onProviderEvent } from "./factory.js";
import { recordRequest, loadMetrics, clearMetrics } from "./metricsTracker.js";

let abortFlag = false;
let eventUnsubscribe = null;

/**
 * Run the full evaluation suite.
 * @param {Object} options
 * @param {number} options.maxConcurrency - max parallel requests (default: 1 for rate limiting)
 * @param {string} options.dataset - 'task-planning' | 'edge-cases' (default: task-planning)
 * @param {Function} options.onProgress - callback(progress: { current, total, passRate })
 */
export async function runEvaluation(options = {}) {
    const { maxConcurrency = 1, dataset = "task-planning", onProgress } = options;

    abortFlag = false;

    // Clear previous run
    clearMetrics();

    // Subscribe to provider events for real-time metrics
    eventUnsubscribe = onProviderEvent((event) => {
        if (event.type === "request_complete") {
            recordRequest({
                method: event.method,
                provider: event.provider,
                latencyMs: event.latencyMs,
                attempts: event.attempts?.length ?? 0,
                usedFallback: event.usedFallback,
                outcome: event.usedFallback ? "fallback" : "success",
                schemaValid: !event.usedFallback // if fallback used, schema was validated by factory
            });
        }
    });

    let cases;
    try {
        const res = await fetch(`/tests/evaluation/golden-datasets/${dataset}.json`);
        cases = await res.json();
    } catch (e) {
        console.error("Failed to load golden dataset:", e);
        eventUnsubscribe();
        return { error: "Dataset load failed" };
    }

    console.log(`[Evaluator] Starting evaluation: ${dataset} (${cases.length} cases)`);

    let passed = 0;
    let failed = 0;
    const results = [];

    // Process with controlled concurrency
    for (let i = 0; i < cases.length; i += maxConcurrency) {
        if (abortFlag) {
            console.log("[Evaluator] Aborted by user");
            break;
        }

        const batch = cases.slice(i, i + maxConcurrency);
        const batchPromises = batch.map(async (tc) => {
            if (abortFlag) return { id: tc.id, skipped: true };

            const startTime = performance.now();
            try {
                const result = await generatePlan(tc.input);
                const latencyMs = Math.round(performance.now() - startTime);

                // Validate against assertions
                const validation = validateResult(result, tc.assertions);
                if (validation.pass) {
                    passed++;
                    return { id: tc.id, pass: true, latencyMs, result };
                } else {
                    failed++;
                    return { id: tc.id, pass: false, latencyMs, result, errors: validation.errors };
                }
            } catch (e) {
                failed++;
                return { id: tc.id, pass: false, error: String(e), latencyMs: Math.round(performance.now() - startTime) };
            }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Progress callback
        if (onProgress) {
            onProgress({
                current: Math.min(i + maxConcurrency, cases.length),
                total: cases.length,
                passRate: cases.length > 0 ? Math.round((passed / (passed + failed)) * 100) : 0
            });
        }

        // Small delay between batches to avoid rate limiting
        if (i + maxConcurrency < cases.length) {
            await new Promise((r) => setTimeout(r, 500));
        }
    }

    eventUnsubscribe();

    const aggregated = loadMetrics().aggregated;
    const report = {
        dataset,
        timestamp: new Date().toISOString(),
        total: cases.length,
        passed,
        failed,
        passRate: cases.length > 0 ? Math.round((passed / cases.length) * 100) : 0,
        aggregated,
        results
    };

    console.log(`[Evaluator] Complete: ${passed}/${cases.length} passed (${report.passRate}%)`);
    console.log("[Evaluator] Aggregated metrics:", aggregated);

    return report;
}

/**
 * Validate a single provider response against test case assertions.
 */
function validateResult(result, assertions) {
    const errors = [];

    // Must-have fields
    if (assertions.mustHave) {
        for (const field of assertions.mustHave) {
            if (!(field in result) || result[field] === undefined || result[field] === null) {
                errors.push(`Missing field: ${field}`);
            }
        }
    }

    // Confidence score range
    if (assertions.confidenceScoreRange && typeof result.confidenceScore === "number") {
        const [min, max] = assertions.confidenceScoreRange;
        if (result.confidenceScore < min || result.confidenceScore > max) {
            errors.push(`confidenceScore ${result.confidenceScore} not in [${min}, ${max}]`);
        }
    }

    // Risk level valid
    if (assertions.riskLevelValid) {
        if (!assertions.riskLevelValid.includes(result.riskLevel)) {
            errors.push(`riskLevel "${result.riskLevel}" not in ${JSON.stringify(assertions.riskLevelValid)}`);
        }
    }

    // todayPlan min/max length
    if (assertions.todayPlanMinLength && Array.isArray(result.todayPlan)) {
        if (result.todayPlan.length < assertions.todayPlanMinLength) {
            errors.push(`todayPlan length ${result.todayPlan.length} < ${assertions.todayPlanMinLength}`);
        }
    }
    if (assertions.todayPlanMaxLength && Array.isArray(result.todayPlan)) {
        if (result.todayPlan.length > assertions.todayPlanMaxLength) {
            errors.push(`todayPlan length ${result.todayPlan.length} > ${assertions.todayPlanMaxLength}`);
        }
    }

    // agentMessage min length
    if (assertions.agentMessageMinLength && typeof result.agentMessage === "string") {
        if (result.agentMessage.length < assertions.agentMessageMinLength) {
            errors.push(`agentMessage too short (${result.agentMessage.length} < ${assertions.agentMessageMinLength})`);
        }
    }

    // deadlineAnalysis has task name
    if (assertions.deadlineAnalysisHasTaskName && result.deadlineAnalysis) {
        if (!result.deadlineAnalysis.mostUrgentTask || result.deadlineAnalysis.mostUrgentTask.trim().length === 0) {
            errors.push("deadlineAnalysis.mostUrgentTask is empty");
        }
    }

    // deadline days range
    if (assertions.deadlineDaysRange && result.deadlineAnalysis) {
        const [min, max] = assertions.deadlineDaysRange;
        const days = result.deadlineAnalysis.daysRemaining;
        if (days < min || days > max) {
            errors.push(`deadline daysRemaining ${days} not in [${min}, ${max}]`);
        }
    }

    return { pass: errors.length === 0, errors };
}

/**
 * Abort a running evaluation.
 */
export function abortEvaluation() {
    abortFlag = true;
}

/**
 * Quick single-case test (useful for debugging).
 */
export async function quickTest(input) {
    const result = await generatePlan(input);
    console.log("Result:", result);
    return result;
}