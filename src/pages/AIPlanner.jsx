// src/pages/AIPlanner.jsx
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { generatePlan } from "../services/gemini";
import { savePlan } from "../services/firebaseService";
import { Brain } from "lucide-react";

// Progress steps for the premium loading experience
const THINKING_STEPS = [
    "Understanding your goals...",
    "Building execution strategy...",
    "Optimizing priorities...",
    "Preparing today's plan..."
];

// Client-Side Smart Motivation Engine
const getSmartMotivation = (taskText) => {
    const text = (taskText || "").toLowerCase();
    if (text.match(/study|dsa|read|learn|book|course/)) return "Knowledge compounds. Every minute counts.";
    if (text.match(/code|project|frontend|backend|build|design/)) return "One block at a time. Small pushes ship products.";
    if (text.match(/workout|gym|run|walk|water|health/)) return "Protect your energy. Your future self will thank you.";
    if (text.match(/call|email|apply|resume|internship/)) return "Opportunity favors the bold. Send it.";
    return "Small progress today beats last-minute stress.";
};

const inferDuration = (taskText) => {
    const text = (taskText || "").toLowerCase();
    const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h)\b/);
    if (hourMatch) return `${hourMatch[1]} ${Number(hourMatch[1]) === 1 ? "Hour" : "Hours"}`;

    const minuteMatch = text.match(/(\d+)\s*(minutes?|mins?|m)\b/);
    if (minuteMatch) return `${minuteMatch[1]} Min`;

    if (text.match(/\b(water|drink)\b/)) return "5 Min";
    if (text.match(/\b(meditate|mindfulness)\b/)) return "10 Min";
    if (text.match(/\b(read|reading|book)\b/)) return "30 Min";
    if (text.match(/\b(workout|gym|run|walk|exercise)\b/)) return "45 Min";
    if (text.match(/\b(email|text|call|pay|buy|check)\b/)) return "15 Min";
    if (text.match(/\b(project|dsa|study|code|build|write|assignment)\b/)) return "2 Hours";
    return "30 Min";
};

const inferTargetCount = (taskText) => {
    const text = (taskText || "").toLowerCase();
    const explicitCount = text.match(/(\d+)\s*(times|glasses|pages|sets|rounds|chapters|problems|questions)\b/);
    if (explicitCount) return Math.max(1, Number(explicitCount[1]));
    if (text.match(/\b(water|drink)\b/)) return 8;
    if (text.match(/\b(read|reading|book)\b/)) return 4;
    return 1;
};

const getTaskTitle = (task) => typeof task === "string" ? task : task?.title || task?.task || "Untitled task";

const findSourceTask = (taskText, parsedTasks) => {
    const normalizedText = (taskText || "").toLowerCase();
    return parsedTasks.find((item) => {
        const sourceText = item.text.toLowerCase();
        return normalizedText.includes(sourceText) || sourceText.includes(normalizedText);
    });
};

