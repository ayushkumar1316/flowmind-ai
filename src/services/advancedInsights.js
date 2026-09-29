import { db } from "./firebaseService";
import {
    collection, query, where, orderBy, getDocs
} from "firebase/firestore";

/**
 * Advanced Insights Services — Plan 5
 *
 * These services compute analytics from Firestore completionLog and confidenceHistory,
 * and feed the Insights page. They do NOT render UI; they return plain JS objects
 * that Insights.jsx reads via useMemo/useEffect.
 *
 * All functions are deliberately pure or safe Firestore reads; they never throw
 * (return null on missing data) so the Insights page can render unconditionally.
 */

export const generateWeeklySummary = async (userId, insightsData) => {
    if (!userId) return null;
    try {
        const total = insightsData.completionStats?.totalCompleted || 0;
        const rate = insightsData.completionStats?.dailyAverage || 0;
        const confidence = insightsData.overview?.confidenceScore || 0;

        let recommendation = "";
        if (confidence >= 80) recommendation = "Maintain your strong execution pace";
        else if (confidence >= 60) recommendation = "Focus on high-priority tasks to boost confidence";
        else recommendation = "Prioritize critical tasks to recover momentum";

        const headline = total >= 10 ? "Strong Week of Execution" : "Progressing Consistently";

        return {
            headline,
            accomplishment: `Completed ${total} tasks this week with ${rate}/day average`,
            challenge: confidence < 70 ? "Some deadlines at risk" : "Fine-tuning schedule optimization",
            recommendation,
            confidence: confidence >= 75 ? "High" : confidence >= 50 ? "Medium" : "Low"
        };
    } catch { return null; }
};

export const calculateVelocity = async (userId) => {
    if (!userId) return null;
    try {
        const now = new Date();
        const currentWeek = getWeekRange(now);
        const prevDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const previousWeek = getWeekRange(prevDate);

        const completionsQuery = (start, end) =>
            query(collection(db, "completionLog"),
                where("userId", "==", userId),
                where("completedAt", ">=", start),
                where("completedAt", "<=", end));

        const [curSnap, prevSnap] = await Promise.all([
            getDocs(completionsQuery(currentWeek.start, currentWeek.end)),
            getDocs(completionsQuery(previousWeek.start, previousWeek.end))
        ]);

        const current = curSnap.size;
        const previous = prevSnap.size;
        const velocity = previous > 0 ? ((current - previous) / previous) * 100 : current > 0 ? 100 : 0;

        return { current, previous, velocity: Math.round(velocity * 10) / 10 };
    } catch { return null; }
};

export const generateFocusDNA = async (userId) => {
    if (!userId) return null;
    try {
        const completionsQuery = query(collection(db, "completionLog"),
            where("userId", "==", userId),
            where("date", ">=", getWeekStartDate()));

        const snapshot = await getDocs(completionsQuery);
        const tasks = snapshot.docs.map(d => d.data());

        const highPriDone = tasks.filter(t => t.priority === "HIGH" && t.completed).length;
        const totalHighPri = tasks.filter(t => t.priority === "HIGH").length;
        const score = totalHighPri > 0 ? (highPriDone / totalHighPri) * 100 : 0;

        const profile = score >= 85 ? "laser" : score >= 70 ? "high" : score >= 50 ? "developing" : "balanced";

        return {
            type: "focus-dna",
            profile,
            score: Math.round(score),
            description: profileDesc(profile),
            recommendations: profileRecs(profile),
            color: profileColor(profile)
        };
    } catch { return null; }
};

export const getFocusHeatmapData = async (userId) => {
    if (!userId) return null;
    try {
        const completionsQuery = query(collection(db, "completionLog"),
            where("userId", "==", userId),
            where("date", ">=", getWeekStartDate()));

        const snapshot = await getDocs(completionsQuery);

        const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, tasks: 0 }));
        snapshot.forEach(doc => {
            const hour = doc.data().completedAt?.toDate?.()?.getHours?.() || new Date().getHours();
            if (hour >= 0 && hour <= 23) hourly[hour].tasks++;
        });

        const max = Math.max(...hourly.map(h => h.tasks), 1);
        return hourly.map(h => ({ ...h, percentage: (h.tasks / max) * 100 }));
    } catch { return null; }
};

export const getEnhancedMonthlyView = async (userId) => {
    if (!userId) return null;
    try {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);

        const completionsQuery = query(collection(db, "completionLog"),
            where("userId", "==", userId),
            where("date", ">=", start.toISOString().slice(0, 10)),
            orderBy("date", "asc"));

        const snapshot = await getDocs(completionsQuery);

        const daily = {};
        let total = 0, peak = null, peakCount = 0;
        snapshot.forEach(doc => {
            const d = doc.data();
            daily[d.date] = (daily[d.date] || 0) + 1;
            total++;
            if (daily[d.date] > peakCount) { peakCount = daily[d.date]; peak = d.date; }
        });

        const avg = total / Object.keys(daily).length || 0;
        const weekly = [];
        for (let w = 1; w <= 4; w++) {
            const ws = new Date(start);
            ws.setDate(start.getDate() + (w - 1) * 7);
            const we = new Date(ws);
            we.setDate(ws.getDate() + 6);

            const wTasks = Object.entries(daily).reduce((s, [dt, ct]) => {
                const dobj = new Date(dt);
                return dobj >= ws && dobj <= we ? s + ct : s;
            }, 0);

            weekly.push({ week: "Week " + w, tasks: wTasks, efficiency: Math.round((wTasks / 7) * 100) / 100 });
        }

        return { total, averageDaily: Math.round(avg * 10) / 10, peakDay: peak, peakCount, weeklyTrend: weekly };
    } catch { return null; }
};

// --- Helpers (internal) ---
const getWeekRange = (date) => {
    const day = (date.getDay() + 6) % 7;
    const start = new Date(date); start.setDate(date.getDate() - day); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
    return { start, end };
};

const getWeekStartDate = () => {
    const now = new Date();
    const day = (now.getDay() + 6) % 7;
    const start = new Date(now); start.setDate(now.getDate() - day);
    return start.toISOString().slice(0, 10);
};

const profileDesc = (p) => ({
    laser: "Exceptional focus on high-impact tasks",
    high: "Strong focus on priority work",
    balanced: "Good balance across task types",
    developing: "Building focus discipline"
}[p] || "Focus profile developing");

const profileRecs = (p) => ({
    laser: ["Maintain current focus", "Delegate low-priority items"],
    high: ["Strengthen priority discipline", "Minimize distractions"],
    balanced: ["Enhance priority focus", "Try time-blocking"],
    developing: ["Practice focused work blocks", "Review prioritization system"]
}[p] || ["Build better focus habits"]);

const profileColor = (p) => ({
    laser: "text-purple-600 bg-purple-50 border-purple-200",
    high: "text-blue-600 bg-blue-50 border-blue-200",
    balanced: "text-green-600 bg-green-50 border-green-200",
    developing: "text-amber-600 bg-amber-50 border-amber-100"
}[p] || "text-gray-600 bg-gray-50 border-gray-200");