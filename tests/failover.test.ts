import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validatePlan, validateSaveMyDay, validateAnalysis, setProviderChain, restoreProviderChain, runWithFailover } from '../src/services/llm/factory.js';
import { ProviderError } from '../src/services/llm/providers/gemini.js';

const VALID_PLAN = {
    confidenceScore: 82,
    riskLevel: 'Low',
    riskReason: 'Deadlines are comfortable.',
    agentMessage: 'Ship the DSA sheet before lunch.',
    todayPlan: ['DSA arrays set 3', 'Revise logical reasoning'],
    upcomingTasks: ['Mock OA timed test'],
    deadlineAnalysis: { mostUrgentTask: 'DSA arrays set 3', daysRemaining: 3 },
    recommendedFocus: 'DSA arrays set 3',
    estimatedHoursNeeded: 4,
    strictlyDoToday: ['DSA arrays set 3'],
    postponeTomorrow: ['Mock OA timed test'],
    dropCancel: ['Generic motivation reading']
};

const makeProvider = (name, behavior) => ({
    name,
    model: 'stub',
    isConfigured: () => behavior.configured !== false,
    ...behavior.methods
});

describe('LLM Provider Failover', () => {
    afterEach(() => {
        restoreProviderChain();
    });

    it('primary provider succeeds -> no failover', async () => {
        let groqCalled = false;
        setProviderChain([
            makeProvider('Gemini', { methods: { generatePlan: async () => VALID_PLAN } }),
            makeProvider('Groq', { methods: { generatePlan: async () => { groqCalled = true; return VALID_PLAN; } } })
        ]);
        const result = await runWithFailover('generatePlan', { buildFallback: () => VALID_PLAN }, 'test input');
        expect(result.provider).toBe('Gemini');
        expect(groqCalled).toBe(false);
        expect(result.usedFallback).toBe(false);
        expect(result.attempts.length).toBe(1);
        expect(result.todayPlan.length).toBe(2);
    });

    it('primary throws 429 (quota) -> failover to secondary', async () => {
        let groqCalled = false;
        setProviderChain([
            makeProvider('Gemini', {
                methods: {
                    generatePlan: async () => {
                        throw new ProviderError('Gemini request failed: 429 RESOURCE_EXHAUSTED', {
                            provider: 'Gemini', status: 429, retryable: true
                        });
                    }
                }
            }),
            makeProvider('Groq', { methods: { generatePlan: async () => { groqCalled = true; return VALID_PLAN; } } })
        ]);
        const result = await runWithFailover('generatePlan', { buildFallback: () => VALID_PLAN }, 'test input');
        expect(groqCalled).toBe(true);
        expect(result.provider).toBe('Groq');
        expect(result.usedFallback).toBe(false);
        expect(result.attempts.length).toBe(2);
        expect(result.attempts[0].outcome).toBe('error');
        expect(result.attempts[0].status).toBe(429);
        expect(result.attempts[1].outcome).toBe('success');
    });

    it('both providers fail -> deterministic fallback, no throw', async () => {
        setProviderChain([
            makeProvider('Gemini', {
                methods: {
                    generatePlan: async () => {
                        throw new ProviderError('429', { provider: 'Gemini', status: 429, retryable: true });
                    }
                }
            }),
            makeProvider('Groq', {
                methods: {
                    generatePlan: async () => {
                        throw new ProviderError('503', { provider: 'Groq', status: 503, retryable: true });
                    }
                }
            })
        ]);
        const result = await runWithFailover('generatePlan', { buildFallback: () => VALID_PLAN }, 'test input');
        expect(result.provider).toBe('Fallback');
        expect(result.usedFallback).toBe(true);
        expect(Array.isArray(result.todayPlan)).toBe(true);
        expect(result.attempts.every(a => a.outcome === 'error')).toBe(true);
    });

    it('unconfigured provider is skipped, not called', async () => {
        let geminiCalled = false;
        setProviderChain([
            makeProvider('Gemini', {
                configured: false,
                methods: { generatePlan: async () => { geminiCalled = true; return VALID_PLAN; } }
            }),
            makeProvider('Groq', { methods: { generatePlan: async () => VALID_PLAN } })
        ]);
        const result = await runWithFailover('generatePlan', { buildFallback: () => VALID_PLAN }, 'test input');
        expect(geminiCalled).toBe(false);
        expect(result.provider).toBe('Groq');
        expect(result.attempts[0].outcome).toBe('skipped_not_configured');
    });

    it('schema violation does NOT silently failover to fallback', async () => {
        let groqCalled = false;
        setProviderChain([
            makeProvider('Gemini', { methods: { generatePlan: async () => ({ todayPlan: [] }) } }),
            makeProvider('Groq', { methods: { generatePlan: async () => { groqCalled = true; return VALID_PLAN; } } })
        ]);
        const result = await runWithFailover('generatePlan', { buildFallback: () => VALID_PLAN }, 'test input');
        expect(groqCalled).toBe(false);
        expect(result.usedFallback).toBe(true);
        expect(result.attempts[0].outcome).toBe('schema_invalid');
    });

    it('non-retryable error stops the chain immediately', async () => {
        let groqCalled = false;
        setProviderChain([
            makeProvider('Gemini', {
                methods: {
                    generatePlan: async () => {
                        throw new ProviderError('API key not valid', { provider: 'Gemini', status: 400, retryable: false });
                    }
                }
            }),
            makeProvider('Groq', { methods: { generatePlan: async () => { groqCalled = true; return VALID_PLAN; } } })
        ]);
        const result = await runWithFailover('generatePlan', { buildFallback: () => VALID_PLAN }, 'test input');
        expect(groqCalled).toBe(false);
        expect(result.attempts.length).toBe(1);
        expect(result.attempts[0].retryable).toBe(false);
    });

    it('validation repairs partial payloads instead of failing', () => {
        const messy = {
            ...VALID_PLAN,
            confidenceScore: 9999,
            estimatedHoursNeeded: 'not a number',
            todayPlan: ['a', '', 'b'],
            deadlineAnalysis: { mostUrgentTask: '', daysRemaining: 'x' }
        };
        const { ok, value, errors } = validatePlan(messy);
        expect(value.confidenceScore).toBe(100);
        expect(typeof value.estimatedHoursNeeded).toBe('number');
        expect(value.todayPlan.length).toBe(2);
        expect(value.deadlineAnalysis.mostUrgentTask.length).toBeGreaterThan(0);
        expect(errors.length).toBeGreaterThan(0);
    });

    it('Save My Day contract validates independently', () => {
        const smd = {
            strictlyDoToday: [{ task: 'Ship DSA sheet', hours: '2', reason: 'Hard deadline' }],
            postponeTomorrow: [{ task: 'Mock test', reason: 'No urgency' }],
            dropCancel: [{ task: 'Random reading' }],
            confidenceMessage: 'Focus.'
        };
        const r1 = validateSaveMyDay(smd);
        expect(r1.ok).toBe(true);
        expect(typeof r1.value.strictlyDoToday[0].hours).toBe('number');

        const r2 = validateAnalysis({ confidenceScore: 140, riskLevel: 'High' });
        expect(r2.value.confidenceScore).toBe(100);
        expect(r2.value.riskReason.length).toBeGreaterThan(0);
        expect(r2.value.agentMessage.length).toBeGreaterThan(0);
    });

    it('empty todayPlan is rejected', () => {
        const { ok, errors } = validatePlan({ ...VALID_PLAN, todayPlan: [] });
        expect(ok).toBe(false);
        expect(errors).toContain('todayPlan_empty');
    });

    it('latency is measured per request', async () => {
        setProviderChain([
            makeProvider('Gemini', {
                methods: {
                    generatePlan: async () => {
                        await new Promise(r => setTimeout(r, 30));
                        return VALID_PLAN;
                    }
                }
            })
        ]);
        const result = await runWithFailover('generatePlan', { buildFallback: () => VALID_PLAN }, 'test input');
        expect(result.attempts[0].latencyMs).toBeGreaterThan(20);
    });
});