function AIPlanner() {
    // =====================================
    // CORE SYSTEM STATES & REFS
    // =====================================
    const [prompt, setPrompt] = useState("");
    const [response, setResponse] = useState(null);
    const [loading, setLoading] = useState(false);
    // eslint-disable-next-line no-unused-vars
    const [_toastMessage, setToastMessage] = useState("");

    // Pass 4 Execution Workspace Sync & Satisfaction States
    const [syncState, setSyncState] = useState("idle");
    const [checkedTasks, setCheckedTasks] = useState([]);
    const [thinkingStep, setThinkingStep] = useState(0);

    const navigate = useNavigate();

    // Voice Recognition States
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef(null);

    // =====================================
    // WIZARD ENGINE STATES
    // =====================================
    const [wizardActive, setWizardActive] = useState(false);
    const [parsedTasks, setParsedTasks] = useState([]);
    const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
    const [isReviewScreen, setIsReviewScreen] = useState(false);

    // =====================================
    // WEB SPEECH API IMPLEMENTATION
    // =====================================
    const handleVoiceInput = useCallback(() => {
        if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
            console.warn("Voice recognition is not supported in this browser.");
            return;
        }
        if (isListening) {
            recognitionRef.current?.stop();
            return;
        }
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
        recognitionRef.current.lang = 'en-US';

        recognitionRef.current.onstart = () => setIsListening(true);
        recognitionRef.current.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            setPrompt((prev) => prev ? `${prev} ${transcript}` : transcript);
        };
        recognitionRef.current.onerror = () => setIsListening(false);
        recognitionRef.current.onend = () => setIsListening(false);
        recognitionRef.current.start();
    }, [isListening]);

    // =====================================
    // STEP TIMER (AI PROGRESSIVE OVERLAY)
    // =====================================
    const prevLoadingRef = useRef(loading);
    useEffect(() => {
        const wasLoading = prevLoadingRef.current;
        prevLoadingRef.current = loading;
        
        if (!loading && wasLoading) {
            setThinkingStep(0);
            return;
        }
        if (!loading) return;
        
        const interval = setInterval(() => {
            setThinkingStep((prev) => prev < THINKING_STEPS.length - 1 ? prev + 1 : prev);
        }, 1200);
        return () => clearInterval(interval);
    }, [loading]);

    // =====================================
    // WIZARD FRAMEWORK ROUTINES
    // =====================================
    const handleContinueToWizard = useCallback(() => {
        if (!prompt.trim()) return;

        const lines = prompt.split(/\n|•|-|;/).map(t => t.trim()).filter(t => t.length > 1);
        if (lines.length === 0) lines.push(prompt.trim());

        const initializedTasks = lines.map((taskText, index) => {
            const lowerText = taskText.toLowerCase();
            let type = "Ambiguous";
            let timeframe = "Today";
            let duration = inferDuration(taskText);
            let targetCount = inferTargetCount(taskText);
            let preferredTime = "Flexible";
            let confidence = "low";
            let detailsComplete = false;

            if (/\b(water|gym|exercise|meditate|read|reading|run|walk|sleep|habit|routine|everyday|daily)\b/.test(lowerText)) {
                type = "Daily Habit";
                confidence = "high";
            } else if (/\b(call|email|text|buy|pay|meet|send|check|submit|download|appointment|bill|assignment)\b/.test(lowerText)) {
                type = "One-time Milestone";
                confidence = "high";
            } else if (/\b(continue|project|improve|portfolio|coding|frontend|backend|learning|study|dsa|build|design|write)\b/.test(lowerText)) {
                type = "Ambiguous";
                confidence = "low";
            }

            if (/\b(tomorrow)\b/.test(lowerText)) timeframe = "Tomorrow";
            else if (/\b(next week|weekend)\b/.test(lowerText)) timeframe = "This Week";
            if (/\b(morning)\b/.test(lowerText)) preferredTime = "Morning";
            else if (/\b(afternoon)\b/.test(lowerText)) preferredTime = "Afternoon";
            else if (/\b(evening|night)\b/.test(lowerText)) preferredTime = "Evening";

            return { id: index + 1, text: taskText, type, timeframe, duration, targetCount, preferredTime, confidence, detailsComplete };
        });

        setParsedTasks(initializedTasks);
        setWizardActive(true);
        setIsReviewScreen(false);

        const firstNeedsDetailIndex = initializedTasks.findIndex(t => !t.detailsComplete);
        if (firstNeedsDetailIndex !== -1) {
            setCurrentTaskIndex(firstNeedsDetailIndex);
        } else {
            setIsReviewScreen(true);
            setCurrentTaskIndex(0);
        }
    }, [prompt]);

    const advanceWizard = useCallback((currentSnapshot) => {
        const nextIndex = currentSnapshot.findIndex((t, idx) => idx > currentTaskIndex && !t.detailsComplete);
        if (nextIndex !== -1) {
            setCurrentTaskIndex(nextIndex);
        } else {
            setIsReviewScreen(true);
        }
    }, [currentTaskIndex]);

    const updateTaskProperty = useCallback((property, value, shouldAdvance = false) => {
        const updated = [...parsedTasks];
        updated[currentTaskIndex] = { ...updated[currentTaskIndex], [property]: value };

        if (property === "type") updated[currentTaskIndex].confidence = "high";
        setParsedTasks(updated);

        if (shouldAdvance) {
            updated[currentTaskIndex] = { ...updated[currentTaskIndex], detailsComplete: true };
            setParsedTasks(updated);
            advanceWizard(updated);
        }
    }, [parsedTasks, currentTaskIndex, advanceWizard]);

    const finishCurrentTaskDetails = useCallback(() => {
        const updated = [...parsedTasks];
        updated[currentTaskIndex] = { ...updated[currentTaskIndex], detailsComplete: true, confidence: "high" };
        setParsedTasks(updated);
        advanceWizard(updated);
    }, [parsedTasks, currentTaskIndex, advanceWizard]);

    const handlePrevious = useCallback(() => {
        if (isReviewScreen) {
            setIsReviewScreen(false);
            const lastLow = parsedTasks.map((t, idx) => ({ t, idx })).reverse().find(obj => !obj.t.detailsComplete || obj.t.type === "Ambiguous");
            setCurrentTaskIndex(lastLow ? lastLow.idx : 0);
        } else if (currentTaskIndex > 0) {
            setCurrentTaskIndex(prev => prev - 1);
        } else {
            setWizardActive(false);
        }
    }, [isReviewScreen, parsedTasks, currentTaskIndex]);

    // =====================================
    // CORE GENERATE AND DATA SYNC PIPELINES
    // =====================================
    const handleGenerateSmartPlan = useCallback(async () => {
        setLoading(true);
        const structuredContextPayload = parsedTasks.map(t =>
            `- Task: "${t.text}" [Classification: ${t.type}, Horizon: ${t.timeframe}, Expected Effort: ${t.duration}, Habit Target: ${t.targetCount || 1}, Preferred Time: ${t.preferredTime || "Flexible"}]`
        ).join("\n");

        const structuralWrapperPrompt = `
User original objective context: ${prompt}

Processed Architectural Matrix:
${structuredContextPayload}

Please establish a comprehensive execution schedule utilizing these specifications.
        `.trim();

        try {
            const result = await generatePlan(structuralWrapperPrompt);
            if (result) {
                setResponse(result);
                setCheckedTasks([]);
            }
        } catch (error) {
            console.error("Structured generation error:", error);
            setToastMessage("Failed to compile smart framework.");
            setTimeout(() => setToastMessage(""), 3000);
        } finally {
            setLoading(false);
        }
    }, [parsedTasks, prompt]);

    const buildTaskBoardTasks = useCallback((plan) => {
        const sourceTasks = Array.isArray(plan?.todayPlan) && plan.todayPlan.length > 0
            ? plan.todayPlan
            : parsedTasks.map((task) => task.text);

        return sourceTasks.map((task, index) => {
            const title = getTaskTitle(task);
            const source = findSourceTask(title, parsedTasks) || parsedTasks[index] || {};
            const isHabit = source.type === "Daily Habit";
            const deadlineDays = source.timeframe === "Tomorrow" ? 1 : source.timeframe === "This Week" ? 7 : 0;

            return {
                id: `task-${Date.now()}-${index}`,
                title,
                status: "To Do",
                completed: false,
                priority: isHabit ? "LOW" : "MEDIUM",
                deadlineDays,
                estimatedTime: source.duration || inferDuration(title),
                timeBlock: source.preferredTime && source.preferredTime !== "Flexible" ? source.preferredTime : "Focus Block",
                category: source.type || "One-time Milestone",
                type: source.type || "One-time Milestone",
                isRepeating: isHabit,
                targetCount: isHabit ? Math.max(1, Number(source.targetCount || inferTargetCount(title))) : 1,
                currentCount: 0,
                createdAt: new Date().toISOString(),
            };
        });
    }, [parsedTasks]);

    const handleCancelWorkspace = useCallback(() => {
        setResponse(null);
        setWizardActive(false);
        setIsReviewScreen(false);
        setCheckedTasks([]);
    }, []);

    const handleSyncToFlowMind = useCallback(async () => {
        setSyncState("syncing");
        try {
            await savePlan({
                ...response,
                taskBoardTasks: buildTaskBoardTasks(response),
                plannerSourceTasks: parsedTasks,
            });
            setSyncState("success");
            setTimeout(() => {
                navigate("/");
            }, 3000);
        } catch (error) {
            console.error("Sync error:", error);
            setToastMessage("Failed to sync with FlowMind.");
            setTimeout(() => setToastMessage(""), 3000);
            setSyncState("idle");
        }
    }, [response, navigate, buildTaskBoardTasks, parsedTasks]);

    const toggleVisualCheck = useCallback((index) => {
        setCheckedTasks(prev => prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]);
    }, []);

    // =====================================
    // MEMOIZED CALCULATION ENGINE
    // =====================================
    const baseScore = response ? (Number(response.confidenceScore) || 0) : 0;
    const totalTasks = response?.todayPlan?.length || 0;
    const completedCount = checkedTasks.length;
    const remainingCount = totalTasks - completedCount;

    const dynamicScoreVal = useMemo(() => {
        if (totalTasks === 0) return baseScore;
        const lift = Math.round(((100 - baseScore) * (completedCount / totalTasks)));
        return Math.min(100, baseScore + lift);
    }, [baseScore, completedCount, totalTasks]);

    // Animated counting logic for the metrics ring
    const [displayScore, setDisplayScore] = useState(0);
    const displayScoreRef = useRef(0);
    const isInitialRender = useRef(true);
    useEffect(() => {
        if (response) {
            const start = displayScoreRef.current;
            const duration = 800;
            const startTime = performance.now();
            const animate = (time) => {
                const elapsed = time - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const easeOutQuart = 1 - Math.pow(1 - progress, 4);
                const nextScore = Math.round(start + (dynamicScoreVal - start) * easeOutQuart);
                displayScoreRef.current = nextScore;
                setDisplayScore(nextScore);
                if (progress < 1) requestAnimationFrame(animate);
            };
            requestAnimationFrame(animate);
        } else if (!isInitialRender.current) {
            displayScoreRef.current = 0;
            setDisplayScore(0);
        }
        isInitialRender.current = false;
    }, [dynamicScoreVal, response]);

    const getStatusText = useCallback((score) => {
        if (score >= 80) return "On Track";
        if (score >= 50) return "Needs Attention";
        return "Critical";
    }, []);

    const getRingColor = useCallback((score) => score >= 75 ? "text-green-500" : score >= 45 ? "text-yellow-500" : "text-red-500", []);
    const getRingShadow = useCallback((score) => score >= 75 ? "drop-shadow(0 0 8px rgba(34,197,94,0.3))" : score >= 45 ? "drop-shadow(0 0 8px rgba(234,179,8,0.3))" : "drop-shadow(0 0 8px rgba(239,68,68,0.3))", []);
    const ringRadius = 38;
    const ringCircumference = 2 * Math.PI * ringRadius;
    const ringOffset = ringCircumference - (displayScore / 100) * ringCircumference;

    // --- AI Coach Streaming Simulation ---
    const [typedMessage, setTypedMessage] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const fullAgentMessage = useMemo(() => response ? `Nice. Here's today's execution strategy. ${response.agentMessage || "Your plan is optimized and ready for execution. Stay focused."}` : "", [response]);
    const prevResponseRef = useRef(response);
    const typingInitializedRef = useRef(false);

    useEffect(() => {
        const hadResponse = Boolean(prevResponseRef.current);
        const hasResponse = Boolean(response);
        prevResponseRef.current = response;

        if (!hasResponse && hadResponse) {
            setTypedMessage("");
            setIsTyping(false);
            typingInitializedRef.current = false;
            return;
        }
        if (!hasResponse) return;

        if (typingInitializedRef.current) return;
        typingInitializedRef.current = true;

        let i = 0;
        let currentText = "";
        setTypedMessage("");
        setIsTyping(true);
        const interval = setInterval(() => {
            currentText += fullAgentMessage.charAt(i);
            setTypedMessage(currentText);
            i++;
            if (i >= fullAgentMessage.length) {
                clearInterval(interval);
                setIsTyping(false);
            }
        }, 14);
        return () => clearInterval(interval);
    }, [fullAgentMessage, response]);

    const progressPercentage = parsedTasks.length > 0 ? Math.round(((currentTaskIndex) / parsedTasks.length) * 100) : 0;
    const activeTask = parsedTasks[currentTaskIndex];

    return (
        <>
            <style>{`
                html { scroll-behavior: smooth; }
                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: #E9DFD3; border-radius: 10px; }
                ::-webkit-scrollbar-thumb:hover { background: #D6C6FF; }
                .planner-scroll-zone { scroll-padding-bottom: 120px; }

                @keyframes shimmer {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }
                .skeleton-shimmer {
                    background: linear-gradient(90deg, #F3EBE1 25%, #FFFDFB 50%, #F3EBE1 75%);
                    background-size: 200% 100%;
                    animation: shimmer 1.6s infinite linear;
                }
                @keyframes popIn {
                    0% { opacity: 0; transform: scale(0.92); }
                    100% { opacity: 1; transform: scale(1); }
                }
                .success-pop { animation: popIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                
                @keyframes slideUpFade {
                    0% { opacity: 0; transform: translateY(12px); }
                    100% { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in-up { animation: slideUpFade 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                
                .stagger-1 { animation: slideUpFade 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; animation-delay: 0.05s; opacity: 0; }
                .stagger-2 { animation: slideUpFade 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; animation-delay: 0.15s; opacity: 0; }
                .stagger-3 { animation: slideUpFade 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; animation-delay: 0.25s; opacity: 0; }
            `}</style>

            <div className="relative min-h-[85vh] flex flex-col items-center justify-center px-5 py-6 lg:px-7 lg:py-8 font-sans pb-28 overflow-x-hidden">
                {/* Embedded Aesthetic Assets */}
                <div className="pointer-events-none absolute -top-40 -right-20 w-[600px] h-[600px] bg-[#D6C6FF] rounded-full filter blur-[120px] opacity-[0.12] z-0"></div>
                <div className="pointer-events-none absolute -bottom-40 -left-20 w-[600px] h-[600px] bg-[#A7F3D0] rounded-full filter blur-[120px] opacity-[0.12] z-0"></div>

                {/* =====================================
                    PRODUCTIVE OVERLAY MESH
                ===================================== */}
                {syncState === "success" && (
                    <div className="fixed inset-0 z-[200] bg-[#FAF8F4]/95 backdrop-blur-md flex flex-col items-center justify-center animate-fade-in">
                        <div className="absolute inset-0 bg-green-500/5 animate-pulse"></div>
                        <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center text-white shadow-[0_0_40px_rgba(34,197,94,0.4)] success-pop mb-6 relative z-10">
                            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                        <h2 className="text-3xl font-black text-gray-950 tracking-tight success-pop relative z-10" style={{ animationDelay: "0.1s" }}>Everything is synced.</h2>
                        <p className="text-gray-500 font-bold mt-3 success-pop relative z-10" style={{ animationDelay: "0.2s" }}>Redirecting to your workspace...</p>
                    </div>
                )}

                {/* =====================================
                    VIEW STATE 1: INITIAL COMPONENT SURFACES
                ===================================== */}
                {!wizardActive && !response && !loading && (
                    <div className="w-full max-w-3xl flex flex-col items-center justify-center animate-fade-in-up my-auto relative z-10">
                        <div className="text-center mb-10">
                                    <div className="w-20 h-20 mx-auto rounded-[24px] bg-purple-50 border border-purple-100 shadow-[0_0_25px_rgba(147,51,234,0.12)] flex items-center justify-center animate-float mb-7">
                            <Brain className="w-10 h-10 text-purple-600" />
                        </div>
                            <h1 className="text-4xl md:text-5xl font-black text-gray-950 tracking-tight mb-4">
                                What's your mission today?
                            </h1>
                            <p className="text-base text-gray-500 font-medium leading-relaxed">
                                Describe your goals, deadlines and available time.<br />
                                FlowMind will build your personalized execution strategy.
                            </p>
                        </div>

                        <div className="relative w-full group">
                            <textarea
                                className={`w-full min-h-[190px] p-6 pr-16 bg-white border border-[#E9DFD3] rounded-[24px] text-gray-900 placeholder-gray-400 focus:outline-none focus-visible:ring-4 focus-visible:ring-purple-500/20 focus:border-purple-300 transition-all duration-300 resize-none text-lg font-medium shadow-[0_14px_40px_rgba(80,62,38,0.07)] hover:border-purple-200 hover:shadow-[0_18px_50px_rgba(80,62,38,0.1)] ${isListening ? "border-red-300 ring-4 ring-red-500/10" : ""
                                    }`}
                                placeholder="Tell FlowMind what you want to accomplish..."
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                            />
                            <button
                                onClick={handleVoiceInput}
                                aria-label="Use microphone for input"
                                className={`absolute bottom-5 right-5 w-12 h-12 rounded-full transition-all duration-300 flex items-center justify-center shadow-sm border focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${isListening
                                    ? "bg-red-50 text-red-500 border-red-200 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                                    : "bg-purple-50 text-purple-600 border-purple-100 hover:bg-purple-100"
                                    }`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" /></svg>
                            </button>
                        </div>

                        <button
                            onClick={handleContinueToWizard}
                            disabled={!prompt.trim()}
                            className="mt-8 px-10 py-4 bg-purple-600 text-white rounded-[16px] font-bold text-lg shadow-[0_8px_24px_rgba(126,34,206,0.25)] hover:bg-purple-700 hover:-translate-y-0.5 active:scale-95 transition-all duration-200 disabled:opacity-40 disabled:hover:translate-y-0 disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-500"
                        >
                            ✨ Continue
                        </button>

                        <div className="mt-12 flex flex-wrap items-center justify-center gap-3">{[
                            { icon: "🎓", label: "Placement Preparation", prompt: "I have Deloitte OA in 15 days, need to practice DSA arrays and logical reasoning. I have 3 hours today." },
                            { icon: "📚", label: "Semester Project", prompt: "I need to complete the AQI project documentation and frontend integration by tomorrow. Available for 5 hours." },
                            { icon: "💼", label: "Internship Roadmap", prompt: "I need to update my resume and apply for 3 frontend internships today. I have 4 hours available." },
                            { icon: "🏃", label: "Personal Goals", prompt: "I want to start learning Spanish and go for a 5k run today. I have 2 hours of free time." }
                        ].map((chip, idx) => (
                            <button
                                key={idx}
                                onClick={() => setPrompt(chip.prompt)}
                                className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E9DFD3] rounded-full text-xs font-bold text-gray-600 hover:text-purple-700 hover:border-purple-200 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200"
                            >
                                <span className="text-sm">{chip.icon}</span> {chip.label}
                            </button>
                        ))}
                        </div>
                    </div>
                )}

                {/* =====================================
                    DYNAMIC CONTROL HEADER SPECIFICATIONS
                ===================================== */}
                {(wizardActive || response || loading) && (
                    <div className="w-full max-w-3xl flex flex-col gap-5 animate-fade-in-up my-auto transition-all duration-300 relative z-10">

                        <div className="bg-white/95 border border-[#E9DFD3]/80 p-4 rounded-[22px] shadow-[0_8px_24px_rgba(80,62,38,0.04)] flex items-start gap-3">
                            <span className="text-xl mt-0.5">✨</span>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-[10px] uppercase font-black tracking-widest text-[#A09486] mb-0.5">Your Tasks</h4>
                                <p className="text-xs font-semibold text-gray-600 line-clamp-2">{prompt}</p>
                            </div>
                        </div>

                        {/* =====================================
                            VIEW STATE 2: STEP REFINEMENTS & MATRICES
                        ===================================== */}
                        {wizardActive && !loading && !response && (
                            !isReviewScreen ? (
                                <div className="bg-white rounded-[22px] border border-[#E9DFD3]/80 p-6 shadow-[0_14px_40px_rgba(80,62,38,0.07)] flex flex-col gap-5 animate-fade-in-up">
                                    <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                                        <h3 className="text-base font-black tracking-tight text-gray-950">Let's Refine Your Plan</h3>
                                        <div className="text-right">
                                            <span className="text-[10px] font-black text-purple-600 uppercase tracking-wider">Step {currentTaskIndex + 1} of {parsedTasks.length}</span>
                                            <div className="w-20 bg-gray-100 h-1 rounded-full mt-1.5 overflow-hidden">
                                                <div className="bg-purple-600 h-full transition-all duration-300" style={{ width: `${progressPercentage}%` }} />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-[#FAF8F4] border border-[#EFE5D9] p-3.5 rounded-xl">
                                        <h2 className="text-lg font-extrabold text-gray-900 tracking-tight">"{activeTask?.text}"</h2>
                                    </div>

                                    <div className="bg-purple-50/50 border border-purple-100/60 p-4 rounded-xl flex gap-3 items-start">
                                        {/* Premium AI Orb for Coach */}
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(147,51,234,0.2)]">
                                            <div className="w-2 h-2 rounded-full bg-white/90 animate-pulse"></div>
                                        </div>
                                        <div className="text-xs text-gray-700 leading-relaxed font-semibold mt-0.5">
                                            <p className="mb-1">Almost done.</p>
                                            {activeTask?.type === "Ambiguous" ? (
                                                <p>Looks good. I just need one quick detail before I plan this. How should FlowMind track this work scope?</p>
                                            ) : activeTask?.type === "Daily Habit" ? (
                                                <p>FlowMind detected a habit. Set the target count and preferred time, or skip with the smart defaults.</p>
                                            ) : activeTask?.text.toLowerCase().includes("project") || activeTask?.text.toLowerCase().includes("dsa") || activeTask?.text.toLowerCase().includes("study") ? (
                                                <p>Got it. For a technical milestone like this, what is your expected available window?</p>
                                            ) : (
                                                <p>Perfect. Confirm the deadline and effort, or keep the smart default.</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="py-1">
                                        {activeTask?.type === "Ambiguous" ? (
                                            <div className="flex flex-wrap gap-2">
                                                {["One-time Milestone", "Daily Habit", "Project Sprint"].map(opt => (
                                                    <button key={opt} onClick={() => updateTaskProperty("type", opt)} className="px-4 py-2.5 bg-white border border-[#E9DFD3] rounded-full text-xs font-bold text-gray-700 hover:border-purple-300 hover:bg-purple-50/40 active:scale-95 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500">🎯 {opt}</button>
                                                ))}
                                            </div>
                                        ) : activeTask?.type === "Daily Habit" ? (
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block mb-2">Daily Target</label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {[1, 2, 4, 8].map(count => (
                                                            <button
                                                                key={count}
                                                                onClick={() => updateTaskProperty("targetCount", count)}
                                                                className={`px-4 py-2 rounded-full text-xs font-bold transition border active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
                                                                    Number(activeTask.targetCount) === count ? "bg-purple-600 border-purple-600 text-white" : "bg-white border-[#E9DFD3] text-gray-700 hover:border-purple-200"
                                                                }`}
                                                            >
                                                                {count}x
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block mb-2">Preferred Time</label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {["Flexible", "Morning", "Afternoon", "Evening"].map(time => (
                                                            <button
                                                                key={time}
                                                                onClick={() => updateTaskProperty("preferredTime", time)}
                                                                className={`px-4 py-2 rounded-full text-xs font-bold transition border active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
                                                                    activeTask.preferredTime === time ? "bg-purple-600 border-purple-600 text-white" : "bg-white border-[#E9DFD3] text-gray-700 hover:border-purple-200"
                                                                }`}
                                                            >
                                                                {time}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block mb-2">Effort Per Check</label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {["5 Min", "10 Min", "30 Min", "45 Min"].map(dur => (
                                                            <button
                                                                key={dur}
                                                                onClick={() => updateTaskProperty("duration", dur)}
                                                                className={`px-4 py-2 rounded-full text-xs font-bold transition border active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
                                                                    activeTask.duration === dur ? "bg-purple-600 border-purple-600 text-white" : "bg-white border-[#E9DFD3] text-gray-700 hover:border-purple-200"
                                                                }`}
                                                            >
                                                                ⏱ {dur}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={finishCurrentTaskDetails}
                                                    className="w-full sm:w-auto px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-[0_6px_20px_rgba(126,34,206,0.2)] transition uppercase tracking-wider active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-500"
                                                >
                                                    Continue
                                                </button>
                                            </div>
                                        ) : activeTask?.text.toLowerCase().includes("project") || activeTask?.text.toLowerCase().includes("dsa") || activeTask?.text.toLowerCase().includes("study") ? (
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block mb-2">Available Hours</label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {["1 Hour", "2 Hours", "3+ Hours"].map(dur => (
                                                            <button key={dur} onClick={() => updateTaskProperty("duration", dur)} className={`px-4 py-2 rounded-full text-xs font-bold transition border active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${activeTask.duration === dur ? "bg-purple-600 border-purple-600 text-white" : "bg-white border-[#E9DFD3] text-gray-700 hover:border-purple-200"}`}>⏱ {dur}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <button onClick={finishCurrentTaskDetails} className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-[0_6px_20px_rgba(126,34,206,0.2)] transition uppercase tracking-wider active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-500">Continue</button>
                                            </div>
                                        ) : (
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block mb-2">Deadline</label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {["Today", "Tomorrow", "This Week"].map(time => (
                                                            <button key={time} onClick={() => updateTaskProperty("timeframe", time)} className={`px-4 py-2.5 rounded-full text-xs font-bold transition border active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${activeTask.timeframe === time ? "bg-purple-600 border-purple-600 text-white" : "bg-white border-[#E9DFD3] text-gray-700 hover:border-purple-200"}`}>📅 {time}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block mb-2">Estimated Time</label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {["15 Min", "30 Min", "1 Hour", "2 Hours"].map(dur => (
                                                            <button key={dur} onClick={() => updateTaskProperty("duration", dur)} className={`px-4 py-2 rounded-full text-xs font-bold transition border active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${activeTask.duration === dur ? "bg-purple-600 border-purple-600 text-white" : "bg-white border-[#E9DFD3] text-gray-700 hover:border-purple-200"}`}>⏱ {dur}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <button onClick={finishCurrentTaskDetails} className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-[0_6px_20px_rgba(126,34,206,0.2)] transition uppercase tracking-wider active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-500">Continue</button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
                                        <button onClick={handlePrevious} className="px-3 py-1.5 text-xs font-bold text-gray-400 hover:text-gray-900 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 rounded">◀ Previous</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-white rounded-[22px] border border-[#E9DFD3]/80 p-6 shadow-[0_14px_40px_rgba(80,62,38,0.07)] flex flex-col gap-5 animate-fade-in-up">
                                    <div>
                                        <h3 className="text-lg font-black tracking-tight text-gray-950">Review Your Plan</h3>
                                        <p className="text-xs font-bold text-gray-400 mt-0.5">Confirm or modify details before building the final layout.</p>
                                    </div>
                                    <div className="space-y-2 max-h-[340px] overflow-y-auto pr-2">
                                        {parsedTasks.map((task, idx) => (
                                            <div key={task.id} className="p-3.5 bg-[#FFFCF8] border border-[#EFE5D9] rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors hover:border-purple-100">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 mb-1.5">
                                                        <h4 className="text-xs font-black text-gray-900 truncate">✓ {task.text}</h4>
                                                        {task.confidence === 'high' && (
                                                            <span className="shrink-0 px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-[9px] font-bold border border-green-100 flex items-center gap-0.5">
                                                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                                                Auto Detected
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-[9px] font-bold">{task.type}</span>
                                                        <span className="px-2 py-0.5 bg-gray-50 text-gray-500 rounded text-[9px] font-bold">{task.timeframe}</span>
                                                        <span className="px-2 py-0.5 bg-gray-50 text-gray-500 rounded text-[9px] font-bold">{task.duration}</span>
                                                        {task.type === "Daily Habit" && (
                                                            <>
                                                                <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded text-[9px] font-bold border border-green-100">{task.targetCount || 1}x target</span>
                                                                <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-[9px] font-bold border border-amber-100">{task.preferredTime || "Flexible"}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                <button onClick={() => { setCurrentTaskIndex(idx); setIsReviewScreen(false); }} className="px-3 py-1.5 bg-white border border-gray-200 hover:border-purple-300 text-gray-600 text-[11px] font-bold rounded-lg transition shrink-0 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500">Modify</button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="border-t border-gray-100 pt-4 flex items-center justify-between">
                                        <button onClick={handlePrevious} className="px-3 py-1.5 text-xs font-bold text-gray-400 hover:text-gray-900 transition rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300">◀ Back</button>
                                        <button onClick={handleGenerateSmartPlan} className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-[0_6px_20px_rgba(126,34,206,0.25)] transition uppercase tracking-wider active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-500">✨ Generate Smart Plan</button>
                                    </div>
                                </div>
                            )
                        )}

                        {/* =====================================
                            VIEW STATE 3: AI THINKING ORCHESTRATION
                        ===================================== */}
                        {loading && (
                            <div className="w-full flex flex-col gap-4 animate-fade-in-up">
                                <div className="bg-white border border-[#E9DFD3]/80 rounded-[22px] p-6 shadow-[0_14px_40px_rgba(80,62,38,0.07)] flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
                                    <div className="flex-1 min-w-0">
                                        <div className="space-y-3 max-w-xl">
                                            {THINKING_STEPS.map((step, index) => {
                                                if (index > thinkingStep) return null;
                                                const isCurrent = index === thinkingStep;
                                                return (
                                                    <div key={index} className={`flex items-center gap-3 transition-opacity duration-300 ${isCurrent ? "text-purple-600 font-bold animate-pulse" : "text-gray-400"}`}>
                                                        <span className={isCurrent ? "text-sm animate-spin text-purple-500" : "text-green-500 font-bold text-sm"}>{isCurrent ? "⚙️" : "✓"}</span>
                                                        <span className="text-sm tracking-wide">{step}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-center shrink-0 pr-4">
                                        <div className="relative w-20 h-20 flex items-center justify-center">
                                            <div className="absolute inset-0 bg-purple-400/20 rounded-full filter blur-xl animate-pulse scale-125"></div>
                                            <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-400 animate-pulse flex items-center justify-center shadow-[0_0_30px_rgba(147,51,234,0.3)]">
                                                <div className="w-3 h-3 rounded-full bg-white/60 filter blur-xs animate-ping"></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                                    <div className="bg-white p-5 rounded-2xl border border-[#E9DFD3] h-[130px] flex flex-col items-center justify-center gap-3 shadow-sm">
                                        <div className="w-16 h-16 rounded-full skeleton-shimmer"></div>
                                    </div>
                                    <div className="md:col-span-2 bg-white p-5 rounded-2xl border border-[#E9DFD3] h-[130px] flex flex-col justify-center gap-3 shadow-sm">
                                        <div className="w-8 h-8 rounded-full skeleton-shimmer mb-1"></div>
                                        <div className="w-3/4 h-3 skeleton-shimmer rounded"></div>
                                        <div className="w-1/2 h-3 skeleton-shimmer rounded"></div>
                                    </div>
                                </div>
                                <div className="bg-white p-6 rounded-2xl border border-[#E9DFD3] flex flex-col gap-4 shadow-sm">
                                    <div className="w-32 h-4 skeleton-shimmer rounded mb-2"></div>
                                    <div className="w-full h-16 skeleton-shimmer rounded-xl"></div>
                                    <div className="w-full h-16 skeleton-shimmer rounded-xl"></div>
                                </div>
                            </div>
                        )}

                        {/* =====================================
                            VIEW STATE 4: MINIMAL EXECUTION WORKSPACE
                        ===================================== */}
                        {response && !loading && (
                            <div className="w-full flex flex-col gap-4 relative pb-28 planner-scroll-zone">

                                {/* TOP ROW: Success Chance + AI Coach */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 stagger-1">

                                    {/* Success Ring */}
                                    <div className="bg-white p-5 rounded-[22px] border border-[#E9DFD3]/80 shadow-[0_14px_40px_rgba(80,62,38,0.05)] flex flex-col items-center justify-center relative">
                                        <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 absolute top-4 left-5">Success</h3>
                                        <div className="relative w-[86px] h-[86px] flex items-center justify-center mt-3">
                                            <div className="absolute inset-0 rounded-full bg-white shadow-[0_0_15px_rgba(0,0,0,0.02)] blur-sm"></div>
                                            <svg className="transform -rotate-90 w-full h-full relative z-10" style={{ filter: getRingShadow(displayScore) }}>
                                                <circle cx="43" cy="43" r={ringRadius} stroke="currentColor" strokeWidth="7" fill="transparent" className="text-gray-100" />
                                                <circle cx="43" cy="43" r={ringRadius} stroke="currentColor" strokeWidth="7" fill="transparent" strokeDasharray={ringCircumference} strokeDashoffset={ringOffset} strokeLinecap="round" className={`${getRingColor(displayScore)} transition-all duration-700`} style={{ transitionTimingFunction: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)' }} />
                                            </svg>
                                            <div className="absolute inset-0 flex items-center justify-center z-20">
                                                <span className={`text-xl font-black ${getRingColor(displayScore)} transition-colors duration-300`}>{displayScore}%</span>
                                            </div>
                                        </div>
                                        <span className={`mt-3 text-[10px] font-extrabold uppercase tracking-wider ${getRingColor(displayScore)} transition-colors duration-300`}>{getStatusText(displayScore)}</span>
                                    </div>

                                    {/* AI Coach */}
                                    <div className="md:col-span-2 bg-white p-5 rounded-[22px] border border-[#E9DFD3]/80 shadow-[0_14px_40px_rgba(80,62,38,0.05)] flex gap-4 items-center">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(147,51,234,0.3)] relative">
                                            <div className="w-3 h-3 rounded-full bg-white/90 animate-pulse"></div>
                                            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white"></span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">FlowMind Coach</h3>
                                            <p className="text-sm text-gray-700 font-bold leading-relaxed">{typedMessage}{isTyping && <span className="animate-pulse opacity-50 ml-0.5">|</span>}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* MIDDLE SECTION: Today's Action Plan */}
                                <div className="bg-white p-6 rounded-[22px] border border-[#E9DFD3]/80 shadow-[0_14px_40px_rgba(80,62,38,0.05)] stagger-2">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
                                        <h3 className="text-lg font-black tracking-tight text-gray-950 flex items-center gap-2">🎯 Today's Action Plan</h3>
                                        <span className="text-xs font-bold text-gray-400 bg-gray-50 px-2.5 py-1 rounded-lg border border-gray-100">{remainingCount} {remainingCount === 1 ? 'Task' : 'Tasks'} Left</span>
                                    </div>

                                    {response.todayPlan?.length > 0 ? (
                                        <div className="space-y-3">
                                            {response.todayPlan.map((task, index) => {
                                                const taskText = getTaskTitle(task);
                                                const isChecked = checkedTasks.includes(index);
                                                const matchedTask = findSourceTask(taskText, parsedTasks);
                                                const duration = matchedTask ? matchedTask.duration : "Focus Block";
                                                const isHabit = matchedTask?.type === "Daily Habit";

                                                return (
                                                    <div key={index} className={`p-4 rounded-xl border transition-all duration-300 ease-out flex items-start gap-4 ${isChecked ? 'bg-green-50/30 border-green-200/50 opacity-75 scale-[0.99] shadow-[0_0_15px_rgba(34,197,94,0.06)]' : 'bg-white border-[#EFE5D9] hover:border-purple-200 hover:shadow-md hover:-translate-y-0.5'}`}>
                                                        <button
                                                            onClick={() => toggleVisualCheck(index)}
                                                            aria-label="Toggle task completion"
                                                            className={`w-5 h-5 rounded mt-0.5 flex items-center justify-center border transition-all duration-300 active:scale-75 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-1 cursor-pointer shrink-0 ${isChecked ? 'bg-green-500 border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.4)]' : 'bg-white border-gray-300 hover:border-purple-400'}`}
                                                        >
                                                            {isChecked && <svg className="w-3.5 h-3.5 text-white animate-fade-in" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                                        </button>
                                                        <div className="flex-1 min-w-0 transition-opacity duration-300">
                                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1">
                                                                <h4 className={`text-sm font-black transition-colors duration-300 truncate ${isChecked ? 'text-gray-400 line-through' : 'text-gray-900'}`} title={taskText}>{taskText}</h4>
                                                                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                                                    {isHabit && (
                                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-700 border border-green-100">
                                                                            Habit {matchedTask.targetCount || 1}x
                                                                        </span>
                                                                    )}
                                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-[#FAF8F4] text-gray-500 border border-[#E9DFD3]">⏱ {duration}</span>
                                                                </div>
                                                            </div>
                                                            <p className={`text-xs font-semibold italic transition-colors duration-300 ${isChecked ? 'text-gray-300' : 'text-gray-400'}`}>"{getSmartMotivation(taskText)}"</p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="p-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200 flex flex-col items-center justify-center gap-3">
                                            <span className="text-3xl">☕</span>
                                            <p className="text-gray-500 font-bold text-sm">Your day is perfectly clear. Take a breather!</p>
                                        </div>
                                    )}
                                </div>

                                {/* BOTTOM SECTION: Upcoming Tasks */}
                                <div className="bg-white p-6 rounded-[22px] border border-[#E9DFD3]/80 shadow-[0_14px_40px_rgba(80,62,38,0.05)] stagger-3">
                                    <h3 className="text-base font-black tracking-tight text-gray-950 mb-4">⏳ Upcoming Milestones</h3>

                                    {response.upcomingTasks?.length > 0 ? (
                                        <div className="relative pl-2.5 space-y-4">
                                            <div className="absolute top-2 bottom-2 left-[13.5px] w-px bg-gray-100"></div>
                                            {response.upcomingTasks.map((task, index) => {
                                                const taskText = getTaskTitle(task);
                                                const priority = typeof task !== "string" && task.priority ? task.priority : "Upcoming";
                                                const est = typeof task !== "string" && task.estimatedTime ? task.estimatedTime : "Planned";

                                                return (
                                                    <div key={index} className="relative flex items-center gap-4 z-10 transition-opacity hover:opacity-80">
                                                        <div className="w-1.5 h-1.5 rounded-full ring-4 ring-white bg-gray-300 shrink-0"></div>
                                                        <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between bg-white border border-gray-100 px-4 py-2.5 rounded-lg min-w-0 gap-2 shadow-3xs hover:border-gray-200 transition-colors">
                                                            <h4 className="text-[11px] font-bold text-gray-500 truncate">{taskText}</h4>
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider">⏱ {est}</span>
                                                                <span className="text-[9px] font-black uppercase bg-gray-50 border border-gray-100 text-gray-400 px-1.5 py-0.5 rounded">{priority}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="p-5 text-center bg-gray-50/50 rounded-xl border border-gray-100">
                                            <p className="text-gray-400 font-semibold text-xs italic">You're all caught up. No upcoming items.</p>
                                        </div>
                                    )}
                                </div>

                                {/* STICKY BOTTOM ACTION BAR */}
                                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-xl border-t border-[#E9DFD3] flex justify-center items-center z-50 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
                                    <div className="w-full max-w-3xl flex items-center justify-between px-2">
                                        <button
                                            onClick={handleCancelWorkspace}
                                            className="px-5 py-2.5 text-xs font-bold text-gray-500 hover:text-gray-900 transition flex items-center gap-1.5 active:scale-95 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleSyncToFlowMind}
                                            disabled={syncState === "syncing"}
                                            className="px-8 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm rounded-xl shadow-[0_8px_24px_rgba(126,34,206,0.25)] transition flex items-center gap-2 disabled:opacity-70 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-500"
                                        >
                                            {syncState === "syncing" ? (
                                                <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></span> Syncing...</>
                                            ) : (
                                                "✨ Add to FlowMind"
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}

export default AIPlanner;
