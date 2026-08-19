// src/pages/TaskBoard.jsx
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { recordTaskCompletionStreak } from "../services/authService";
import { useAuth } from "../hooks/useAuth";
import { usePlan } from "../hooks/usePlan";
import { getDisplayName, getProductivityStreak } from "../utils/dashboardMetrics";

// Helper: Convert "4 Hours" or "30 Min" into a comparable numeric hour value
const parseDuration = (timeStr) => {
    if (!timeStr) return 0;
    const lower = timeStr.toLowerCase();
    let val = parseFloat(timeStr) || 0;
    if (lower.includes('min')) return val / 60;
    return val;
};

const getFocusSeconds = (timeStr) => {
    const hours = parseDuration(timeStr);
    return Math.max(60, Math.round(hours * 60 * 60));
};

const formatTimer = (seconds) => {
    const safeSeconds = Math.max(0, seconds || 0);
    const hrs = Math.floor(safeSeconds / 3600);
    const mins = Math.floor((safeSeconds % 3600) / 60);
    const secs = safeSeconds % 60;
    const pad = (value) => String(value).padStart(2, "0");
    return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
};

const getTodayKey = () => new Date().toLocaleDateString("en-CA");

// Priority Weights for Smart Sorting
const priorityWeights = { HIGH: 3, MEDIUM: 2, LOW: 1 };

// Premium Smart Motivation Engine
const getSmartMotivation = (taskText) => {
    const text = (taskText || "").toLowerCase();
    if (text.match(/study|dsa|read|learn|book|course|academic/)) return "One focused session beats hours of distraction.";
    if (text.match(/workout|gym|run|walk|water|health|exercise/)) return "Your future self will thank you.";
    if (text.match(/call|email|apply|resume|internship|placement|job/)) return "Small applications create big opportunities.";
    if (text.match(/code|project|frontend|backend|build|design/)) return "One block at a time. Small pushes ship products.";
    return "Small progress today beats last-minute stress.";
};

// Heuristic to detect and augment repeating tasks if missing
const augmentTaskRepeating = (task) => {
    if (task.isRepeating !== undefined) return task;
    const text = task.title.toLowerCase();
    let isRepeating = false;
    let targetCount = 1;
    
    if (text.includes("water")) { isRepeating = true; targetCount = 8; }
    else if (/\b(gym|workout|exercise|meditate|meditation|read|walk|run|habit)\b/.test(text)) { isRepeating = true; targetCount = 1; }
    else if (task.type === "Daily Habit") { isRepeating = true; targetCount = 1; }

    if (isRepeating) {
        return { ...task, isRepeating, targetCount, currentCount: task.currentCount || 0 };
    }
    return task;
};

const normalizeTask = (task, index) => {
    const source = typeof task === "string" ? { title: task } : (task || {});
    const deadlineValue = source.deadlineDays ?? source.daysRemaining;
    const todayKey = getTodayKey();
    const isRepeating = Boolean(source.isRepeating);
    const lastProgressDate = source.lastProgressDate || source.completedDate;
    const shouldResetHabit = isRepeating && lastProgressDate && lastProgressDate !== todayKey;
    const status = shouldResetHabit ? "To Do" : (source.status || (source.completed ? "Completed" : "To Do"));

    return augmentTaskRepeating({
        ...source,
        id: source.id ?? `today-${index}`,
        title: source.title || source.task || "Untitled task",
        priority: source.priority || "MEDIUM",
        deadlineDays: Number.isFinite(Number(deadlineValue)) ? Number(deadlineValue) : 1,
        estimatedTime: source.estimatedTime || source.duration || source.timeEstimate || "1 Hour",
        timeBlock: source.timeBlock || "Focus Block",
        category: source.category || "FlowMind Plan",
        status,
        completed: shouldResetHabit ? false : source.completed,
        currentCount: shouldResetHabit ? 0 : source.currentCount,
        lastProgressDate: shouldResetHabit ? todayKey : source.lastProgressDate,
    });
};

const getPlanTasks = (plan) => {
    if (Array.isArray(plan?.taskBoardTasks)) return plan.taskBoardTasks.map(normalizeTask);
    if (Array.isArray(plan?.todayPlan)) return plan.todayPlan.map(normalizeTask);
    if (Array.isArray(plan?.strictlyDoToday)) return plan.strictlyDoToday.map(normalizeTask);
    return [];
};

