import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { savePlan } from "../services/firebaseService";
import { recordTaskCompletionStreak } from "../services/authService";
import { recalculateAnalysis } from "../services/gemini";
import { logTaskCompletion, logConfidenceChange } from "../services/historyService";
import { Brain, CalendarDays, ChevronLeft, ChevronRight, Zap } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { usePlan } from "../hooks/usePlan";
import SaveMyDayModal from "../components/SaveMyDayModal";
import {
    buildCalendarMeta,
    buildTaskMetrics,
    getConfidenceMeta,
    getDisplayName,
    getSyncStatus,
    getTodayKey,
    normalizeDashboardTask,
    normalizePriority,
} from "../utils/dashboardMetrics";

const getDeadlineStackStyles = (days) => {
    if (days <= 3) return "text-red-600";
    if (days <= 10) return "text-yellow-600";
    return "text-green-600";
};

const getDeadlineBarStyles = (days) => {
    if (days <= 3) return "bg-red-500";
    if (days <= 10) return "bg-yellow-500";
    return "bg-green-500";
};

const getPriorityBadgeStyles = (priority) => {
    const value = normalizePriority(priority);
    if (value === "HIGH") return "bg-red-50 text-red-600 border-red-100 dark:bg-red-900/20 dark:border-red-800";
    if (value === "LOW") return "bg-green-50 text-green-600 border-green-100 dark:bg-green-900/20 dark:border-green-800";
    if (value === "MEDIUM") return "bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:border-amber-800";
    return "bg-gray-50 text-gray-500 dark:text-gray-400 border-gray-100 dark:bg-gray-800 dark:border-gray-700";
};

const CoachMessage = memo(function CoachMessage({ message }) {
    const visibleMessage = message || "Your latest AI coach message will appear after your first plan sync.";

    return (
        <p
            key={visibleMessage}
            className="dashboard-coach-fade text-xs text-gray-700 dark:text-gray-300 leading-relaxed font-semibold italic line-clamp-3 transition-opacity duration-500"
            aria-live="polite"
        >
            "{visibleMessage}"
        </p>
    );
});

