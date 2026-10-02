/**
 * Quick eval smoke test — runs first 10 golden cases against real providers.
 * No rate limiting protection, just a quick sanity check.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually
import { readFileSync } from "node:fs";
try {
    // Project root is two levels up from tests/evaluation/
    const rootDir = join(__dirname, "../../");
    const envContent = readFileSync(join(rootDir, ".env"), "utf-8");
    envContent.split("\n").forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return;
        const eq = trimmed.indexOf("=");
        if (eq === -1) return;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (!process.env[key]) process.env[key] = val;
    });
} catch { /* no .env */ }

// Normalize: VITE_ prefix vs bare
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "";
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || "";

const gf = JSON.parse(await readFile(join(__dirname, "golden-datasets", "task-planning.json"), "utf-8"));
const cases = gf.slice(0, 10);

console.log(`Running ${cases.length} cases against real providers\n`);

// Dynamic import after env is ready
const mod = await import("../../src/services/llm/factory.js");
const { generatePlan } = mod;

let pass = 0, fail = 0;

for (const tc of cases) {
    const start = performance.now();
    const result = await generatePlan(tc.input);
    const ms = Math.round(performance.now() - start);
    const errs = validate(result, tc.assertions);
    const ok = errs.length === 0;
    if (ok) pass++; else fail++;
    console.log(`  ${ok ? "PASS" : "FAIL"} ${tc.id} | provider=${result.provider} fallback=${result.usedFallback} | ${ms}ms${!ok ? ` -> ${errs.join("; ")}` : ""}`);
    // Be nice to rate limits
    await new Promise((r) => setTimeout(r, 800));
}

console.log(`\nResult: ${pass}/${cases.length} passed (${Math.round(pass / cases.length * 100)}%)\n`);

function validate(result, assertions) {
    const errors = [];
    if (assertions.mustHave) {
        for (const f of assertions.mustHave) {
            if (result[f] === undefined || result[f] === null) errors.push(`Missing ${f}`);
        }
    }
    if (Array.isArray(result.todayPlan) && assertions.todayPlanMinLength && result.todayPlan.length < assertions.todayPlanMinLength) {
        errors.push(`todayPlan too short`);
    }
    if (typeof result.confidenceScore === "number" && assertions.confidenceScoreRange) {
        const [min, max] = assertions.confidenceScoreRange;
        if (result.confidenceScore < min || result.confidenceScore > max) errors.push(`score out of range`);
    }
    if (assertions.riskLevelValid && !assertions.riskLevelValid.includes(result.riskLevel)) {
        errors.push(`riskLevel ${result.riskLevel} invalid`);
    }
    return errors;
}