function TaskBoard() {
    // =====================================
    // FLOWMIND AI EXECUTION WORKSPACE
    // Status: ✅ PASS 4 - PRODUCTION LOCKED 🔒
    // =====================================

    // Core States
    const [error, setError] = useState(null);
    const [localTasks, setLocalTasks] = useState(null);
    
    // UI Interaction States
    const [completedExpanded, setCompletedExpanded] = useState(false);
    const [focusedTaskId, setFocusedTaskId] = useState(null);
    const [activeNoteContent, setActiveNoteContent] = useState("");
    const [notesSaved, setNotesSaved] = useState(false);
    const [completingId, setCompletingId] = useState(null);
    const [focusTimer, setFocusTimer] = useState(null);
    
    // Toast & Celebration States
    const [celebration, setCelebration] = useState(null);
    const [deletedTaskInfo, setDeletedTaskInfo] = useState(null);
    const deleteTimeoutRef = useRef(null);
    const { user, profile, updateProfileStats } = useAuth();
    const { plan, loadingPlan: isLoading, syncTasks } = usePlan();

    const planTasks = useMemo(() => (plan ? getPlanTasks(plan) : []), [plan]);
    const tasks = localTasks ?? planTasks;

    useEffect(() => {
        if (!focusTimer?.isRunning || focusTimer.remainingSeconds <= 0) return undefined;

        const intervalId = setInterval(() => {
            setFocusTimer((timer) => {
                if (!timer?.isRunning) return timer;
                const nextRemaining = Math.max(0, timer.remainingSeconds - 1);
                return {
                    ...timer,
                    remainingSeconds: nextRemaining,
                    isRunning: nextRemaining > 0,
                    expired: nextRemaining === 0,
                };
            });
        }, 1000);

        return () => clearInterval(intervalId);
    }, [focusTimer?.isRunning, focusTimer?.remainingSeconds]);

    // =====================================
    // GLOBAL SYNC ENGINE
    // =====================================
    const syncPlanUpdates = useCallback(async (updatedTasks) => {
        try {
            await syncTasks(updatedTasks);
            setLocalTasks(null);
        } catch (err) {
            console.error("Failed to sync plan updates to cloud", err);
            setError("Task sync failed. Please try again.");
        }
    }, [syncTasks]);

    // =====================================
    // OPTIMISTIC MUTATION & FOCUS HANDLERS
    // =====================================
    const triggerCelebration = useCallback(() => {
        setCelebration("🔥 Great progress! Keep going.");
        setTimeout(() => setCelebration(null), 3000);
    }, []);

    const handleCompleteWithAnimation = useCallback((taskId) => {
        setCompletingId(taskId);
        
        // CSS glow & collapse animation timeout
        setTimeout(() => {
            setCompletingId(null);
            setLocalTasks(prev => {
                const updated = prev.map(t => {
                    if (t.id === taskId) {
                        return {
                            ...t,
                            status: "Completed",
                            completed: true,
                            completedAt: new Date().toISOString(),
                            completedDate: getTodayKey(),
                            lastProgressDate: getTodayKey(),
                            currentCount: t.targetCount || t.currentCount,
                        };
                    }
                    return t;
                });
                syncPlanUpdates(updated);
                return updated;
            });
            triggerCelebration();

            if (user?.uid) {
                recordTaskCompletionStreak(user.uid, profile?.stats || {})
                    .then((nextStats) => updateProfileStats(nextStats))
                    .catch((err) => console.error("Failed to update productivity streak", err));
            }
            
            if (focusedTaskId === taskId) {
                setFocusedTaskId(null);
            }
            setFocusTimer((timer) => timer?.taskId === taskId ? null : timer);
        }, 400);
    }, [focusedTaskId, syncPlanUpdates, triggerCelebration, user, profile, updateProfileStats]);

    const handleUndoComplete = useCallback((taskId) => {
        setLocalTasks(prev => {
            const updated = prev.map(t => {
                if (t.id !== taskId) return t;
                return {
                    ...t,
                    status: "To Do",
                    completed: false,
                    completedAt: undefined,
                    completedDate: undefined,
                    currentCount: t.isRepeating ? 0 : t.currentCount,
                };
            });
            syncPlanUpdates(updated);
            return updated;
        });
    }, [syncPlanUpdates]);

    const handleIncrementRepeating = useCallback((taskId) => {
        setLocalTasks(prev => {
            let shouldComplete = false;
            const updated = prev.map(t => {
                if (t.id === taskId) {
                    const nextCount = (t.currentCount || 0) + 1;
                    if (nextCount >= t.targetCount) {
                        shouldComplete = true;
                    }
                    return { ...t, currentCount: nextCount, lastProgressDate: getTodayKey() };
                }
                return t;
            });
            
            if (shouldComplete) {
                setTimeout(() => handleCompleteWithAnimation(taskId), 250);
            } else {
                syncPlanUpdates(updated);
            }
            return updated;
        });
    }, [handleCompleteWithAnimation, syncPlanUpdates]);

    const handleDeleteTask = useCallback((task) => {
        // Optimistic Remove
        const previousTasks = [...tasks];
        const updatedTasks = tasks.filter(t => t.id !== task.id);
        setLocalTasks(updatedTasks);
        
        if (focusedTaskId === task.id) setFocusedTaskId(null);

        // Modern Undo Toast Setup
        setDeletedTaskInfo({ task, previousTasks });
        if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
        
        deleteTimeoutRef.current = setTimeout(() => {
            setDeletedTaskInfo(null);
            syncPlanUpdates(updatedTasks);
        }, 5000);
    }, [tasks, focusedTaskId, syncPlanUpdates]);

    const handleUndoDelete = useCallback(() => {
        if (!deletedTaskInfo) return;
        if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
        setLocalTasks(deletedTaskInfo.previousTasks);
        setDeletedTaskInfo(null);
    }, [deletedTaskInfo]);

    const handleDismissDelete = useCallback(() => {
        if (!deletedTaskInfo) return;
        if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
        syncPlanUpdates(tasks);
        setDeletedTaskInfo(null);
    }, [deletedTaskInfo, syncPlanUpdates, tasks]);

    // Focus & Notes Handlers
    const handleToggleFocus = useCallback((task) => {
        if (focusedTaskId === task.id) {
            setFocusedTaskId(null);
            setFocusTimer((timer) => timer?.taskId === task.id ? null : timer);
            const updated = tasks.map(t => t.id === task.id ? { ...t, notes: activeNoteContent } : t);
            setLocalTasks(updated);
            syncPlanUpdates(updated);
        } else {
            if (focusedTaskId) {
                const currentTasks = tasks.map(t => t.id === focusedTaskId ? { ...t, notes: activeNoteContent } : t);
                setLocalTasks(currentTasks);
                syncPlanUpdates(currentTasks);
            }
            setFocusedTaskId(task.id);
            setActiveNoteContent(task.notes || "");
            setNotesSaved(false);
            const totalSeconds = getFocusSeconds(task.estimatedTime);
            setFocusTimer({
                taskId: task.id,
                totalSeconds,
                remainingSeconds: totalSeconds,
                isRunning: true,
                expired: false,
            });
        }
    }, [focusedTaskId, tasks, activeNoteContent, syncPlanUpdates]);

    const handleAddFocusTime = useCallback((minutes) => {
        setFocusTimer((timer) => {
            if (!timer) return timer;
            const addedSeconds = minutes * 60;
            return {
                ...timer,
                totalSeconds: timer.totalSeconds + addedSeconds,
                remainingSeconds: timer.remainingSeconds + addedSeconds,
                isRunning: true,
                expired: false,
            };
        });
    }, []);

    const handleNotesChange = (e) => setActiveNoteContent(e.target.value);

    const handleNotesBlur = useCallback(() => {
        if (!focusedTaskId) return;
        const updated = tasks.map(t => t.id === focusedTaskId ? { ...t, notes: activeNoteContent } : t);
        setLocalTasks(updated);
        syncPlanUpdates(updated);
        setNotesSaved(true);
        setTimeout(() => setNotesSaved(false), 2000);
    }, [focusedTaskId, activeNoteContent, tasks, syncPlanUpdates]);

    // =====================================
    // SMART SORTING & DERIVED STATE
    // =====================================
    const activeTasks = useMemo(() => {
        return tasks
            .filter(t => t.status !== "Completed")
            .sort((a, b) => {
                const pA = priorityWeights[a.priority?.toUpperCase()] || 0;
                const pB = priorityWeights[b.priority?.toUpperCase()] || 0;
                if (pA !== pB) return pB - pA; 

                const dA = a.deadlineDays || 0;
                const dB = b.deadlineDays || 0;
                if (dA !== dB) return dA - dB;

                const durA = parseDuration(a.estimatedTime);
                const durB = parseDuration(b.estimatedTime);
                if (durA !== durB) return durA - durB;

                return (a.id || 0) - (b.id || 0);
            });
    }, [tasks]);

    const completedTasksList = useMemo(() => tasks.filter(t => t.status === "Completed"), [tasks]);
    const upcomingTasks = useMemo(() => [...activeTasks].sort((a, b) => (a.deadlineDays || 0) - (b.deadlineDays || 0)).slice(0, 4), [activeTasks]);

    // Header Metrics
    const totalTasksCount = activeTasks.length + completedTasksList.length;
    const completedCount = completedTasksList.length;
    const progressPercent = totalTasksCount === 0 ? 0 : Math.round((completedCount / totalTasksCount) * 100);
    const isOnlyRepeatingLeft = activeTasks.length > 0 && activeTasks.every(t => t.isRepeating);
    const currentStreak = useMemo(() => getProductivityStreak(profile, plan), [profile, plan]);
    const userName = getDisplayName(profile, user);
    const currentHour = new Date().getHours();
    const timeOfDay = currentHour < 12 ? "Morning" : currentHour < 18 ? "Afternoon" : currentHour < 22 ? "Evening" : "Night";

    // Styling Helpers
    const getPriorityStyles = useCallback((priority) => {
        const p = (priority || "MEDIUM").toUpperCase();
        if (p === "HIGH") return "bg-red-50 text-red-600 border-red-100";
        if (p === "MEDIUM") return "bg-amber-50 text-amber-600 border-amber-100";
        return "bg-green-50 text-green-600 border-green-100";
    }, []);

    const getDeadlineColor = useCallback((days) => {
        if (days <= 2) return "text-red-500 font-bold";
        if (days <= 7) return "text-amber-500 font-bold";
        return "text-green-500";
    }, []);

    const ringRadius = 14;
    const ringCircumference = 2 * Math.PI * ringRadius;
    const ringOffset = ringCircumference - (progressPercent / 100) * ringCircumference;

    /* Future Hooks Prepped:
       [ ] Focus Timer Integration 
       [ ] Dashboard Repeating Progress Sync 
       [ ] File Attachments Component 
       [ ] Subtasks Engine
    */

    return (
        <>
            <style>{`
                html { scroll-behavior: smooth; }
                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: #E9DFD3; border-radius: 10px; }
                ::-webkit-scrollbar-thumb:hover { background: #D6C6FF; }

                @keyframes shimmer {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }
                .skeleton-shimmer {
                    background: linear-gradient(90deg, #F3EBE1 25%, #FFFDFB 50%, #F3EBE1 75%);
                    background-size: 200% 100%;
                    animation: shimmer 1.6s infinite linear;
                }
                @keyframes slideUpFade {
                    0% { opacity: 0; transform: translateY(10px); }
                    100% { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in-up { animation: slideUpFade 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                @keyframes hourglassTurn {
                    0%, 22% { transform: rotate(0deg) scale(1); }
                    30%, 70% { transform: rotate(180deg) scale(1.06); }
                    78%, 100% { transform: rotate(360deg) scale(1); }
                }
                @keyframes timerGlow {
                    0%, 100% { box-shadow: 0 18px 45px rgba(147, 51, 234, 0.16); }
                    50% { box-shadow: 0 18px 58px rgba(34, 197, 94, 0.18); }
                }
                .focus-hourglass { animation: hourglassTurn 2.4s ease-in-out infinite; transform-origin: center; }
                .focus-timer-card { animation: timerGlow 2.8s ease-in-out infinite; }
            `}</style>
            
            <div className="relative min-h-screen bg-transparent text-gray-800 font-sans pb-16">
                
                {/* Background Ambient Blobs */}
                <div className="pointer-events-none absolute top-0 right-0 w-[600px] h-[600px] bg-[#D6C6FF] rounded-full filter blur-[120px] opacity-[0.12] z-0"></div>
                <div className="pointer-events-none absolute bottom-0 left-0 w-[600px] h-[600px] bg-[#A7F3D0] rounded-full filter blur-[120px] opacity-[0.12] z-0"></div>

                {/* CELEBRATION TOAST */}
                {celebration && (
                    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[150] bg-white text-gray-900 px-6 py-3 rounded-xl shadow-[0_10px_40px_rgba(34,197,94,0.2)] border border-green-200 animate-fade-in-up flex items-center gap-3">
                        <span className="text-sm font-bold tracking-wide text-green-600">{celebration}</span>
                    </div>
                )}

                {/* UNDO DELETE TOAST (POLISHED) */}
                {deletedTaskInfo && (
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[150] bg-gray-900 text-white px-5 py-3 rounded-xl shadow-2xl animate-fade-in-up flex items-center gap-6">
                        <span className="text-sm font-semibold text-gray-200">Task deleted</span>
                        <div className="flex items-center gap-3 border-l border-gray-700 pl-3">
                            <button 
                                onClick={handleUndoDelete}
                                className="text-xs font-black text-purple-400 hover:text-purple-300 transition-colors uppercase tracking-wider focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 rounded"
                            >
                                Undo
                            </button>
                            <button 
                                onClick={handleDismissDelete}
                                className="text-xs font-bold text-gray-400 hover:text-gray-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 rounded px-1"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                )}

                <div className="relative z-10 max-w-[1510px] mx-auto px-5 py-6 lg:px-7 lg:py-8 w-full animate-fade-in-up">
                    
                    {/* =====================================
                        HERO SECTION
                    ===================================== */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                        <div>
                            <h2 className="text-[#A09486] text-[11px] font-black uppercase tracking-[0.18em] mb-1">
                                Good {timeOfDay}{userName ? `, ${userName}` : ""}
                            </h2>
                            <h1 className="text-4xl font-black tracking-tight text-gray-950 leading-tight">Today's Execution</h1>
                            <p className="text-sm font-medium text-gray-500 mt-1">Focus on what matters most today. Complete one meaningful task at a time.</p>
                        </div>
                        
                        <div className="flex items-center gap-3 bg-white/95 px-4 py-3 rounded-[18px] border border-[#E9DFD3] shadow-[0_8px_24px_rgba(80,62,38,0.04)]">
                            <div className="relative w-9 h-9 flex items-center justify-center shrink-0">
                                <svg className="transform -rotate-90 w-full h-full drop-shadow-sm">
                                    <circle cx="18" cy="18" r={ringRadius} stroke="currentColor" strokeWidth="3" fill="transparent" className="text-gray-100" />
                                    <circle cx="18" cy="18" r={ringRadius} stroke="currentColor" strokeWidth="3" fill="transparent" strokeDasharray={ringCircumference} strokeDashoffset={ringOffset} strokeLinecap="round" className="text-purple-600 transition-all duration-1000" style={{ transitionTimingFunction: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)' }} />
                                </svg>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Progress</span>
                                <span className="text-sm font-black text-gray-950">{completedCount} <span className="text-gray-400 font-semibold">/ {totalTasksCount}</span></span>
                            </div>
                        </div>
                    </div>

                    {/* =====================================
                        QUICK STATS ROW
                    ===================================== */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                        <div className="bg-white rounded-2xl border border-[#E9DFD3]/80 p-4 shadow-[0_4px_20px_rgba(80,62,38,0.03)] flex flex-col justify-center">
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Today's Tasks</span>
                            <span className="text-2xl font-black text-gray-900">{activeTasks.length}</span>
                        </div>
                        <div className="bg-white rounded-2xl border border-[#E9DFD3]/80 p-4 shadow-[0_4px_20px_rgba(80,62,38,0.03)] flex flex-col justify-center">
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Completed</span>
                            <span className="text-2xl font-black text-green-600">{completedCount}</span>
                        </div>
                        <div className="bg-white rounded-2xl border border-[#E9DFD3]/80 p-4 shadow-[0_4px_20px_rgba(80,62,38,0.03)] flex flex-col justify-center">
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Focus Time</span>
                            <span className="text-2xl font-black text-gray-900">4.5<span className="text-sm font-semibold text-gray-400 ml-1">hrs</span></span>
                        </div>
                        <div className="bg-white rounded-2xl border border-[#E9DFD3]/80 p-4 shadow-[0_4px_20px_rgba(80,62,38,0.03)] flex flex-col justify-center">
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Current Streak</span>
                            <div className="flex items-center gap-2">
                                <span className="text-2xl font-black text-purple-600">{currentStreak}</span>
                                <span className="text-lg">🔥</span>
                            </div>
                        </div>
                    </div>

                    {/* =====================================
                        MAIN LAYOUT
                    ===================================== */}
                    <div className="flex flex-col lg:flex-row gap-6">
                        
                        {/* LEFT COLUMN: Active Execution */}
                        <div className="w-full lg:w-3/4 flex flex-col gap-4">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                    <h3 className="text-lg font-black tracking-tight text-gray-950 flex items-center gap-2">
                                        🎯 Active Execution
                                    </h3>
                                    <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded-md border border-gray-100 hidden sm:inline-block">Sorted by: Priority • Deadline</span>
                                </div>
                            </div>

                            {isLoading ? (
                                <div className="flex flex-col gap-4">
                                    {[1, 2, 3].map(i => (
                                        <div key={i} className="bg-white p-5 rounded-[22px] border border-[#E9DFD3]/80 shadow-sm flex gap-4">
                                            <div className="w-6 h-6 rounded-md skeleton-shimmer mt-0.5 shrink-0"></div>
                                            <div className="flex-1 space-y-3 py-1">
                                                <div className="h-5 skeleton-shimmer rounded w-1/3"></div>
                                                <div className="h-4 skeleton-shimmer rounded w-1/4"></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : error ? (
                                <div className="bg-red-50 text-red-600 p-6 rounded-xl border border-red-100 text-center font-bold">
                                    {error}
                                </div>
                            ) : activeTasks.length > 0 ? (
                                <div className="flex flex-col gap-4">
                                    {activeTasks.map((task) => {
                                        const isFocused = focusedTaskId === task.id;
                                        const isCompleting = completingId === task.id;
                                        const activeTimer = isFocused && focusTimer?.taskId === task.id ? focusTimer : null;
                                        const timerProgress = activeTimer?.totalSeconds
                                            ? Math.max(0, Math.min(100, ((activeTimer.totalSeconds - activeTimer.remainingSeconds) / activeTimer.totalSeconds) * 100))
                                            : 0;
                                        
                                        return (
                                            <div 
                                                key={task.id} 
                                                className={`bg-white p-5 rounded-[22px] border transition-all duration-400 ease-out group flex flex-col gap-4 ${
                                                    isCompleting 
                                                    ? "opacity-50 scale-[0.99] shadow-[0_0_15px_rgba(34,197,94,0.05)] border-green-200" 
                                                    : isFocused
                                                        ? "border-purple-300 shadow-[0_16px_50px_rgba(126,34,206,0.1)] ring-4 ring-purple-500/10 scale-[1.01] z-10"
                                                        : "border-[#E9DFD3]/80 shadow-[0_8px_24px_rgba(80,62,38,0.04)] hover:shadow-[0_14px_40px_rgba(80,62,38,0.08)] hover:-translate-y-0.5 hover:border-purple-200"
                                                }`}
                                            >
                                                {/* Task Header Row */}
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                    <div className="flex items-start gap-4 flex-1">
                                                        
                                                        {/* Checkbox / Repeating Stepper */}
                                                        {task.isRepeating && task.targetCount > 1 ? (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); handleIncrementRepeating(task.id); }}
                                                                className="w-12 h-6 rounded-md border-2 border-purple-200 mt-0.5 flex items-center justify-center shrink-0 hover:border-purple-400 bg-purple-50 text-purple-700 text-[10px] font-black tracking-widest active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                                                                aria-label={`Log progress: ${task.currentCount || 0} out of ${task.targetCount}`}
                                                            >
                                                                {task.currentCount || 0}/{task.targetCount}
                                                            </button>
                                                        ) : (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); handleCompleteWithAnimation(task.id); }}
                                                                className="w-6 h-6 rounded-md border-2 border-gray-200 mt-0.5 flex items-center justify-center shrink-0 hover:border-green-400 hover:bg-green-50 transition-colors bg-gray-50/50 active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                                                                aria-label="Mark task complete"
                                                            >
                                                                <svg className="w-3.5 h-3.5 text-green-500 opacity-0 hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                                            </button>
                                                        )}
                                                        
                                                        <div className="flex flex-col flex-1 min-w-0">
                                                            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                                                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border tracking-wider ${getPriorityStyles(task.priority)}`}>
                                                                    {task.priority || "MEDIUM"}
                                                                </span>
                                                                <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-gray-50 text-gray-500 border border-gray-100 tracking-wider">
                                                                    Due in {task.deadlineDays || 1} {(task.deadlineDays || 1) === 1 ? 'day' : 'days'}
                                                                </span>
                                                            </div>
                                                            <h4 className="text-base font-black text-gray-900 mb-1 truncate">{task.title}</h4>
                                                            
                                                            {/* Contextual Sub-elements */}
                                                            <div className="flex flex-col gap-2">
                                                                {!isFocused && (
                                                                    <div className="flex items-center gap-3">
                                                                        <span className="text-[11px] font-semibold text-gray-500 flex items-center gap-1">
                                                                            <span className="text-[14px]">⏱</span> {task.estimatedTime || "1 Hour"}
                                                                        </span>
                                                                        <span className="text-[11px] font-semibold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                                                                            🤖 {task.timeBlock || "Focus Block"}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                                
                                                                {/* Repeating Task Progress Inline Bar */}
                                                                {task.isRepeating && task.targetCount > 1 && (
                                                                    <div className="mt-1 max-w-[180px] animate-fade-in-up">
                                                                        <div className="flex items-center justify-between text-[9px] font-bold text-gray-400 mb-1 uppercase tracking-wider">
                                                                            <span>Progress</span>
                                                                            <span>{task.targetCount - (task.currentCount || 0)} left</span>
                                                                        </div>
                                                                        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                                                             <div className="bg-purple-500 h-1.5 rounded-full transition-all duration-300 ease-out" style={{ width: `${((task.currentCount || 0)/task.targetCount)*100}%` }}></div>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="shrink-0 flex items-center gap-2">
                                                        {!isFocused && (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); handleDeleteTask(task); }}
                                                                className="w-10 h-10 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                                                                aria-label="Delete task"
                                                            >
                                                                ✖
                                                            </button>
                                                        )}
                                                        <button 
                                                            onClick={() => handleToggleFocus(task)}
                                                            className={`w-full sm:w-auto px-6 py-3 border rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-2 shadow-sm active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
                                                                isFocused 
                                                                ? "bg-purple-600 text-white border-purple-600 shadow-purple-600/20" 
                                                                : "bg-[#FAF8F4] hover:bg-purple-50 text-gray-900 border-[#EFE5D9] group-hover:border-purple-200"
                                                            }`}
                                                        >
                                                            {isFocused ? "Collapse" : "▶ Start Focus"}
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Expanded Focus Workspace (POLISHED) */}
                                                {isFocused && (
                                                    <div className="mt-3 pt-5 border-t border-[#E9DFD3]/80 animate-fade-in-up flex flex-col gap-6">
                                                        
                                                        {/* Top Workspace Meta */}
                                                        <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-5 px-1">
                                                            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                                                                <span className="text-[10px] font-black uppercase tracking-widest text-purple-600">Currently Working</span>
                                                                <h3 className="text-xl font-black text-gray-900 leading-tight">{task.title}</h3>
                                                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                                                    <span className="text-[11px] font-semibold text-gray-600 bg-gray-50 px-2.5 py-1 rounded border border-gray-100 shadow-3xs flex items-center gap-1.5"><span className="text-gray-400">⏱</span> {task.estimatedTime || "1 Hour"}</span>
                                                                    <span className="text-[11px] font-semibold text-gray-600 bg-gray-50 px-2.5 py-1 rounded border border-gray-100 shadow-3xs flex items-center gap-1.5"><span className="text-gray-400">📅</span> Due in {task.deadlineDays || 1}d</span>
                                                                </div>
                                                            </div>

                                                            {activeTimer && (
                                                                <div className={`focus-timer-card w-full xl:w-[300px] shrink-0 rounded-2xl border p-4 transition-all ${
                                                                    activeTimer.expired
                                                                        ? "bg-red-50 border-red-100"
                                                                        : "bg-white border-purple-100"
                                                                }`}>
                                                                    <div className="flex items-center gap-4">
                                                                        <div
                                                                            className="relative w-16 h-16 rounded-2xl flex items-center justify-center shrink-0"
                                                                            style={{
                                                                                background: `conic-gradient(#9333ea ${timerProgress}%, #f1e8ff ${timerProgress}% 100%)`,
                                                                            }}
                                                                        >
                                                                            <div className="absolute inset-1.5 rounded-[14px] bg-white"></div>
                                                                            <span className="focus-hourglass relative text-2xl" aria-hidden="true">⏳</span>
                                                                        </div>
                                                                        <div className="min-w-0 flex-1">
                                                                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">
                                                                                {activeTimer.expired ? "Time Finished" : "Focus Timer"}
                                                                            </p>
                                                                            <p className={`mt-0.5 text-3xl font-black tabular-nums tracking-tight ${
                                                                                activeTimer.expired ? "text-red-600" : "text-gray-950"
                                                                            }`}>
                                                                                {formatTimer(activeTimer.remainingSeconds)}
                                                                            </p>
                                                                            <p className="text-[11px] font-bold text-gray-400">
                                                                                {activeTimer.expired ? "Need more time?" : "Running from assigned task time"}
                                                                            </p>
                                                                        </div>
                                                                    </div>

                                                                    {activeTimer.expired && (
                                                                        <div className="mt-4 grid grid-cols-3 gap-2">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleCompleteWithAnimation(task.id)}
                                                                                className="rounded-xl bg-green-500 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white shadow-sm hover:bg-green-600 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
                                                                            >
                                                                                Complete
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleAddFocusTime(10)}
                                                                                className="rounded-xl bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wider text-purple-700 border border-purple-100 hover:bg-purple-50 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                                                                            >
                                                                                +10m
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleAddFocusTime(15)}
                                                                                className="rounded-xl bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wider text-purple-700 border border-purple-100 hover:bg-purple-50 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                                                                            >
                                                                                +15m
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                        </div>
                                                            )}
                                                        </div>

                                                        {/* Smart Motivation */}
                                                        <div className="bg-purple-50/50 p-4 rounded-xl border border-purple-100 flex items-start gap-3 animate-fade-in">
                                                            <span className="text-lg leading-none mt-0.5">💡</span>
                                                            <p className="text-sm font-semibold text-purple-800 italic leading-relaxed">"{getSmartMotivation(task.title)}"</p>
                                                        </div>

                                                        {/* Quick Notes Area */}
                                                        <div className="flex flex-col gap-2">
                                                            <div className="flex items-center justify-between px-1">
                                                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Quick Notes</label>
                                                                <span className={`text-[10px] font-black text-green-500 uppercase tracking-widest transition-opacity duration-300 flex items-center gap-1 ${notesSaved ? 'opacity-100' : 'opacity-0'}`}>
                                                                    ✓ Saved
                                                                </span>
                                                            </div>
                                                            <textarea 
                                                                value={activeNoteContent}
                                                                onChange={handleNotesChange}
                                                                onBlur={handleNotesBlur}
                                                                placeholder="Jot down thoughts, links, or progress here... Autosaves when you click away."
                                                                className="w-full bg-[#FAF8F4] border border-[#E9DFD3] rounded-xl p-4 text-sm font-medium text-gray-800 placeholder-gray-400 focus:outline-none focus:border-purple-300 focus:ring-4 focus:ring-purple-500/10 transition-all resize-y min-h-[120px] shadow-inner"
                                                            />
                                                        </div>

                                                        {/* Bottom Bar: Complete Action */}
                                                        <div className="flex justify-end pt-2">
                                                            <button 
                                                                onClick={() => handleCompleteWithAnimation(task.id)}
                                                                className="px-8 py-3.5 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold text-sm shadow-[0_8px_24px_rgba(34,197,94,0.25)] transition-all active:scale-95 flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-green-500"
                                                            >
                                                                ✓ Mark as Complete
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="bg-white/60 border border-[#E9DFD3] border-dashed rounded-[24px] p-12 flex flex-col items-center justify-center text-center animate-fade-in-up">
                                    <span className="text-5xl mb-4">{isOnlyRepeatingLeft ? "🌱" : "🎉"}</span>
                                    <h3 className="text-xl font-black text-gray-900 mb-2">
                                        {isOnlyRepeatingLeft ? "Great work." : "You're all caught up."}
                                    </h3>
                                    <p className="text-sm font-medium text-gray-500 max-w-sm">
                                        {isOnlyRepeatingLeft ? "Keep your streak alive with these remaining habits." : "Enjoy the rest of your day."}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* RIGHT COLUMN: Milestones & Completed (25%) */}
                        <div className="w-full lg:w-1/4 flex flex-col gap-6">
                            
                            {/* Upcoming Milestones */}
                            <div className="bg-white rounded-[22px] border border-[#E9DFD3]/80 p-5 shadow-[0_8px_24px_rgba(80,62,38,0.04)]">
                                <h3 className="text-sm font-black tracking-tight text-gray-950 mb-4">⏳ Upcoming</h3>
                                {upcomingTasks.length > 0 ? (
                                    <div className="relative pl-2.5 space-y-4">
                                        <div className="absolute top-2 bottom-2 left-[13px] w-px bg-gray-100"></div>
                                        {upcomingTasks.map((task, idx) => (
                                            <div key={idx} className="relative flex items-center gap-3 z-10 hover:opacity-80 transition-opacity">
                                                <div className="w-2 h-2 rounded-full ring-4 ring-white bg-gray-300 shrink-0"></div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="text-xs font-bold text-gray-700 truncate">{task.title}</h4>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className={`text-[10px] font-black uppercase tracking-wider ${getDeadlineColor(task.deadlineDays)}`}>Due in {task.deadlineDays || 1}d</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-[11px] font-medium text-gray-400 italic">No upcoming tasks.</p>
                                )}
                            </div>

                            {/* Completed Today */}
                            <div className="bg-[#FAF8F4] rounded-[22px] border border-[#EFE5D9] p-2 shadow-sm">
                                <button 
                                    onClick={() => setCompletedExpanded(!completedExpanded)}
                                    className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                                    aria-expanded={completedExpanded}
                                >
                                    <h3 className="text-sm font-black tracking-tight text-gray-900 flex items-center gap-2">
                                        <span className="text-green-500 text-lg leading-none">✓</span> Completed Today
                                    </h3>
                                    <span className="text-gray-400 font-bold text-xs">{completedCount}</span>
                                </button>
                                
                                {completedExpanded && (
                                    <div className="px-3 pb-3 pt-1 space-y-2 animate-fade-in">
                                        {completedTasksList.length > 0 ? completedTasksList.map((task, idx) => (
                                            <div key={idx} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-white border border-gray-100 shadow-3xs group transition-all">
                                                <h4 className="text-[11px] font-bold text-gray-400 line-through truncate flex-1">{task.title}</h4>
                                                <button
                                                    type="button"
                                                    onClick={() => handleUndoComplete(task.id)}
                                                    className="text-[9px] font-black uppercase text-purple-600 bg-purple-50 hover:bg-purple-100 border border-purple-100 tracking-wider shrink-0 rounded-md px-2 py-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                                                >
                                                    Undo
                                                </button>
                                            </div>
                                        )) : (
                                            <p className="text-[11px] font-medium text-gray-400 px-2 py-1 italic">No tasks completed yet.</p>
                                        )}
                                    </div>
                                )}
                            </div>

                        </div>
                    </div>

                </div>
            </div>
        </>
    );
}

export default TaskBoard;
