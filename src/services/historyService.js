// src/services/historyService.js
import { db } from "./firebaseService";
import { 
    collection, addDoc, query, where, orderBy, 
    getDocs, serverTimestamp, doc, setDoc, getDoc 
} from "firebase/firestore";

const getTodayKey = () => new Date().toLocaleDateString("en-CA");

const getWeekDates = () => {
    const now = new Date();
    const dayOfWeek = (now.getDay() + 6) % 7;
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now);
        d.setDate(d.getDate() - dayOfWeek + i);
        return d.toLocaleDateString("en-CA");
    });
};

export const logTaskCompletion = async (userId, task) => {
    if (!userId || !task) return;
    try {
        const taskTitle = typeof task === "string" ? task : task.title || task.task || "Untitled";
        const taskPriority = typeof task === "object" ? (task.priority || "MEDIUM") : "MEDIUM";
        const estimatedTime = typeof task === "object" ? (task.estimatedTime || null) : null;
        const actualTime = typeof task === "object" ? (task.actualTime || null) : null;

        await addDoc(collection(db, "completionLog"), {
            userId,
            taskTitle,
            priority: taskPriority,
            estimatedTime,
            actualTime,
            completedAt: serverTimestamp(),
            date: getTodayKey()
        });

        await updateDailySummary(userId);
    } catch (error) {
        console.error("Failed to log task completion:", error);
    }
};

export const logConfidenceChange = async (userId, oldScore, newScore, reason) => {
    if (!userId) return;
    try {
        await addDoc(collection(db, "confidenceHistory"), {
            userId,
            oldScore,
            newScore,
            delta: newScore - oldScore,
            reason: reason || "task_update",
            recordedAt: serverTimestamp(),
            date: getTodayKey()
        });
    } catch (error) {
        console.error("Failed to log confidence change:", error);
    }
};

export const updateDailySummary = async (userId) => {
    if (!userId) return;
    const today = getTodayKey();
    try {
        const completionsQuery = query(
            collection(db, "completionLog"),
            where("userId", "==", userId),
            where("date", "==", today)
        );
        const snapshot = await getDocs(completionsQuery);
        const completionsToday = snapshot.size;

        const tasksCompletedPerHour = {};
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const hour = data.completedAt?.toDate?.()?.getHours?.() ?? new Date().getHours();
            tasksCompletedPerHour[hour] = (tasksCompletedPerHour[hour] || 0) + 1;
        });

        const peakHour = Object.entries(tasksCompletedPerHour)
            .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

        const summaryRef = doc(db, "dailyHistory", `${userId}_${today}`);
        await setDoc(summaryRef, {
            userId,
            date: today,
            tasksCompleted: completionsToday,
            peakHour: peakHour !== null ? Number(peakHour) : null,
            updatedAt: serverTimestamp()
        }, { merge: true });
    } catch (error) {
        console.error("Failed to update daily summary:", error);
    }
};

export const getRecentConfidenceHistory = async (userId, days = 7) => {
    if (!userId) return [];
    try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const cutoffDate = cutoff.toLocaleDateString("en-CA");

        const q = query(
            collection(db, "confidenceHistory"),
            where("userId", "==", userId),
            where("date", ">=", cutoffDate),
            orderBy("date", "asc"),
            orderBy("recordedAt", "asc")
        );
        const snapshot = await getDocs(q);
        const entries = [];
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            entries.push({
                date: data.date,
                score: data.newScore,
                delta: data.delta,
                reason: data.reason,
                time: data.recordedAt?.toDate?.()?.toLocaleTimeString?.([], { hour: "2-digit", minute: "2-digit" }) ?? ""
            });
        });
        return entries;
    } catch (error) {
        console.error("Failed to fetch confidence history:", error);
        return [];
    }
};

export const getProductivityByDay = async (userId) => {
    if (!userId) return [];
    const weekDates = getWeekDates();
    const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const dayColors = ["#a855f7", "#3b82f6", "#22c55e", "#f97316", "#ec4899", "#8b5cf6", "#06b6d4"];

    try {
        const results = [];
        for (let i = 0; i < weekDates.length; i++) {
            const dayDate = weekDates[i];
            const summaryRef = doc(db, "dailyHistory", `${userId}_${dayDate}`);
            const summarySnap = await getDoc(summaryRef);
            let tasksCompleted = 0;
            if (summarySnap.exists()) {
                tasksCompleted = summarySnap.data().tasksCompleted || 0;
            } else {
                const completionsQuery = query(
                    collection(db, "completionLog"),
                    where("userId", "==", userId),
                    where("date", "==", dayDate)
                );
                const completionsSnap = await getDocs(completionsQuery);
                tasksCompleted = completionsSnap.size;
            }
            results.push({
                day: dayLabels[i],
                value: tasksCompleted,
                fill: dayColors[i]
            });
        }
        return results;
    } catch (error) {
        console.error("Failed to fetch productivity by day:", error);
        return dayLabels.map((day, i) => ({ day, value: 0, fill: dayColors[i] }));
    }
};

export const getCompletionStats = async (userId, days = 7) => {
    if (!userId) return { totalCompleted: 0, dailyAverage: 0, streakDays: 0 };
    try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const cutoffDate = cutoff.toLocaleDateString("en-CA");

        const q = query(
            collection(db, "completionLog"),
            where("userId", "==", userId),
            where("date", ">=", cutoffDate),
            orderBy("date", "asc")
        );
        const snapshot = await getDocs(q);
        const totalCompleted = snapshot.size;

        const dailyCounts = {};
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            dailyCounts[data.date] = (dailyCounts[data.date] || 0) + 1;
        });

        const daysWithCompletions = Object.keys(dailyCounts).length;
        const dailyAverage = daysWithCompletions > 0 
            ? Math.round((totalCompleted / daysWithCompletions) * 10) / 10 
            : 0;

        let streakDays = 0;
        const today = new Date();
        for (let i = 0; i < days; i++) {
            const checkDate = new Date(today);
            checkDate.setDate(checkDate.getDate() - i);
            const dateKey = checkDate.toLocaleDateString("en-CA");
            if (dailyCounts[dateKey] && dailyCounts[dateKey] > 0) {
                streakDays++;
            } else {
                break;
            }
        }

        return { totalCompleted, dailyAverage, streakDays };
    } catch (error) {
        console.error("Failed to fetch completion stats:", error);
        return { totalCompleted: 0, dailyAverage: 0, streakDays: 0 };
    }
};

export const exportInsightsData = async (userId) => {
    if (!userId) return null;
    try {
        const [confidenceHistory, completionStats, productivityByDay] = await Promise.all([
            getRecentConfidenceHistory(userId, 30),
            getCompletionStats(userId, 30),
            getProductivityByDay(userId)
        ]);

        return {
            exportedAt: new Date().toISOString(),
            confidenceHistory,
            completionStats,
            productivityByDay
        };
    } catch (error) {
        console.error("Failed to export insights data:", error);
        return null;
    }
};

export const exportToCSV = (insightsData) => {
    if (!insightsData) return "";

    const lines = ["Date,Confidence Score,Delta,Reason"];

    insightsData.confidenceHistory.forEach((entry) => {
        lines.push(`${entry.date},${entry.score},${entry.delta},${entry.reason}`);
    });

    if (insightsData.completionStats) {
        lines.push("");
        lines.push("Metric,Value");
        lines.push(`Total Completed,${insightsData.completionStats.totalCompleted}`);
        lines.push(`Daily Average,${insightsData.completionStats.dailyAverage}`);
        lines.push(`Streak Days,${insightsData.completionStats.streakDays}`);
    }

    return lines.join("\n");
};
