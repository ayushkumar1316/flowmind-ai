// src/pages/TaskBoard.jsx
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { recordTaskCompletionStreak } from "../services/authService";
import { logTaskCompletion, logConfidenceChange } from "../services/historyService";
import { useAuth } from "../hooks/useAuth";
import { usePlan } from "../hooks/usePlan";
import { getDisplayName, getProductivityStreak } from "../utils/dashboardMetrics";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
        subtasks: Array.isArray(source.subtasks) ? source.subtasks : [],
        tags: Array.isArray(source.tags) ? source.tags : [],
    });
};

const getPlanTasks = (plan) => {
    if (Array.isArray(plan?.taskBoardTasks)) return plan.taskBoardTasks.map(normalizeTask);
    if (Array.isArray(plan?.todayPlan)) return plan.todayPlan.map(normalizeTask);
    if (Array.isArray(plan?.strictlyDoToday)) return plan.strictlyDoToday.map(normalizeTask);
    return [];
};

function SortableTaskCard({ id, children }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 50 : undefined,
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
            {children}
        </div>
    );
}

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
    const [focusedTaskId, setFocusedTaskId] = useState(() => {
        try {
            const saved = localStorage.getItem("flowmind_focusTimer");
            if (saved) {
                const parsed = JSON.parse(saved);
                const elapsedSinceSave = Math.floor((Date.now() - parsed.savedAt) / 1000);
                const adjustedRemaining = Math.max(0, parsed.remainingSeconds - elapsedSinceSave);
                if (adjustedRemaining > 0 && parsed.isRunning) return parsed.taskId;
            }
        } catch { /* ignore */ }
        return null;
    });
    const [activeNoteContent, setActiveNoteContent] = useState("");
    const [notesSaved, setNotesSaved] = useState(false);
    const [completingId, setCompletingId] = useState(null);
    const [subtaskInput, setSubtaskInput] = useState("");
    const [activeTagFilter, setActiveTagFilter] = useState(null);
    const [tagInput, setTagInput] = useState("");
    const [toast, setToast] = useState(null);
    const [focusTimer, setFocusTimer] = useState(() => {
        try {
            const saved = localStorage.getItem("flowmind_focusTimer");
            if (saved) {
                const parsed = JSON.parse(saved);
                const elapsedSinceSave = Math.floor((Date.now() - parsed.savedAt) / 1000);
                const adjustedRemaining = Math.max(0, parsed.remainingSeconds - elapsedSinceSave);
                if (adjustedRemaining > 0 && parsed.isRunning) {
                    return {
                        ...parsed,
                        remainingSeconds: adjustedRemaining,
                        isRunning: true,
                        expired: false,
                        savedAt: undefined
                    };
                }
                return null;
            }
        } catch { /* ignore */ }
        return null;
    });
    
    // Toast & Celebration States
    const [celebration, setCelebration] = useState(null);
    const [deletedTaskInfo, setDeletedTaskInfo] = useState(null);
    const deleteTimeoutRef = useRef(null);
    const focusTimerRef = useRef(null);
    const { user, profile, updateProfileStats } = useAuth();
    const { plan, loadingPlan: isLoading, syncTasks, saveTemplate, deleteTemplate } = usePlan();

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
    );

    const planTasks = useMemo(() => (plan ? getPlanTasks(plan) : []), [plan]);
    const tasks = localTasks ?? planTasks;

    // Custom task order for drag-to-reorder — lazy init from planTasks
    const [taskOrder, setTaskOrder] = useState(() => {
        return planTasks.filter(t => t.status !== "Completed").map(t => t.id);
    });

    useEffect(() => {
        focusTimerRef.current = focusTimer;
    });

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
    }, [focusTimer?.isRunning, focusTimer?.taskId]);

    useEffect(() => {
        if (focusTimer?.isRunning && focusTimer.remainingSeconds > 0) {
            localStorage.setItem("flowmind_focusTimer", JSON.stringify({
                ...focusTimer,
                savedAt: Date.now()
            }));
        } else {
            localStorage.removeItem("flowmind_focusTimer");
        }
    }, [focusTimer?.isRunning, focusTimer?.remainingSeconds, focusTimer?.taskId]);

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
                const updatedTasks = prev.map(t => {
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
                syncPlanUpdates(updatedTasks);

                if (user?.uid) {
                    recordTaskCompletionStreak(user.uid, profile?.stats || {})
                        .then((nextStats) => updateProfileStats(nextStats))
                        .catch((err) => console.error("Failed to update productivity streak", err));
                    
                    const completedTask = updatedTasks.find(t => t.id === taskId);
                    if (completedTask) {
                        logTaskCompletion(user.uid, completedTask).catch(() => {});
                        const oldScore = Number(plan?.confidenceScore || 0);
                        const totalTasks = updatedTasks.length;
                        const completedCount = updatedTasks.filter(t => t.status === "Completed").length;
                        const newScore = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;
                        if (oldScore !== newScore) {
                            logConfidenceChange(user.uid, oldScore, newScore, "task_completion").catch(() => {});
                        }
                    }
                }

                return updatedTasks;
            });
            triggerCelebration();
            
            if (focusedTaskId === taskId) {
                setFocusedTaskId(null);
            }
            setFocusTimer((timer) => timer?.taskId === taskId ? null : timer);
        }, 400);
    }, [focusedTaskId, syncPlanUpdates, triggerCelebration, user, profile, updateProfileStats, plan]);

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
    // SUBTASK HANDLERS
    // =====================================
    const handleAddSubtask = useCallback((taskId, title) => {
        if (!title.trim()) return;
        const newSubtask = {
            id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            title: title.trim(),
            completed: false,
        };
        const updated = tasks.map(t =>
            t.id === taskId ? { ...t, subtasks: [...(t.subtasks || []), newSubtask] } : t
        );
        setLocalTasks(updated);
        syncPlanUpdates(updated);
    }, [tasks, syncPlanUpdates]);

    const handleToggleSubtask = useCallback((taskId, subtaskId) => {
        const updated = tasks.map(t => {
            if (t.id !== taskId) return t;
            const subtasks = (t.subtasks || []).map(s =>
                s.id === subtaskId ? { ...s, completed: !s.completed } : s
            );
            return { ...t, subtasks };
        });
        setLocalTasks(updated);
        syncPlanUpdates(updated);
    }, [tasks, syncPlanUpdates]);

    const handleDeleteSubtask = useCallback((taskId, subtaskId) => {
        const updated = tasks.map(t => {
            if (t.id !== taskId) return t;
            return { ...t, subtasks: (t.subtasks || []).filter(s => s.id !== subtaskId) };
        });
        setLocalTasks(updated);
        syncPlanUpdates(updated);
    }, [tasks, syncPlanUpdates]);

    // =====================================
    // TAG HANDLERS
    // =====================================
    const allTags = useMemo(() => {
        const tagSet = new Set();
        tasks.forEach(t => (t.tags || []).forEach(tag => tagSet.add(tag)));
        return [...tagSet].sort();
    }, [tasks]);

    const handleAddTag = useCallback((taskId, tag) => {
        if (!tag.trim()) return;
        const updated = tasks.map(t => {
            if (t.id !== taskId) return t;
            const tags = t.tags || [];
            if (tags.includes(tag.trim())) return t;
            return { ...t, tags: [...tags, tag.trim()] };
        });
        setLocalTasks(updated);
        syncPlanUpdates(updated);
    }, [tasks, syncPlanUpdates]);

    const handleRemoveTag = useCallback((taskId, tag) => {
        const updated = tasks.map(t => {
            if (t.id !== taskId) return t;
            return { ...t, tags: (t.tags || []).filter(tg => tg !== tag) };
        });
        setLocalTasks(updated);
        syncPlanUpdates(updated);
    }, [tasks, syncPlanUpdates]);

    // =====================================
    // TEMPLATE HANDLERS
    // =====================================
    const templates = useMemo(() => plan?.taskTemplates || [], [plan]);

    const handleSaveAsTemplate = useCallback(async (task) => {
        const template = {
            id: `tpl-${Date.now()}`,
            title: task.title,
            priority: task.priority,
            estimatedTime: task.estimatedTime,
            timeBlock: task.timeBlock,
            category: task.category,
            tags: task.tags || [],
            subtasks: (task.subtasks || []).map(s => ({ ...s, id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, completed: false })),
        };
        try {
            await saveTemplate(template);
            setToast({ type: "success", message: "Template saved!" });
            setTimeout(() => setToast(null), 3000);
        } catch {
            setToast({ type: "error", message: "Failed to save template" });
            setTimeout(() => setToast(null), 3000);
        }
    }, [saveTemplate]);

    const handleUseTemplate = useCallback((template) => {
        const newTask = {
            ...template,
            id: `today-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            status: "To Do",
            completed: false,
            subtasks: (template.subtasks || []).map(s => ({
                ...s,
                id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                completed: false,
            })),
        };
        const updated = [...tasks, newTask];
        setLocalTasks(updated);
        syncPlanUpdates(updated);
    }, [tasks, syncPlanUpdates]);

    // =====================================
    // DRAG-TO-REORDER HANDLER
    // =====================================
    const handleDragEnd = useCallback((event) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        setTaskOrder((prev) => {
            const oldIndex = prev.indexOf(active.id);
            const newIndex = prev.indexOf(over.id);
            if (oldIndex === -1 || newIndex === -1) return prev;
            const newOrder = arrayMove(prev, oldIndex, newIndex);
            
            // Sync reordered tasks to Firestore
            const reorderedTasks = newOrder
                .map(id => tasks.find(t => t.id === id))
                .filter(Boolean)
                .concat(tasks.filter(t => !newOrder.includes(t.id)));
            syncPlanUpdates(reorderedTasks);
            
            return newOrder;
        });
    }, [tasks, syncPlanUpdates]);

    // =====================================
    // SMART SORTING & DERIVED STATE
    // =====================================
    const activeTasks = useMemo(() => {
        let active = tasks.filter(t => t.status !== "Completed");
        
        // Apply tag filter
        if (activeTagFilter) {
            active = active.filter(t => (t.tags || []).includes(activeTagFilter));
        }
        
        // Use custom order if available, otherwise sort by priority
        if (taskOrder.length > 0) {
            return taskOrder
                .map(id => active.find(t => t.id === id))
                .filter(Boolean)
                .concat(active.filter(t => !taskOrder.includes(t.id)));
        }

        return active.sort((a, b) => {
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
    }, [tasks, taskOrder, activeTagFilter]);

    const completedTasksList = useMemo(() => tasks.filter(t => t.status === "Completed"), [tasks]);
    const upcomingTasks = useMemo(() => [...activeTasks].sort((a, b) => (a.deadlineDays || 0) - (b.deadlineDays || 0)).slice(0, 4), [activeTasks]);

    // Header Metrics
    const totalTasksCount = activeTasks.length + completedTasksList.length;
    const completedCount = completedTasksList.length;
    const progressPercent = totalTasksCount === 0 ? 0 : Math.round((completedCount / totalTasksCount) * 100);
    const isOnlyRepeatingLeft = activeTasks.length > 0 && activeTasks.every(t => t.isRepeating);
    const currentStreak = useMemo(() => getProductivityStreak(profile, plan), [profile, plan]);
    const totalFocusMinutes = useMemo(() => {
        return completedTasksList.reduce((sum, t) => {
            const timeStr = t.estimatedTime || t.duration || "1 Hour";
            const hours = parseDuration(timeStr);
            return sum + Math.round(hours * 60);
        }, 0);
    }, [completedTasksList]);
    const focusTimeDisplay = totalFocusMinutes >= 60 
        ? `${(totalFocusMinutes / 60).toFixed(1)}`
        : `${totalFocusMinutes}`;
    const focusTimeUnit = totalFocusMinutes >= 60 ? "hrs" : "min";
    const userName = getDisplayName(profile, user);
    const currentHour = new Date().getHours();
    const timeOfDay = currentHour < 12 ? "Morning" : currentHour < 18 ? "Afternoon" : currentHour < 22 ? "Evening" : "Night";

    // Styling Helpers
    const getPriorityStyles = useCallback((priority) => {
        const p = (priority || "MEDIUM").toUpperCase();
        if (p === "HIGH") return "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-900/30";
        if (p === "MEDIUM") return "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/30";
        return "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-100 dark:border-green-900/30";
    }, []);

    const getDeadlineColor = useCallback((days) => {
        if (days <= 2) return "text-red-500 font-bold";
        if (days <= 7) return "text-amber-500 font-bold";
        return "text-green-500";
    }, []);

    const ringRadius = 14;
    const ringCircumference = 2 * Math.PI * ringRadius;
    const ringOffset = ringCircumference - (progressPercent / 100) * ringCircumference;

    return (
        <>
            <style>{`
                html { scroll-behavior: smooth; }
                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: #E9DFD3; border-radius: 10px; }
                ::-webkit-scrollbar-thumb:hover { background: #D6C6FF; }
                .dark ::-webkit-scrollbar-thumb { background: #4a4458; }

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
            
            <div className="relative min-h-screen bg-transparent text-gray-800 dark:text-gray-200 font-sans pb-16">
                
                {/* Background Ambient Blobs */}
                <div className="pointer-events-none absolute top-0 right-0 w-[600px] h-[600px] bg-[#D6C6FF] rounded-full filter blur-[120px] opacity-[0.12] dark:opacity-[0.06] z-0"></div>
                <div className="pointer-events-none absolute bottom-0 left-0 w-[600px] h-[600px] bg-[#A7F3D0] rounded-full filter blur-[120px] opacity-[0.12] dark:opacity-[0.06] z-0"></div>

                {/* CELEBRATION TOAST */}
                {celebration && (
                    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[150] bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-6 py-3 rounded-xl shadow-[0_10px_40px_rgba(34,197,94,0.2)] border border-green-200 dark:border-green-800 animate-fade-in-up flex items-center gap-3">
                        <span className="text-sm font-bold tracking-wide text-green-600">{celebration}</span>
                    </div>
                )}

                {/* SUCCESS/ERROR TOAST */}
                {toast && (
                    <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[150] px-6 py-3 rounded-xl shadow-[0_10px_40px_rgba(80,62,38,0.12)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.3)] border animate-fade-in-up flex items-center gap-3 ${
                        toast.type === "success"
                            ? "bg-white dark:bg-gray-900 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
                            : "bg-white dark:bg-gray-900 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800"
                    }`}>
                        <span className="text-sm font-bold">{toast.message}</span>
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
                            <h1 className="text-4xl font-black tracking-tight text-gray-950 dark:text-gray-100 leading-tight">Today's Execution</h1>
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-1">Focus on what matters most today. Complete one meaningful task at a time.</p>
                        </div>
                        
                        <div className="flex items-center gap-3 bg-white/95 dark:bg-gray-900/95 px-4 py-3 rounded-[18px] border border-[#E9DFD3] dark:border-gray-700 shadow-[0_8px_24px_rgba(80,62,38,0.04)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
                            <div className="relative w-9 h-9 flex items-center justify-center shrink-0">
                                <svg className="transform -rotate-90 w-full h-full drop-shadow-sm">
                                    <circle cx="18" cy="18" r={ringRadius} stroke="currentColor" strokeWidth="3" fill="transparent" className="text-gray-100" />
                                    <circle cx="18" cy="18" r={ringRadius} stroke="currentColor" strokeWidth="3" fill="transparent" strokeDasharray={ringCircumference} strokeDashoffset={ringOffset} strokeLinecap="round" className="text-purple-600 transition-all duration-1000" style={{ transitionTimingFunction: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)' }} />
                                </svg>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">Progress</span>
                                <span className="text-sm font-black text-gray-950 dark:text-gray-100">{completedCount} <span className="text-gray-400 dark:text-gray-500 font-semibold">/ {totalTasksCount}</span></span>
                            </div>
                        </div>
                    </div>

                    {/* =====================================
                        QUICK STATS ROW
                    ===================================== */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-[#E9DFD3]/80 dark:border-gray-700 p-4 shadow-[0_4px_20px_rgba(80,62,38,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.3)] flex flex-col justify-center">
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">Today's Tasks</span>
                            <span className="text-2xl font-black text-gray-900 dark:text-gray-100">{activeTasks.length}</span>
                        </div>
                        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-[#E9DFD3]/80 dark:border-gray-700 p-4 shadow-[0_4px_20px_rgba(80,62,38,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.3)] flex flex-col justify-center">
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">Completed</span>
                            <span className="text-2xl font-black text-green-600">{completedCount}</span>
                        </div>
                        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-[#E9DFD3]/80 dark:border-gray-700 p-4 shadow-[0_4px_20px_rgba(80,62,38,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.3)] flex flex-col justify-center">
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">Focus Time</span>
                            <span className="text-2xl font-black text-gray-900 dark:text-gray-100">{focusTimeDisplay}<span className="text-sm font-semibold text-gray-400 dark:text-gray-500 ml-1">{focusTimeUnit}</span></span>
                        </div>
                        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-[#E9DFD3]/80 dark:border-gray-700 p-4 shadow-[0_4px_20px_rgba(80,62,38,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.3)] flex flex-col justify-center">
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">Current Streak</span>
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
                                    <h3 className="text-lg font-black tracking-tight text-gray-950 dark:text-gray-100 flex items-center gap-2">
                                        🎯 Active Execution
                                    </h3>
                                    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded-md border border-gray-100 dark:border-gray-700 hidden sm:inline-block">Sorted by: Priority • Deadline</span>
                                </div>
                            </div>

                            {/* Tag Filter Bar */}
                            {allTags.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-3">
                                    <button
                                        onClick={() => setActiveTagFilter(null)}
                                        className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
                                            !activeTagFilter
                                                ? "bg-purple-600 text-white border-purple-600"
                                                : "bg-[#FAF8F4] dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-[#E9DFD3] dark:border-gray-700 hover:border-purple-200 dark:hover:border-purple-700"
                                        }`}
                                    >
                                        All
                                    </button>
                                    {allTags.map((tag) => (
                                        <button
                                            key={tag}
                                            onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
                                            className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
                                                activeTagFilter === tag
                                                    ? "bg-purple-600 text-white border-purple-600"
                                                    : "bg-[#FAF8F4] dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-[#E9DFD3] dark:border-gray-700 hover:border-purple-200 dark:hover:border-purple-700"
                                            }`}
                                        >
                                            {tag}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {isLoading ? (
                                <div className="flex flex-col gap-4">
                                    {[1, 2, 3].map(i => (
                                        <div key={i} className="bg-white dark:bg-gray-900 p-5 rounded-[22px] border border-[#E9DFD3]/80 dark:border-gray-700 shadow-sm flex gap-4">
                                            <div className="w-6 h-6 rounded-md skeleton-shimmer mt-0.5 shrink-0"></div>
                                            <div className="flex-1 space-y-3 py-1">
                                                <div className="h-5 skeleton-shimmer rounded w-1/3"></div>
                                                <div className="h-4 skeleton-shimmer rounded w-1/4"></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : error ? (
                                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-6 rounded-xl border border-red-100 dark:border-red-900/30 text-center font-bold">
                                    {error}
                                </div>
                            ) : activeTasks.length > 0 ? (
                                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                    <SortableContext items={activeTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                                        <div className="flex flex-col gap-4">
                                            {activeTasks.map((task) => {
                                                const isFocused = focusedTaskId === task.id;
                                                const isCompleting = completingId === task.id;
                                                const activeTimer = isFocused && focusTimer?.taskId === task.id ? focusTimer : null;
                                                const timerProgress = activeTimer?.totalSeconds
                                                    ? Math.max(0, Math.min(100, ((activeTimer.totalSeconds - activeTimer.remainingSeconds) / activeTimer.totalSeconds) * 100))
                                                    : 0;
                                                
                                                return (
                                                    <SortableTaskCard key={task.id} id={task.id}>
                                            <div 
                                                className={`bg-white dark:bg-gray-900 p-5 rounded-[22px] border transition-all duration-400 ease-out group flex flex-col gap-4 ${
                                                    isCompleting 
                                                    ? "opacity-50 scale-[0.99] shadow-[0_0_15px_rgba(34,197,94,0.05)] border-green-200 dark:border-green-800" 
                                                    : isFocused
                                                        ? "border-purple-300 dark:border-purple-700 shadow-[0_16px_50px_rgba(126,34,206,0.1)] ring-4 ring-purple-500/10 scale-[1.01] z-10"
                                                        : "border-[#E9DFD3]/80 dark:border-gray-700 shadow-[0_8px_24px_rgba(80,62,38,0.04)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.3)] hover:shadow-[0_14px_40px_rgba(80,62,38,0.08)] dark:hover:shadow-[0_14px_40px_rgba(0,0,0,0.3)] hover:-translate-y-0.5 hover:border-purple-200 dark:hover:border-purple-700"
                                                }`}
                                            >
                                                {/* Task Header Row */}
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                    <div className="flex items-start gap-4 flex-1">
                                                        
                                                        {/* Checkbox / Repeating Stepper */}
                                                        {task.isRepeating && task.targetCount > 1 ? (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); handleIncrementRepeating(task.id); }}
                                                                className="w-12 h-6 rounded-md border-2 border-purple-200 dark:border-purple-700 mt-0.5 flex items-center justify-center shrink-0 hover:border-purple-400 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-[10px] font-black tracking-widest active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                                                                aria-label={`Log progress: ${task.currentCount || 0} out of ${task.targetCount}`}
                                                            >
                                                                {task.currentCount || 0}/{task.targetCount}
                                                            </button>
                                                        ) : (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); handleCompleteWithAnimation(task.id); }}
                                                                className="w-6 h-6 rounded-md border-2 border-gray-200 dark:border-gray-700 mt-0.5 flex items-center justify-center shrink-0 hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors bg-gray-50/50 dark:bg-gray-800/50 active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
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
                                                                <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-gray-700 tracking-wider">
                                                                    Due in {task.deadlineDays || 1} {(task.deadlineDays || 1) === 1 ? 'day' : 'days'}
                                                                </span>
                                                                {(task.tags || []).slice(0, 2).map((tag) => (
                                                                    <span key={tag} className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 tracking-wider">
                                                                        {tag}
                                                                    </span>
                                                                ))}
                                                                {(task.tags || []).length > 2 && (
                                                                    <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500">+{task.tags.length - 2}</span>
                                                                )}
                                                            </div>
                                                            <h4 className="text-base font-black text-gray-900 dark:text-gray-100 mb-1 truncate">{task.title}</h4>
                                                            
                                                            {/* Contextual Sub-elements */}
                                                            <div className="flex flex-col gap-2">
                                                                {!isFocused && (
                                                                    <div className="flex items-center gap-3">
                                                                        <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                                                            <span className="text-[14px]">⏱</span> {task.estimatedTime || "1 Hour"}
                                                                        </span>
                                                                        <span className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-2 py-0.5 rounded-md flex items-center gap-1">
                                                                            🤖 {task.timeBlock || "Focus Block"}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                                
                                                                {/* Repeating Task Progress Inline Bar */}
                                                                {task.isRepeating && task.targetCount > 1 && (
                                                                    <div className="mt-1 max-w-[180px] animate-fade-in-up">
                                                                        <div className="flex items-center justify-between text-[9px] font-bold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">
                                                                            <span>Progress</span>
                                                                            <span>{task.targetCount - (task.currentCount || 0)} left</span>
                                                                        </div>
                                                                        <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 overflow-hidden">
                                                                             <div className="bg-purple-500 h-1.5 rounded-full transition-all duration-300 ease-out" style={{ width: `${((task.currentCount || 0)/task.targetCount)*100}%` }}></div>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Subtask Progress Inline */}
                                                                {!isFocused && (task.subtasks || []).length > 0 && (
                                                                    <div className="mt-1 max-w-[180px]">
                                                                        <div className="flex items-center justify-between text-[9px] font-bold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">
                                                                            <span>Subtasks</span>
                                                                            <span>{task.subtasks.filter(s => s.completed).length}/{task.subtasks.length}</span>
                                                                        </div>
                                                                        <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 overflow-hidden">
                                                                            <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-300 ease-out" style={{ width: `${(task.subtasks.filter(s => s.completed).length / task.subtasks.length) * 100}%` }}></div>
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
                                                                className="w-10 h-10 flex items-center justify-center text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
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
                                                                : "bg-[#FAF8F4] dark:bg-gray-800 hover:bg-purple-50 dark:hover:bg-purple-900/20 text-gray-900 dark:text-gray-100 border-[#EFE5D9] dark:border-gray-700 group-hover:border-purple-200 dark:group-hover:border-purple-700"
                                                            }`}
                                                        >
                                                            {isFocused ? "Collapse" : "▶ Start Focus"}
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Expanded Focus Workspace (POLISHED) */}
                                                {isFocused && (
                                                    <div className="mt-3 pt-5 border-t border-[#E9DFD3]/80 dark:border-gray-700 animate-fade-in-up flex flex-col gap-6">
                                                        
                                                        {/* Top Workspace Meta */}
                                                        <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-5 px-1">
                                                            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                                                                <span className="text-[10px] font-black uppercase tracking-widest text-purple-600">Currently Working</span>
                                                                <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 leading-tight">{task.title}</h3>
                                                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                                                    <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-2.5 py-1 rounded border border-gray-100 dark:border-gray-700 shadow-3xs flex items-center gap-1.5"><span className="text-gray-400 dark:text-gray-500">⏱</span> {task.estimatedTime || "1 Hour"}</span>
                                                                    <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-2.5 py-1 rounded border border-gray-100 dark:border-gray-700 shadow-3xs flex items-center gap-1.5"><span className="text-gray-400 dark:text-gray-500">📅</span> Due in {task.deadlineDays || 1}d</span>
                                                                </div>
                                                            </div>

                                                            {activeTimer && (
                                                                <div className={`focus-timer-card w-full xl:w-[300px] shrink-0 rounded-2xl border p-4 transition-all ${
                                                                    activeTimer.expired
                                                                        ? "bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900/30"
                                                                        : "bg-white dark:bg-gray-900 border-purple-100 dark:border-purple-900/30"
                                                                }`}>
                                                                    <div className="flex items-center gap-4">
                                                                        <div
                                                                            className="relative w-16 h-16 rounded-2xl flex items-center justify-center shrink-0"
                                                                            style={{
                                                                                background: `conic-gradient(#9333ea ${timerProgress}%, #f1e8ff ${timerProgress}% 100%)`,
                                                                            }}
                                                                        >
                                                                            <div className="absolute inset-1.5 rounded-[14px] bg-white dark:bg-gray-900"></div>
                                                                            <span className="focus-hourglass relative text-2xl" aria-hidden="true">⏳</span>
                                                                        </div>
                                                                        <div className="min-w-0 flex-1">
                                                                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">
                                                                                {activeTimer.expired ? "Time Finished" : "Focus Timer"}
                                                                            </p>
                                                                            <p className={`mt-0.5 text-3xl font-black tabular-nums tracking-tight ${
                                                                                activeTimer.expired ? "text-red-600 dark:text-red-400" : "text-gray-950 dark:text-gray-100"
                                                                            }`}>
                                                                                {formatTimer(activeTimer.remainingSeconds)}
                                                                            </p>
                                                                            <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500">
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
                                                                                className="rounded-xl bg-white dark:bg-gray-900 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-purple-700 dark:text-purple-400 border border-purple-100 dark:border-purple-900/30 hover:bg-purple-50 dark:hover:bg-purple-900/20 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                                                                            >
                                                                                +10m
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleAddFocusTime(15)}
                                                                                className="rounded-xl bg-white dark:bg-gray-900 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-purple-700 dark:text-purple-400 border border-purple-100 dark:border-purple-900/30 hover:bg-purple-50 dark:hover:bg-purple-900/20 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                                                                            >
                                                                                +15m
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                        </div>
                                                            )}
                                                        </div>

                                                        {/* Smart Motivation */}
                                                        <div className="bg-purple-50/50 dark:bg-purple-900/20 p-4 rounded-xl border border-purple-100 dark:border-purple-900/30 flex items-start gap-3 animate-fade-in">
                                                            <span className="text-lg leading-none mt-0.5">💡</span>
                                                            <p className="text-sm font-semibold text-purple-800 dark:text-purple-300 italic leading-relaxed">"{getSmartMotivation(task.title)}"</p>
                                                        </div>

                                                        {/* Quick Notes Area */}
                                                        <div className="flex flex-col gap-2">
                                                            <div className="flex items-center justify-between px-1">
                                                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">Quick Notes</label>
                                                                <span className={`text-[10px] font-black text-green-500 uppercase tracking-widest transition-opacity duration-300 flex items-center gap-1 ${notesSaved ? 'opacity-100' : 'opacity-0'}`}>
                                                                    ✓ Saved
                                                                </span>
                                                            </div>
                                                            <textarea 
                                                                value={activeNoteContent}
                                                                onChange={handleNotesChange}
                                                                onBlur={handleNotesBlur}
                                                                placeholder="Jot down thoughts, links, or progress here... Autosaves when you click away."
                                                                className="w-full bg-[#FAF8F4] dark:bg-gray-800 border border-[#E9DFD3] dark:border-gray-700 rounded-xl p-4 text-sm font-medium text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-purple-300 dark:focus:border-purple-700 focus:ring-4 focus:ring-purple-500/10 transition-all resize-y min-h-[120px] shadow-inner"
                                                            />
                                                        </div>

                                                        {/* Subtasks */}
                                                        <div className="flex flex-col gap-2">
                                                            <div className="flex items-center justify-between px-1">
                                                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">Subtasks</label>
                                                                <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500">
                                                                    {(task.subtasks || []).filter(s => s.completed).length}/{(task.subtasks || []).length}
                                                                </span>
                                                            </div>
                                                            
                                                            {(task.subtasks || []).length > 0 && (
                                                                <div className="space-y-1.5">
                                                                    {task.subtasks.map((sub) => (
                                                                        <div key={sub.id} className="flex items-center gap-2.5 group/sub px-1 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                                                            <button
                                                                                onClick={() => handleToggleSubtask(task.id, sub.id)}
                                                                                className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                                                                                    sub.completed
                                                                                        ? "bg-green-500 border-green-500"
                                                                                        : "border-gray-300 dark:border-gray-600 hover:border-purple-400"
                                                                                }`}
                                                                            >
                                                                                {sub.completed && (
                                                                                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                                    </svg>
                                                                                )}
                                                                            </button>
                                                                            <span className={`text-sm font-medium flex-1 transition-colors ${
                                                                                sub.completed ? "text-gray-400 dark:text-gray-500 line-through" : "text-gray-700 dark:text-gray-300"
                                                                            }`}>
                                                                                {sub.title}
                                                                            </span>
                                                                            <button
                                                                                onClick={() => handleDeleteSubtask(task.id, sub.id)}
                                                                                className="text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover/sub:opacity-100 transition-all text-xs"
                                                                                aria-label="Delete subtask"
                                                                            >
                                                                                ✖
                                                                            </button>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            <form
                                                                onSubmit={(e) => {
                                                                    e.preventDefault();
                                                                    handleAddSubtask(task.id, subtaskInput);
                                                                    setSubtaskInput("");
                                                                }}
                                                                className="flex gap-2"
                                                            >
                                                                <input
                                                                    type="text"
                                                                    value={subtaskInput}
                                                                    onChange={(e) => setSubtaskInput(e.target.value)}
                                                                    placeholder="Add a subtask..."
                                                                    className="flex-1 bg-[#FAF8F4] dark:bg-gray-800 border border-[#E9DFD3] dark:border-gray-700 rounded-lg px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-purple-300 dark:focus:border-purple-700 focus:ring-2 focus:ring-purple-500/10 transition-all"
                                                                />
                                                                <button
                                                                    type="submit"
                                                                    disabled={!subtaskInput.trim()}
                                                                    className="px-3 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-lg text-xs font-bold hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                                                >
                                                                    Add
                                                                </button>
                                                            </form>
                                                        </div>

                                                        {/* Tags */}
                                                        <div className="flex flex-col gap-2">
                                                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500 px-1">Tags</label>
                                                            
                                                            {(task.tags || []).length > 0 && (
                                                                <div className="flex flex-wrap gap-1.5">
                                                                    {task.tags.map((tag) => (
                                                                        <span key={tag} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30">
                                                                            {tag}
                                                                            <button
                                                                                onClick={() => handleRemoveTag(task.id, tag)}
                                                                                className="text-blue-400 dark:text-blue-500 hover:text-red-500 transition-colors text-xs"
                                                                                aria-label={`Remove tag ${tag}`}
                                                                            >
                                                                                ✖
                                                                            </button>
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            <form
                                                                onSubmit={(e) => {
                                                                    e.preventDefault();
                                                                    handleAddTag(task.id, tagInput);
                                                                    setTagInput("");
                                                                }}
                                                                className="flex gap-2"
                                                            >
                                                                <input
                                                                    type="text"
                                                                    value={tagInput}
                                                                    onChange={(e) => setTagInput(e.target.value)}
                                                                    placeholder="Add a tag..."
                                                                    className="flex-1 bg-[#FAF8F4] dark:bg-gray-800 border border-[#E9DFD3] dark:border-gray-700 rounded-lg px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-purple-300 dark:focus:border-purple-700 focus:ring-2 focus:ring-purple-500/10 transition-all"
                                                                />
                                                                <button
                                                                    type="submit"
                                                                    disabled={!tagInput.trim()}
                                                                    className="px-3 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg text-xs font-bold hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                                                >
                                                                    Add
                                                                </button>
                                                            </form>
                                                        </div>

                                                        {/* Bottom Bar: Complete Action */}
                                                        <div className="flex justify-between items-center pt-2">
                                                            <button
                                                                onClick={() => handleSaveAsTemplate(task)}
                                                                className="px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl transition-all active:scale-95"
                                                            >
                                                                Save as Template
                                                            </button>
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
                                            </SortableTaskCard>
                                        );
                                            })}
                                        </div>
                                    </SortableContext>
                                </DndContext>
                            ) : (
                                <div className="bg-white/60 dark:bg-gray-900/60 border border-[#E9DFD3] dark:border-gray-700 border-dashed rounded-[24px] p-12 flex flex-col items-center justify-center text-center animate-fade-in-up">
                                    <span className="text-5xl mb-4">{isOnlyRepeatingLeft ? "🌱" : "🎉"}</span>
                                    <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-2">
                                        {isOnlyRepeatingLeft ? "Great work." : "You're all caught up."}
                                    </h3>
                                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400 max-w-sm">
                                        {isOnlyRepeatingLeft ? "Keep your streak alive with these remaining habits." : "Enjoy the rest of your day."}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* RIGHT COLUMN: Milestones & Completed (25%) */}
                        <div className="w-full lg:w-1/4 flex flex-col gap-6">
                            
                            {/* Upcoming Milestones */}
                            <div className="bg-white dark:bg-gray-900 rounded-[22px] border border-[#E9DFD3]/80 dark:border-gray-700 p-5 shadow-[0_8px_24px_rgba(80,62,38,0.04)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
                                <h3 className="text-sm font-black tracking-tight text-gray-950 dark:text-gray-100 mb-4">⏳ Upcoming</h3>
                                {upcomingTasks.length > 0 ? (
                                    <div className="relative pl-2.5 space-y-4">
                                        <div className="absolute top-2 bottom-2 left-[13px] w-px bg-gray-100 dark:bg-gray-700"></div>
                                        {upcomingTasks.map((task, idx) => (
                                            <div key={idx} className="relative flex items-center gap-3 z-10 hover:opacity-80 transition-opacity">
                                                <div className="w-2 h-2 rounded-full ring-4 ring-white bg-gray-300 shrink-0"></div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 truncate">{task.title}</h4>
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
                            <div className="bg-[#FAF8F4] dark:bg-gray-800 rounded-[22px] border border-[#EFE5D9] dark:border-gray-700 p-2 shadow-sm">
                                <button 
                                    onClick={() => setCompletedExpanded(!completedExpanded)}
                                    className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-white dark:hover:bg-gray-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                                    aria-expanded={completedExpanded}
                                >
                                    <h3 className="text-sm font-black tracking-tight text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                        <span className="text-green-500 text-lg leading-none">✓</span> Completed Today
                                    </h3>
                                    <span className="text-gray-400 dark:text-gray-500 font-bold text-xs">{completedCount}</span>
                                </button>
                                
                                {completedExpanded && (
                                    <div className="px-3 pb-3 pt-1 space-y-2 animate-fade-in">
                                        {completedTasksList.length > 0 ? completedTasksList.map((task, idx) => (
                                            <div key={idx} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 shadow-3xs group transition-all">
                                                <h4 className="text-[11px] font-bold text-gray-400 dark:text-gray-500 line-through truncate flex-1">{task.title}</h4>
                                                <button
                                                    type="button"
                                                    onClick={() => handleUndoComplete(task.id)}
                                                    className="text-[9px] font-black uppercase text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 border border-purple-100 dark:border-purple-900/30 tracking-wider shrink-0 rounded-md px-2 py-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                                                >
                                                    Undo
                                                </button>
                                            </div>
                                        )) : (
                                            <p className="text-[11px] font-medium text-gray-400 dark:text-gray-500 px-2 py-1 italic">No tasks completed yet.</p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Saved Templates */}
                            {templates.length > 0 && (
                                <div className="bg-white dark:bg-gray-900 rounded-[22px] border border-[#E9DFD3]/80 dark:border-gray-700 p-5 shadow-[0_8px_24px_rgba(80,62,38,0.04)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
                                    <h3 className="text-sm font-black tracking-tight text-gray-950 dark:text-gray-100 mb-4">📋 Templates</h3>
                                    <div className="space-y-2">
                                        {templates.map((tpl) => (
                                            <div key={tpl.id} className="flex items-center gap-2 group/tpl p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="text-[11px] font-bold text-gray-700 dark:text-gray-300 truncate">{tpl.title}</h4>
                                                    <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500">{tpl.estimatedTime || "1 Hour"}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => handleUseTemplate(tpl)}
                                                        className="text-[9px] font-black uppercase text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 border border-purple-100 dark:border-purple-900/30 tracking-wider rounded-md px-2 py-1 transition-colors"
                                                    >
                                                        Use
                                                    </button>
                                                    <button
                                                        onClick={() => deleteTemplate(tpl.id)}
                                                        className="text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover/tpl:opacity-100 transition-all text-xs"
                                                        aria-label="Delete template"
                                                    >
                                                        ✖
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>

                </div>
            </div>
        </>
    );
}

export default TaskBoard;