function Dashboard() {
    const [currentTime, setCurrentTime] = useState("");
    const [currentDate, setCurrentDate] = useState("");
    const [nowMs, setNowMs] = useState(() => Date.now());
    const [syncingTaskId, setSyncingTaskId] = useState(null);
    const [toastMessage, setToastMessage] = useState("");
    const toastTimeoutRef = useRef(null);
    const [quickAddInput, setQuickAddInput] = useState("");

    const [calendarView, setCalendarView] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1);
    });
    const [selectedCalendarDay, setSelectedCalendarDay] = useState(null);
    const [calendarTransition, setCalendarTransition] = useState("");

    const navigate = useNavigate();
    const { user, profile, updateProfileStats } = useAuth();
    const { plan, loadingPlan: isLoading } = usePlan();

    const [showSaveMyDay, setShowSaveMyDay] = useState(false);
    const [recoveryPrompt, setRecoveryPrompt] = useState(null);

    useEffect(() => {
        const updateClock = () => {
            const now = new Date();
            setNowMs(now.getTime());
            setCurrentTime(now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }));
            setCurrentDate(now.toLocaleDateString("en-GB", {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
            }));
        };

        updateClock();
        const intervalId = setInterval(updateClock, 1000);
        return () => clearInterval(intervalId);
    }, []);

    useEffect(() => () => {
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    }, []);

    const metrics = useMemo(() => buildTaskMetrics(plan, profile), [plan, profile]);
    const {
        tasks = [],
        todayTasks = [],
        focusTask,
        upcomingDeadlines = [],
        completedToday = [],
        completedTodayCount,
        totalTaskCount,
        completedTaskCount,
        progressPercentage,
        successChance: successScore,
        productivityStreak: currentStreak,
        onlyRepeatingHabitsRemain,
    } = metrics || {};

    const userName = getDisplayName(profile, user);
    const [displayScore, setDisplayScore] = useState(0);
    const displayScoreRef = useRef(0);
    const confidenceMeta = getConfidenceMeta(displayScore);
    const aiCoachMessage = plan?.aiCoachMessage || plan?.agentMessage || plan?.confidenceMessage || "";
    const syncedAtMs = useMemo(() => {
        const rawDate = plan?.updatedAt || plan?.savedAt || plan?.activatedAt;
        const parsed = rawDate ? new Date(rawDate).getTime() : NaN;
        return Number.isFinite(parsed) ? parsed : null;
    }, [plan?.activatedAt, plan?.savedAt, plan?.updatedAt]);
    const syncStatus = useMemo(
        () => getSyncStatus({ isSyncing: Boolean(syncingTaskId), syncedAtMs, nowMs }),
        [syncingTaskId, syncedAtMs, nowMs]
    );

    const currentHour = new Date().getHours();
    const timeOfDay = currentHour < 12 ? "Morning" : currentHour < 18 ? "Afternoon" : currentHour < 22 ? "Evening" : "Night";

    const ringRadius = 34;
    const ringCircumference = 2 * Math.PI * ringRadius;
    const ringOffset = ringCircumference - (displayScore / 100) * ringCircumference;
    const calendarMeta = useMemo(
        () => buildCalendarMeta(calendarView, tasks, new Date(nowMs)),
        [calendarView, tasks, nowMs]
    );

    const shiftCalendarMonth = useCallback((direction) => {
        setCalendarTransition(direction > 0 ? "dashboard-calendar-next" : "dashboard-calendar-prev");
        setCalendarView((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
        setSelectedCalendarDay(null);
        setTimeout(() => setCalendarTransition(""), 320);
    }, []);

    useEffect(() => {
        let frameId;
        const start = displayScoreRef.current;
        const target = successScore;
        const startTime = performance.now();
        const duration = 900;

        const animateScore = (time) => {
            const elapsed = time - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const nextScore = Math.min(100, Math.max(0, Math.round(start + (target - start) * eased)));
            displayScoreRef.current = nextScore;
            setDisplayScore(nextScore);

            if (progress < 1) {
                frameId = requestAnimationFrame(animateScore);
            }
        };

        frameId = requestAnimationFrame(animateScore);
        return () => {
            cancelAnimationFrame(frameId);
        };
    }, [successScore]);

    const cardHoverEffect = "min-w-0 bg-white dark:bg-gray-900 rounded-[22px] border border-[#E9DFD3]/80 dark:border-gray-700 shadow-[0_16px_44px_rgba(80,62,38,0.08)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.3)] p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_22px_58px_rgba(80,62,38,0.12)] dark:hover:shadow-[0_12px_32px_rgba(0,0,0,0.4)] flex flex-col";
    const cardHeroEffect = `${cardHoverEffect} shadow-[0_20px_52px_rgba(80,62,38,0.1)] dark:shadow-[0_10px_28px_rgba(0,0,0,0.35)] hover:shadow-[0_26px_64px_rgba(80,62,38,0.14)] dark:hover:shadow-[0_14px_36px_rgba(0,0,0,0.45)]`;

    const getFutureDate = useCallback((daysAhead) => {
        const d = new Date();
        d.setDate(d.getDate() + Number(daysAhead || 0));
        return {
            day: d.toLocaleDateString("en-GB", { day: "2-digit" }),
            month: d.toLocaleDateString("en-GB", { month: "short" }).toUpperCase(),
        };
    }, []);

    const handleCompleteTask = useCallback(async (taskId) => {
        if (!plan || syncingTaskId) return;

        setSyncingTaskId(taskId);
        const todayKey = getTodayKey();
        try {
            const sourceTasks = Array.isArray(plan?.taskBoardTasks) ? plan.taskBoardTasks : (tasks || []).map((task) => task.raw);
            const updatedTasks = sourceTasks.map((task, index) => {
                const normalized = normalizeDashboardTask(task, index);
                if (normalized.id !== taskId) return task;
                const baseTask = typeof task === "string" ? { title: task } : task;
                return {
                    ...baseTask,
                    status: "Completed",
                    completed: true,
                    completedAt: new Date().toISOString(),
                    completedDate: todayKey,
                    lastProgressDate: todayKey,
                    currentCount: baseTask?.targetCount || baseTask?.currentCount,
                };
            });

            const completedTasks = updatedTasks.filter((t) => {
                const n = normalizeDashboardTask(t, 0);
                return n.status === "Completed";
            }).map((t) => normalizeDashboardTask(t, 0).title);

            const remainingTasks = updatedTasks.filter((t) => {
                const n = normalizeDashboardTask(t, 0);
                return n.status !== "Completed";
            }).map((t) => normalizeDashboardTask(t, 0).title);

            const analysis = await recalculateAnalysis(completedTasks, remainingTasks, plan);

            const didSave = await savePlan({
                ...plan,
                taskBoardTasks: updatedTasks,
                confidenceScore: analysis.confidenceScore,
                riskLevel: analysis.riskLevel,
                riskReason: analysis.riskReason,
                agentMessage: analysis.agentMessage,
            });
            if (!didSave) throw new Error("Plan save was not accepted");

            if (user?.uid) {
                const completedTask = updatedTasks.find((t) => {
                    const n = normalizeDashboardTask(t, 0);
                    return n.id === taskId;
                });
                if (completedTask) {
                    logTaskCompletion(user.uid, completedTask);
                }
                const oldScore = Number(plan.confidenceScore || 0);
                const newScore = Number(analysis.confidenceScore || 0);
                if (oldScore !== newScore) {
                    logConfidenceChange(user.uid, oldScore, newScore, "task_completion");
                }
            }

            if (analysis.confidenceScore <= 40) {
                setRecoveryPrompt({
                    score: analysis.confidenceScore,
                    message: analysis.agentMessage,
                });
            }

            if (user?.uid) {
                const nextStats = await recordTaskCompletionStreak(user.uid, profile?.stats || {});
                updateProfileStats(nextStats);
            }
        } catch (error) {
            console.error("Failed to complete task from dashboard", error);
            setToastMessage("Could not sync task. Please try again.");
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
            toastTimeoutRef.current = setTimeout(() => {
                setToastMessage("");
                toastTimeoutRef.current = null;
            }, 3000);
        } finally {
            setSyncingTaskId(null);
        }
    }, [plan, syncingTaskId, tasks, user, profile, updateProfileStats]);

    const handleQuickAdd = useCallback(async (e) => {
        e.preventDefault();
        const title = quickAddInput.trim();
        if (!title || !plan) return;

        const newTask = {
            id: `quick-${Date.now()}`,
            title,
            status: "To Do",
            completed: false,
            priority: "MEDIUM",
            deadlineDays: 1,
            estimatedTime: "1 Hour",
            timeBlock: "Focus Block",
            category: "Quick Add",
            subtasks: [],
            tags: [],
        };

        const sourceTasks = Array.isArray(plan?.taskBoardTasks) ? plan.taskBoardTasks : (tasks || []).map(t => t.raw);
        const updatedTasks = [...sourceTasks, newTask];

        try {
            await savePlan({ ...plan, taskBoardTasks: updatedTasks });
            setQuickAddInput("");
            setToastMessage("Task added!");
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
            toastTimeoutRef.current = setTimeout(() => { setToastMessage(""); toastTimeoutRef.current = null; }, 3000);
        } catch (error) {
            console.error("Failed to quick add task", error);
            setToastMessage("Failed to add task.");
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
            toastTimeoutRef.current = setTimeout(() => { setToastMessage(""); toastTimeoutRef.current = null; }, 3000);
        }
    }, [quickAddInput, plan, tasks]);

    const handleApplyTriage = useCallback(async (triageResult) => {
        if (!plan || !triageResult) return;

        const doNowTasks = (triageResult.strictlyDoToday || []).map((item, i) => {
            const existing = (plan.taskBoardTasks || []).find(
                (t) => (t.title || t.task || "").toLowerCase() === (item.task || "").toLowerCase()
            );
            if (existing) {
                return { ...existing, status: "To Do", completed: false, deadlineDays: 1 };
            }
            return {
                id: `smd-${Date.now()}-${i}`,
                title: item.task,
                status: "To Do",
                completed: false,
                priority: "HIGH",
                deadlineDays: 1,
                estimatedTime: item.hours ? `${item.hours} Hours` : "1 Hour",
                timeBlock: "Focus Block",
                category: "Save My Day",
                isRepeating: false,
                targetCount: 1,
                currentCount: 0,
                createdAt: new Date().toISOString(),
            };
        });

        const postponedTasks = (triageResult.postponeTomorrow || []).map((item, i) => {
            const existing = (plan.taskBoardTasks || []).find(
                (t) => (t.title || t.task || "").toLowerCase() === (item.task || "").toLowerCase()
            );
            if (existing) {
                return { ...existing, deadlineDays: 2 };
            }
            return {
                id: `smd-post-${Date.now()}-${i}`,
                title: item.task,
                status: "To Do",
                completed: false,
                priority: "MEDIUM",
                deadlineDays: 2,
                estimatedTime: "1 Hour",
                timeBlock: "Focus Block",
                category: "Save My Day",
                isRepeating: false,
                targetCount: 1,
                currentCount: 0,
                createdAt: new Date().toISOString(),
            };
        });

        const dropTitles = (triageResult.dropCancel || []).map((item) =>
            (item.task || "").toLowerCase()
        );

        const untouchedTasks = (plan.taskBoardTasks || []).filter((t) => {
            const title = (t.title || "").toLowerCase();
            const isDoNow = doNowTasks.some((d) => d.title.toLowerCase() === title);
            const isPostponed = postponedTasks.some((p) => p.title.toLowerCase() === title);
            const isDropped = dropTitles.includes(title);
            return !isDoNow && !isPostponed && !isDropped;
        });

        const newTasks = [...doNowTasks, ...postponedTasks, ...untouchedTasks];

        try {
            await savePlan({
                ...plan,
                taskBoardTasks: newTasks,
                saveMyDayResult: triageResult,
                saveMyDayAt: new Date().toISOString(),
            });
            setShowSaveMyDay(false);
        } catch (error) {
            console.error("Failed to save triage result:", error);
            setToastMessage("Failed to save changes. Please try again.");
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
            toastTimeoutRef.current = setTimeout(() => {
                setToastMessage("");
                toastTimeoutRef.current = null;
            }, 3000);
        }
    }, [plan]);

    if (isLoading) {
        return (
            <>
                <style>{`
                    @keyframes dashboardShimmer {
                        0% { background-position: -200% 0; }
                        100% { background-position: 200% 0; }
                    }
                    .dashboard-skeleton {
                        background: linear-gradient(90deg, #E9DFD3 25%, #FFFDFB 50%, #E9DFD3 75%);
                        background-size: 200% 100%;
                        animation: dashboardShimmer 1.8s ease-in-out infinite;
                    }
                `}</style>
                <div className="relative min-h-screen text-gray-800 dark:text-gray-100 overflow-hidden font-sans pb-5">
                    <div className="relative z-10 max-w-[1510px] mx-auto px-5 py-4 lg:px-7 lg:py-5">
                        <div className="mb-4">
                            <div className="h-3 w-28 rounded-full dashboard-skeleton mb-3"></div>
                            <div className="h-8 w-64 rounded-xl dashboard-skeleton border border-[#E9DFD3] dark:border-gray-700"></div>
                        </div>
                        <div className="flex flex-col gap-4">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                {[0, 1, 2].map((item) => (
                                    <div key={item} className={`${cardHoverEffect} min-h-[162px]`}>
                                        <div className="h-4 w-32 rounded dashboard-skeleton mb-5"></div>
                                        <div className="h-16 rounded-2xl dashboard-skeleton"></div>
                                    </div>
                                ))}
                            </div>
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                                <div className={`lg:col-span-7 ${cardHoverEffect} min-h-[250px]`}>
                                    <div className="h-4 w-36 rounded dashboard-skeleton mb-4"></div>
                                    <div className="space-y-3">
                                        {[0, 1, 2].map((item) => <div key={item} className="h-12 rounded-xl dashboard-skeleton"></div>)}
                                    </div>
                                </div>
                                <div className={`lg:col-span-5 ${cardHoverEffect} min-h-[250px]`}>
                                    <div className="h-4 w-36 rounded dashboard-skeleton mb-4"></div>
                                    <div className="space-y-3">
                                        {[0, 1, 2].map((item) => <div key={item} className="h-12 rounded-xl dashboard-skeleton"></div>)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </>
        );
    }

    if (!plan) {
        return (
            <>
                <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-6">
                    <div className="relative w-full max-w-[640px] md:w-[60%]">
                        {/* Ambient Glow */}
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-56 h-56 bg-purple-300/20 blur-[80px] rounded-full pointer-events-none"></div>

                        <div className="relative bg-white dark:bg-gray-900 border border-[#E9DFD3]/80 dark:border-gray-700 rounded-[22px] shadow-[0_14px_40px_rgba(80,62,38,0.07)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.3)] px-8 py-8 text-center animate-fade-in-up">
                            {/* Brain Logo */}
                            <div className="w-16 h-16 mx-auto rounded-[20px] bg-purple-50 dark:bg-purple-900/30 border border-purple-100 dark:border-purple-800 shadow-[0_0_20px_rgba(147,51,234,0.1)] flex items-center justify-center animate-float mb-5">
                                <Brain className="w-8 h-8 text-purple-600" />
                            </div>

                            <h2 className="text-2xl md:text-3xl font-black tracking-tight text-gray-950 dark:text-gray-100">
                                Your Dashboard is Ready
                            </h2>

                            <p className="mt-3 text-sm md:text-base text-gray-500 dark:text-gray-400 leading-relaxed max-w-md mx-auto">
                                Create your first AI execution plan and FlowMind will
                                automatically organize your tasks, priorities,
                                habits, and insights.
                            </p>

                            <button
                                onClick={() => navigate("/planner")}
                                className="mt-6 inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl bg-purple-600 text-white text-sm font-bold shadow-lg shadow-purple-500/20 hover:-translate-y-0.5 hover:bg-purple-500 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2"
                            >
                                ✨ Create My First AI Plan
                            </button>

                            <p className="mt-2 text-[11px] font-bold text-gray-400 dark:text-gray-500 tracking-wide uppercase">
                                Takes less than 30 seconds
                            </p>

                            {/* Flow Preview */}
                            <div className="mt-8 flex flex-col md:flex-row items-center justify-center gap-2.5 md:gap-3">
                                {[
                                    { icon: "📝", title: "Describe Goal" },
                                    { icon: "🧠", title: "AI Plans Everything" },
                                    { icon: "🚀", title: "Start Executing" },
                                ].map((item, index, arr) => (
                                    <div key={item.title} className="flex flex-col md:flex-row items-center gap-2.5 md:gap-3">
                                        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FAF8F4] dark:bg-gray-800 border border-[#EFE5D9] dark:border-gray-700">
                                            <span className="text-base">{item.icon}</span>
                                            <span className="font-bold text-xs text-gray-700 dark:text-gray-300">{item.title}</span>
                                        </div>
                                        {index < arr.length - 1 && (
                                            <span className="text-gray-300 dark:text-gray-600 text-lg md:rotate-0 rotate-90 my-1 md:my-0">→</span>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Feature Chips */}
                            <div className="mt-7 flex flex-wrap justify-center gap-2">
                                {[
                                    "✓ Smart Planning",
                                    "✓ AI Coach",
                                    "✓ Live Tracking",
                                    "✓ Daily Habits",
                                ].map((chip) => (
                                    <span
                                        key={chip}
                                        className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-[#E9DFD3] dark:border-gray-700 text-[11px] font-bold text-gray-500 dark:text-gray-400 tracking-wide"
                                    >
                                        {chip}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <style>{`
                @keyframes dashboardRingPulse {
                    0% { transform: scale(1); opacity: 0.42; }
                    60% { transform: scale(1.1); opacity: 0; }
                    100% { transform: scale(1.1); opacity: 0; }
                }
                @keyframes dashboardCoachFade {
                    from { opacity: 0; transform: translateY(3px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .dashboard-ring-pulse {
                    animation: dashboardRingPulse 420ms ease-out 1;
                }
                @keyframes dashboardCalendarSlideNext {
                    from { opacity: 0; transform: translateX(12px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes dashboardCalendarSlidePrev {
                    from { opacity: 0; transform: translateX(-12px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                .dashboard-calendar-next {
                    animation: dashboardCalendarSlideNext 320ms cubic-bezier(0.22, 1, 0.36, 1) 1;
                }
                .dashboard-calendar-prev {
                    animation: dashboardCalendarSlidePrev 320ms cubic-bezier(0.22, 1, 0.36, 1) 1;
                }
                .dashboard-task-complete {
                    animation: dashboardCoachFade 280ms ease-out 1;
                }
                .dashboard-success-ring {
                    transition: stroke-dashoffset 1000ms cubic-bezier(0.34, 1.2, 0.64, 1);
                }
                .dashboard-coach-fade {
                    animation: dashboardCoachFade 360ms ease-out 1;
                }
                .dashboard-root button:focus-visible {
                    outline: 2px solid #C4B5FD;
                    outline-offset: 2px;
                }
                @media (prefers-reduced-motion: reduce) {
                    .dashboard-ring-pulse,
                    .dashboard-coach-fade {
                        animation: none;
                    }
                }
            `}</style>
            {toastMessage && (
                <div role="alert" aria-live="assertive" className="fixed top-6 left-1/2 -translate-x-1/2 z-[150] max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-6 py-3 rounded-xl shadow-xl border border-red-200 dark:border-red-800 flex items-center gap-3 animate-fade-in">
                    <span className="text-sm font-bold tracking-wide text-red-600">{toastMessage}</span>
                </div>
            )}

            <div className="dashboard-root relative min-h-screen bg-transparent text-gray-800 dark:text-gray-100 overflow-hidden font-sans pb-5">
                <div className="relative z-10 max-w-[1510px] mx-auto px-5 py-4 lg:px-7 lg:py-5">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 mt-0">
                        <div>
                            <h2 className="text-[#A09486] dark:text-gray-400 text-[11px] font-black uppercase tracking-[0.18em] mb-0.5">Good {timeOfDay}!</h2>
                            <h1 className="text-[28px] font-black tracking-tight text-gray-950 dark:text-gray-100 leading-tight">
                                {userName ? `Welcome Back, ${userName} 👋` : "Welcome Back 👋"}
                            </h1>
                            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mt-1.5 flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${syncStatus.tone === "syncing" ? "bg-amber-500 animate-pulse" : "bg-green-500"}`}></span>
                                {syncStatus.tone === "syncing" ? (
                                    <span className="text-amber-700 font-semibold">{syncStatus.label}</span>
                                ) : syncStatus.tone === "synced" ? (
                                    <span className="text-green-700 font-semibold">{syncStatus.label}</span>
                                ) : (
                                    <>
                                        <span className="text-gray-500 dark:text-gray-400">Last Synced:</span>
                                        <span className="text-gray-700 dark:text-gray-300 font-semibold">{syncStatus.label.replace("Last synced ", "")}</span>
                                    </>
                                )}
                            </p>
                        </div>

                        <div className="flex w-full flex-wrap items-center gap-2.5 mt-3 md:mt-0 md:w-auto">
                            <button
                                onClick={() => setShowSaveMyDay(true)}
                                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-purple-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-[0_8px_24px_rgba(147,51,234,0.25)] hover:bg-purple-500 transition-all active:scale-95"
                            >
                                <Zap className="w-3.5 h-3.5" />
                                Save My Day
                            </button>
                            <div className="min-w-0 max-w-full bg-white/95 dark:bg-gray-900/95 px-3.5 py-1.5 rounded-xl border border-[#E9DFD3] dark:border-gray-700 shadow-[0_8px_24px_rgba(80,62,38,0.06)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.2)] flex items-center gap-3">
                                <div className="flex items-center gap-1.5 text-gray-900 dark:text-gray-100 font-bold text-xs tracking-tight">
                                    <span className="text-sm text-purple-600">🕒</span>
                                    {currentTime}
                                </div>
                                <div className="w-px h-3.5 bg-gray-200 dark:bg-gray-700"></div>
                                <div className="truncate text-[10px] text-gray-500 dark:text-gray-400 font-extrabold uppercase tracking-wider">
                                    {currentDate}
                                </div>
                            </div>
                            <div role="status" className="flex items-center gap-1.5 bg-purple-50/90 dark:bg-purple-900/30 border border-purple-100 dark:border-purple-800 px-3 py-1.5 rounded-xl shadow-[0_8px_24px_rgba(80,62,38,0.04)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.15)] cursor-default">
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse ring-2 ring-purple-200"></span>
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-700">Realtime Ready</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-5">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                            <div className={`${cardHeroEffect} min-h-[172px] bg-gradient-to-br from-white to-red-50/30 dark:from-gray-900 dark:to-red-900/10 border-red-100/80 dark:border-red-900/50`}>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-gray-900 dark:text-gray-100 text-sm font-extrabold tracking-tight">Today's Focus</h3>
                                    <span role="img" aria-label="Highest priority active task" className="text-red-400/70 text-xs cursor-help">ⓘ</span>
                                </div>
                                <h2 className="text-lg font-black tracking-tight text-gray-950 dark:text-gray-100 line-clamp-2 leading-snug">
                                    {focusTask?.title || (onlyRepeatingHabitsRemain ? "Great work. Keep your streak alive." : "You're all caught up.")}
                                </h2>
                                <div className="mt-auto pt-4 flex flex-col items-start justify-between gap-3 xl:flex-row xl:items-center">
                                    {focusTask ? (
                                        <>
                                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                <span className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-white dark:bg-gray-800 text-red-600 border border-red-100 dark:border-red-800 shadow-[0_6px_16px_rgba(239,68,68,0.08)] dark:shadow-[0_4px_12px_rgba(239,68,68,0.15)]">
                                                    {focusTask.deadlineDays !== null ? `${focusTask.deadlineDays} Days Left` : "No Deadline"}
                                                </span>
                                                <span className={`px-2.5 py-1 rounded-lg text-[11px] font-black border uppercase tracking-wider ${getPriorityBadgeStyles(focusTask.priority)}`}>
                                                    {focusTask.priority}
                                                </span>
                                                {focusTask.estimatedTime && (
                                                    <span className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-gray-700">
                                                        {focusTask.estimatedTime}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <button type="button" onClick={() => navigate("/tasks")} className="text-[10px] font-black uppercase tracking-[0.18em] text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-full px-2.5 py-1 transition-all duration-200 hover:-translate-y-0.5 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300">
                                                    Start Focus
                                                </button>
                                                <button type="button" onClick={() => navigate("/tasks")} className="text-[10px] font-black uppercase tracking-[0.18em] text-purple-600 bg-purple-50 dark:bg-purple-900/30 border border-purple-100 dark:border-purple-800 rounded-full px-2.5 py-1 transition-all duration-200 hover:-translate-y-0.5 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300">
                                                    View Full Plan
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <button type="button" onClick={() => navigate("/tasks")} className="text-[10px] font-black uppercase tracking-[0.18em] text-purple-600 bg-purple-50 dark:bg-purple-900/30 border border-purple-100 dark:border-purple-800 rounded-full px-2.5 py-1 transition-all duration-200 hover:-translate-y-0.5 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300">
                                            View Full Plan
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className={`${cardHeroEffect} min-h-[172px]`}>
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-gray-900 dark:text-gray-100 text-sm font-extrabold tracking-tight">Success Chance</h3>
                                    <span role="img" aria-label="Derived from live task progress" className="text-gray-400 dark:text-gray-500 text-xs cursor-help">ⓘ</span>
                                </div>
                                <div className="flex items-center justify-center gap-4 my-auto py-2">
                                    <div className="relative w-[108px] h-[108px] flex items-center justify-center shrink-0">
                                        <div className="absolute inset-[10px] rounded-full bg-white dark:bg-gray-800 shadow-inner z-10" />
                                        <svg aria-hidden="true" className="transform -rotate-90 w-full h-full relative z-20" style={{ filter: `drop-shadow(0 0 8px ${confidenceMeta.hex}30)` }}>
                                            <circle cx="54" cy="54" r={ringRadius} stroke="currentColor" strokeWidth="8" fill="transparent" className="text-gray-100 dark:text-gray-700" />
                                            <circle
                                                cx="54"
                                                cy="54"
                                                r={ringRadius}
                                                stroke={confidenceMeta.hex}
                                                strokeWidth="8"
                                                fill="transparent"
                                                strokeDasharray={ringCircumference}
                                                strokeDashoffset={ringOffset}
                                                strokeLinecap="round"
                                                className="dashboard-success-ring"
                                            />
                                        </svg>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center z-30 pointer-events-none">
                                            <span className={`text-xl font-black leading-none transition-all duration-500 ${confidenceMeta.textColor}`}>{displayScore}%</span>
                                            <span className={`text-[8px] font-black tracking-widest px-1.5 py-0.5 rounded border mt-1 ${confidenceMeta.badgeColor}`}>
                                                {confidenceMeta.badge}
                                            </span>
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold leading-relaxed max-w-[140px]">{confidenceMeta.text}</p>
                                </div>
                            </div>

                            <div className={`${cardHoverEffect} min-h-[172px]`}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-full bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center text-base border border-purple-100 dark:border-purple-800 shadow-2xs">🤖</div>
                                        <div>
                                            <h3 className="text-gray-900 dark:text-gray-100 text-sm font-extrabold flex items-center gap-1.5 leading-none">
                                                AI Coach <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></span>
                                            </h3>
                                            <span className="text-[9px] text-gray-400 dark:text-gray-500 font-extrabold tracking-wider uppercase mt-0.5 block">From Firebase</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-[#F7F2FF] dark:bg-purple-900/20 p-3 rounded-xl border border-purple-100 dark:border-purple-800 my-auto flex items-center min-h-[74px]">
                                    <CoachMessage message={aiCoachMessage} />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                            <div className={`lg:col-span-7 ${cardHoverEffect} min-h-[260px]`}>
                                <div className="flex items-center justify-between mb-2.5">
                                    <h3 className="text-gray-900 dark:text-gray-100 text-base font-bold flex items-center gap-2">🎯 Today's Tasks</h3>
                                    <button type="button" onClick={() => navigate("/tasks")} className="px-2.5 py-1 bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-lg font-bold tracking-wide text-[10px] transition-all duration-200 flex items-center gap-1.5">
                                        📋 View Full Plan
                                    </button>
                                </div>

                                {totalTaskCount > 0 && (
                                    <div className="mb-3 rounded-xl bg-[#FAF8F4] dark:bg-gray-800 border border-[#EFE5D9] dark:border-gray-700 px-3 py-2">
                                        <div className="flex justify-between items-center mb-1.5">
                                            <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Task Progress</span>
                                            <span className="text-xs font-bold text-green-600">{completedTaskCount} / {totalTaskCount} Completed</span>
                                        </div>
                                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1">
                                            <div className={`${confidenceMeta.color} h-1 rounded-full transition-all duration-700 ease-out`} style={{ width: `${progressPercentage}%` }}></div>
                                        </div>
                                    </div>
                                )}

                                <form onSubmit={handleQuickAdd} className="flex gap-2 mb-3">
                                    <input
                                        type="text"
                                        data-quick-add
                                        value={quickAddInput}
                                        onChange={(e) => setQuickAddInput(e.target.value)}
                                        placeholder="Quick add a task..."
                                        className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs font-semibold text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-500/10 transition-all"
                                    />
                                    <button
                                        type="submit"
                                        disabled={!quickAddInput.trim()}
                                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                                    >
                                        Add
                                    </button>
                                </form>

                                {todayTasks.length > 0 ? (
                                    <div className="space-y-2 flex-1 flex flex-col justify-center">
                                        {todayTasks.map((task) => (
                                            <div
                                                key={task.id}
                                                className={`flex items-center gap-3 px-3 py-2.5 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-[0_4px_14px_rgba(80,62,38,0.04)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.2)] transition-all duration-300 group hover:border-purple-100 dark:hover:border-purple-800 hover:shadow-[0_8px_22px_rgba(80,62,38,0.07)] dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.25)] ${syncingTaskId === task.id ? "dashboard-task-complete opacity-70" : ""}`}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => handleCompleteTask(task.id)}
                                                    disabled={syncingTaskId === task.id}
                                                    className="w-3.5 h-3.5 border border-gray-300 dark:border-gray-600 rounded cursor-pointer transition-all duration-200 disabled:cursor-wait disabled:opacity-60 hover:border-green-500 hover:scale-110 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-300 focus-visible:ring-offset-2"
                                                    aria-label={`Complete ${task.title}`}
                                                />
                                                <span className="text-xs font-bold transition-all duration-200 flex-1 text-gray-800 dark:text-gray-200 truncate">{task.title}</span>
                                                <span className={`hidden sm:inline-block px-1.5 py-0.5 border text-[9px] font-extrabold rounded uppercase ${getPriorityBadgeStyles(task.priority)}`}>
                                                    {task.priority}
                                                </span>
                                                <span className="hidden sm:inline-block px-1.5 py-0.5 bg-gray-50 dark:bg-gray-700 text-gray-400 dark:text-gray-400 border border-gray-100 dark:border-gray-600 text-[9px] font-extrabold rounded uppercase">
                                                    {task.estimatedTime || "No estimate"}
                                                </span>
                                                {task.isRepeating && (
                                                    <span className="px-1.5 py-0.5 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-800 text-[9px] font-extrabold rounded uppercase">
                                                        {task.currentCount}/{task.targetCount || "?"}
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 border-dashed p-6">
                                        <p className="text-xs text-gray-400 dark:text-gray-500 font-bold">
                                            {onlyRepeatingHabitsRemain ? "🌱 Great work. Keep your streak alive." : "You're all caught up."}
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className={`lg:col-span-5 ${cardHoverEffect} min-h-[260px]`}>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-900/30 border border-purple-100 dark:border-purple-800 text-purple-600 flex items-center justify-center">
                                            <CalendarDays className="w-4 h-4" aria-hidden="true" />
                                        </span>
                                        <div>
                                            <h3 className="text-gray-900 dark:text-gray-100 text-sm font-black leading-tight">Smart Calendar</h3>
                                            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">{calendarMeta.label}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => shiftCalendarMonth(-1)}
                                            className="w-7 h-7 rounded-lg border border-[#EFE5D9] dark:border-gray-700 bg-[#FAF8F4] dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-purple-600 hover:border-purple-100 dark:hover:text-purple-400 dark:hover:border-purple-700 transition-all duration-200 active:scale-95 flex items-center justify-center"
                                            aria-label="Previous month"
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => shiftCalendarMonth(1)}
                                            className="w-7 h-7 rounded-lg border border-[#EFE5D9] dark:border-gray-700 bg-[#FAF8F4] dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-purple-600 hover:border-purple-100 dark:hover:text-purple-400 dark:hover:border-purple-700 transition-all duration-200 active:scale-95 flex items-center justify-center"
                                            aria-label="Next month"
                                        >
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                        <span className="rounded-full border border-orange-100 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 px-2.5 py-1 text-[10px] font-black text-orange-600 dark:text-orange-400 ml-1">
                                            🔥 {currentStreak} day streak
                                        </span>
                                    </div>
                                </div>

                                <div className={`grid grid-cols-7 gap-x-1 gap-y-0.5 flex-1 ${calendarTransition}`}>
                                    {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
                                        <span key={`${day}-${index}`} className="h-5 text-center text-[9px] font-black text-gray-400 dark:text-gray-500">
                                            {day}
                                        </span>
                                    ))}
                                    {calendarMeta.days.map((day, index) => {
                                        const isToday = day !== null && day === calendarMeta.today;
                                        const hasDeadline = day !== null && calendarMeta.deadlineDays.has(day);
                                        const isCompleted = day !== null && calendarMeta.completedDays.has(day);
                                        const isSelected = day !== null && day === selectedCalendarDay;
                                        return (
                                            <div key={index} className="relative h-7 flex items-center justify-center">
                                                {day !== null && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedCalendarDay(day)}
                                                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold transition-all duration-200 ${
                                                            isToday
                                                                ? "bg-purple-600 text-white shadow-[0_5px_14px_rgba(147,51,234,0.28)]"
                                                                : isSelected
                                                                    ? "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 ring-2 ring-purple-200 dark:ring-purple-700"
                                                                    : isCompleted
                                                                        ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-100 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/30"
                                                                        : hasDeadline
                                                                            ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30"
                                                                            : "text-gray-600 dark:text-gray-400 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                                                        }`}
                                                        aria-label={`${calendarMeta.label} day ${day}`}
                                                    >
                                                        {day}
                                                    </button>
                                                )}
                                                {hasDeadline && !isToday && (
                                                    <span className="absolute bottom-0 w-1 h-1 rounded-full bg-red-500 pointer-events-none"></span>
                                                )}
                                                {isCompleted && !isToday && (
                                                    <span className="absolute top-0 right-0.5 w-1 h-1 rounded-full bg-green-500 pointer-events-none"></span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="mt-3 flex items-center justify-between border-t border-[#EFE5D9] dark:border-gray-700 pt-2.5">
                                    <div className="flex items-center gap-3">
                                        <span className="flex items-center gap-1.5 text-[9px] font-bold text-gray-400 dark:text-gray-500">
                                            <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                            Deadline
                                        </span>
                                        <span className="flex items-center gap-1.5 text-[9px] font-bold text-gray-400 dark:text-gray-500">
                                            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                            Completed
                                        </span>
                                    </div>
                                    <span className="text-[10px] font-black text-green-600">{completedTodayCount} today</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                            <div className={`lg:col-span-7 ${cardHoverEffect} min-h-[260px]`}>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-gray-900 dark:text-gray-100 text-sm font-bold flex items-center gap-1.5">⏳ Upcoming Deadlines</h3>
                                    <button type="button" className="text-purple-600 text-[11px] font-bold hover:underline" onClick={() => navigate("/tasks")}>View All</button>
                                </div>
                                <div className="space-y-2.5 flex-1 flex flex-col justify-center">
                                    {upcomingDeadlines.length > 0 ? upcomingDeadlines.map((item) => {
                                        const dateData = getFutureDate(item.deadlineDays);
                                        return (
                                            <div key={item.id} className="p-3.5 bg-[#FFFCF8] dark:bg-gray-800 rounded-2xl border border-[#EFE5D9] dark:border-gray-700 hover:border-purple-100 dark:hover:border-purple-700 transition-colors shadow-[0_8px_24px_rgba(80,62,38,0.04)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.2)]">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex flex-col items-center justify-center w-12 h-12 bg-white dark:bg-gray-900 rounded-xl border border-red-100 dark:border-red-800 text-gray-900 dark:text-gray-100 shrink-0 shadow-[0_8px_20px_rgba(239,68,68,0.06)] dark:shadow-[0_4px_12px_rgba(239,68,68,0.15)]">
                                                        <span className="text-[8px] font-black uppercase text-red-400">{dateData.month}</span>
                                                        <span className="text-lg font-black leading-none mt-0.5">{dateData.day}</span>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="text-sm font-black text-gray-950 dark:text-gray-100 truncate">{item.title}</h4>
                                                        <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 mt-0.5">{item.priority} priority</p>
                                                    </div>
                                                    <div className="w-20 shrink-0 sm:w-[170px]">
                                                        <p className={`text-[11px] font-black text-right ${getDeadlineStackStyles(item.deadlineDays)}`}>
                                                            {item.deadlineDays} {item.deadlineDays === 1 ? "Day" : "Days"} Left
                                                        </p>
                                                        <div className="mt-2 w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                                                            <div className={`h-1.5 rounded-full ${getDeadlineBarStyles(item.deadlineDays)}`} style={{ width: `${Math.max(18, 100 - Math.min(100, item.deadlineDays * 10))}%` }}></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }) : (
                                    <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 border-dashed p-6">
                                            <p className="text-xs text-gray-400 dark:text-gray-500 font-bold">No upcoming deadlines.</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className={`lg:col-span-5 ${cardHoverEffect} min-h-[260px]`}>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-gray-900 dark:text-gray-100 text-base font-bold flex items-center gap-2">✅ Completed Today</h3>
                                    <span className="text-purple-600 text-[11px] font-bold">{completedTodayCount}</span>
                                </div>
                                <div className="relative pl-2 flex-1 flex flex-col justify-around space-y-2.5 my-1">
                                    <div className="absolute top-2 bottom-2 left-3 w-px bg-gray-100 dark:bg-gray-700"></div>
                                    {completedToday.slice(0, 5).map((item) => (
                                        <div key={item.id} className="relative flex items-center gap-3.5 z-10">
                                            <div className="w-2 h-2 rounded-full ring-[5px] ring-white dark:ring-gray-900 shrink-0 bg-green-500"></div>
                                            <div className="flex-1 flex justify-between items-center bg-white dark:bg-gray-800 rounded min-w-0 gap-2">
                                                <span className="text-xs font-bold truncate transition-colors text-gray-400 dark:text-gray-500 line-through font-medium">{item.title}</span>
                                                <span className="text-[9px] font-black px-2 py-1 rounded-md uppercase tracking-wider shrink-0 min-w-[78px] text-center bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400">Done</span>
                                            </div>
                                        </div>
                                    ))}
                                    {completedToday.length === 0 && (
                                        <div className="flex items-center justify-center rounded-xl border border-dashed border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-6">
                                            <p className="text-xs text-gray-400 dark:text-gray-500 font-bold">No tasks completed today yet.</p>
                                        </div>
                                    )}
                                </div>
                                <button type="button" onClick={() => navigate("/tasks")} className="w-full mt-3 py-2 bg-[#FAF8F4] dark:bg-gray-800 hover:bg-purple-50 dark:hover:bg-purple-900/20 text-gray-700 dark:text-gray-300 hover:text-purple-700 dark:hover:text-purple-400 rounded-xl font-bold text-[11px] transition-colors flex items-center justify-center gap-1 shrink-0">
                                    View Full Plan →
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Recovery Prompt */}
            {recoveryPrompt && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[160] max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-900 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.4)] border border-amber-200 dark:border-amber-800 p-5 animate-fade-in-up">
                    <div className="flex items-start gap-3">
                        <span className="text-2xl">⚠️</span>
                        <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-black text-gray-900 dark:text-gray-100 mb-1">Confidence Dropped to {recoveryPrompt.score}%</h4>
                            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{recoveryPrompt.message}</p>
                            <div className="flex items-center gap-2 mt-3">
                                <button
                                    onClick={() => { setShowSaveMyDay(true); setRecoveryPrompt(null); }}
                                    className="px-4 py-1.5 bg-purple-600 text-white rounded-lg text-[11px] font-bold shadow-sm hover:bg-purple-500 transition-all active:scale-95"
                                >
                                    Save My Day
                                </button>
                                <button
                                    onClick={() => setRecoveryPrompt(null)}
                                    className="px-4 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-[11px] font-bold transition-colors"
                                >
                                    Dismiss
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Save My Day Modal */}
            {showSaveMyDay && (
                <SaveMyDayModal
                    plan={plan}
                    onClose={() => setShowSaveMyDay(false)}
                    onApply={handleApplyTriage}
                />
            )}
        </>
    );
}

export default Dashboard;
