/**
 * Regression Suite
 *
 * Runs the golden dataset against the current build and fails if
 * quality drops below a threshold. Used in CI/CD.
 *
 * This is a Node script (runs in GitHub Actions, not the browser).
 * Requires: VITE_GEMINI_API_KEY or VITE_GROQ_API_KEY in environment.
 *
 * Usage: node tests/evaluation/regression-suite.mjs
 *
 * @module tests/evaluation/regression-suite
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Thresholds — CI fails if pass rate drops below this
const MIN_PASS_RATE = 85;
const MIN_SCHEMA_VALIDITY = 95;
const MAX_P95_LATENCY_MS = 10000;

// --- Inline provider config (Node env, not Vite) ---
process.env.VITE_GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "";
process.env.VITE_GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || "";

console.log("=== FLOWMIND REGRESSION SUITE ===\n");

// Load datasets
let planningCases = [];
let edgeCases = [];
try {
    planningCases = JSON.parse(
        await readFile(join(__dirname, "golden-datasets", "task-planning.json"), "utf-8")
    );
    edgeCases = JSON.parse(
        await readFile(join(__dirname, "golden-datasets", "edge-cases.json"), "utf-8")
    );
} catch (e) {
    console.error("Failed to load golden datasets:", e.message);
    process.exit(1);
}

console.log(`Loaded ${planningCases.length} planning cases + ${edgeCases.length} edge cases\n`);

// Dynamic import factory (after env is set)
const { generatePlan } = await import("../../src/services/llm/factory.js");

// Run evaluation
const allCases = [...planningCases, ...edgeCases];
let passed = 0;
let failed = 0;
const failures = [];
const latencies = [];

for (const tc of allCases) {
    try {
        const start = performance.now();
        const result = await generatePlan(tc.input);
        const latency = Math.round(performance.now() - start);
        latencies.push(latency);

        const errors = validate(result, tc.assertions);
        if (errors.length === 0) {
            passed++;
            process.stdout.write(".");
        } else {
            failed++;
            failures.push({ id: tc.id, errors, provider: result.provider });
            process.stdout.write("x");
        }
    } catch (e) {
        failed++;
        failures.push({ id: tc.id, errors: [String(e)], provider: "Exception" });
        process.stdout.write("X");
    }
}


console.log("\n");

// Aggregate stats
const passRate = allCases.length > 0 ? Math.round((passed / allCases.length) * 100) : 0;
const sorted = [...latencies].sort((a, b) => a - b);
const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
const avg = latencies.length > 0 ? Math.round(latencies.reduce((s, l) => s + l, 0) / latencies.length) : 0;

console.log("=== RESULTS ===");
console.log(`Pass Rate:  ${passRate}% (${passed}/${allCases.length})`);
console.log(`Avg Latency: ${avg}ms`);
console.log(`P50 Latency: ${p50}ms`);
console.log(`P95 Latency: ${p95}ms`);

if (failures.length > 0) {
    console.log(`\n=== FAILURES (${failures.length}) ===`);
    failures.slice(0, 10).forEach((f) => {
        console.log(`  [${f.id}] provider=${f.provider}: ${f.errors.join("; ")}`);
    });
    if (failures.length > 10) {
        console.log(`  ... and ${failures.length - 10} more`);
    }
}

// CI threshold checks
let ciFail = false;
console.log("\n=== CI THRESHOLD CHECKS ===");

if (passRate < MIN_PASS_RATE) {
    console.log(`FAIL: pass rate ${passRate}% < ${MIN_PASS_RATE}%`);
    ciFail = true;
} else {
    console.log(`PASS: pass rate ${passRate}% >= ${MIN_PASS_RATE}%`);
}

if (p95 > MAX_P95_LATENCY_MS) {
    console.log(`FAIL: p95 latency ${p95}ms > ${MAX_P95_LATENCY_MS}ms`);
    ciFail = true;
} else {
    console.log(`PASS: p95 latency ${p95}ms <= ${MAX_P95_LATENCY_MS}ms`);
}

console.log(ciFail ? "\n=== CI RESULT: FAIL ===\n" : "\n=== CI RESULT: PASS ===\n");
process.exit(ciFail ? 1 : 0);

/**
 * Validate a result against test case assertions.
 * (Inlined here so the Node script has no build dependency.)
 */
function validate(result, assertions) {
    const errors = [];

    if (!result || typeof result !== "object") {
        return ["Result is not an object"];
    }

    if (assertions.mustHave) {
        for (const field of assertions.mustHave) {
            if (result[field] === undefined || result[field] === null) {
                errors.push(`Missing: ${field}`);
            }
        }
    }

    if (assertions.confidenceScoreRange && typeof result.confidenceScore === "number") {
        const [min, max] = assertions.confidenceScoreRange;
        if (result.confidenceScore < min || result.confidenceScore > max) {
            errors.push(`score ${result.confidenceScore} out of range`);
        }
    }

    if (assertions.riskLevelValid && !assertions.riskLevelValid.includes(result.riskLevel)) {
        errors.push(`riskLevel "${result.riskLevel}" invalid`);
    }

    if (assertions.todayPlanMinLength && Array.isArray(result.todayPlan)) {
        if (result.todayPlan.length < assertions.todayPlanMinLength) {
            errors.push(`todayPlan too short (${result.todayPlan.length})`);
        }
    }

    if (assertions.todayPlanMaxLength && Array.isArray(result.todayPlan)) {
        if (result.todayPlan.length > assertions.todayPlanMaxLength) {
            errors.push(`todayPlan too long (${result.todayPlan.length})`);
        }
    }

    if (assertions.agentMessageMinLength && typeof result.agentMessage === "string") {
        if (result.agentMessage.length < assertions.agentMessageMinLength) {
            errors.push(`agentMessage too short`);
        }
    }

    if (assertions.deadlineAnalysisHasTaskName && result.deadlineAnalysis) {
        if (!result.deadlineAnalysis.mostUrgentTask?.trim()) {
            errors.push("deadlineAnalysis.mostUrgentTask empty");
        }
    }

    if (assertions.deadlineDaysRange && result.deadlineAnalysis) {
        const [min, max] = assertions.deadlineDaysRange;
        const d = result.deadlineAnalysis.daysRemaining;
        if (d < min || d > max) {
            errors.push(`daysRemaining ${d} out of range`);
        }
    }

    return errors;
}