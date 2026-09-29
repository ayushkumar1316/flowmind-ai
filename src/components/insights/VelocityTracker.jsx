/**
 * VelocityTracker — week-over-week productivity velocity chart
 */
import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Activity, Sparkles } from "lucide-react";
import { db } from "../../services/firebaseService";
import { collection, query, where, getDocs } from "firebase/firestore";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Map a YYYY-MM-DD key to its Mon=0..Sun=6 index. */
const dayIdxFor = (dateStr) => {
    const d = new Date(`${dateStr}T00:00:00Z`);
    return (d.getDay() + 6) % 7;
};

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white dark:bg-gray-900 border border-[#E9DFD3] dark:border-gray-700 p-3 rounded-xl shadow-[0_8px_24px_rgba(80,62,38,0.08)]">
                <p className="text-gray-400 dark:text-gray-500 text-[10px] font-black uppercase tracking-wider mb-1">{label}</p>
                <p className="text-purple-600 font-black text-sm">{`${payload[0].value} tasks completed`}</p>
            </div>
        );
    }
    return null;
};

export default function VelocityTracker({ userId }) {
    const [weeklyVelocity, setWeeklyVelocity] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;

        const fetchData = async () => {
            try {
                // Last 7 days, oldest first.
                const weekDates = Array.from({ length: 7 }, (_, i) => {
                    const d = new Date();
                    d.setDate(d.getDate() - (6 - i));
                    return d.toLocaleDateString("en-CA");
                });

                const results = await Promise.all(
                    weekDates.map(async (dayDate) => {
                        const q = query(
                            collection(db, "completionLog"),
                            where("userId", "==", userId),
                            where("date", "==", dayDate)
                        );
                        const snap = await getDocs(q);
                        return {
                            date: dayDate.slice(5),
                            day: DAY_LABELS[dayIdxFor(dayDate)],
                            velocity: snap.size,
                        };
                    })
                );

                if (!cancelled) setWeeklyVelocity(results);
            } catch (err) {
                console.error("Failed to fetch velocity:", err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchData();
        return () => { cancelled = true; };
    }, [userId]);

    if (loading) {
        return (
            <div className="bg-white dark:bg-gray-900 rounded-[24px] border border-[#E9DFD3] dark:border-gray-700 p-6 animate-pulse space-y-4">
                <div className="h-5 w-1/3 bg-gray-200 dark:bg-gray-700 rounded"></div>
                <div className="h-[180px] bg-gray-200 dark:bg-gray-700 rounded-[16px]"></div>
            </div>
        );
    }

    const hasData = weeklyVelocity.some(d => d.velocity > 0);
    const avgVelocity = hasData
        ? (weeklyVelocity.reduce((s, d) => s + d.velocity, 0) / weeklyVelocity.length).toFixed(1)
        : 0;

    return (
        <div className="bg-white dark:bg-gray-900 rounded-[24px] border border-[#E9DFD3] dark:border-gray-700 p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 flex items-center justify-center">
                        <Activity className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                        <h3 className="text-base font-black text-gray-950 dark:text-gray-100">Velocity Tracker</h3>
                        <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500">Tasks completed per day (last 7 days)</p>
                    </div>
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1 rounded-full border border-blue-100 dark:border-blue-800">
                    Avg: {avgVelocity}/day
                </span>
            </div>

            {/* Chart */}
            {hasData ? (
                <div className="w-full h-[180px] pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={weeklyVelocity} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                            <XAxis dataKey="day" stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} fontWeight="bold" />
                            <YAxis stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} />
                            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#e5e7eb', strokeWidth: 1, strokeDasharray: '4 4' }} />
                            <Line
                                type="monotone"
                                dataKey="velocity"
                                stroke="#3b82f6"
                                strokeWidth={3}
                                dot={{ fill: '#fff', stroke: '#60a5fa', strokeWidth: 2, r: 4 }}
                                activeDot={{ r: 6, fill: '#60a5fa', stroke: '#fff', strokeWidth: 2 }}
                                animationDuration={800}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            ) : (
                <div className="py-8 text-center">
                    <Sparkles className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                    <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">No velocity data yet</p>
                    <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-1">Complete tasks daily to see your momentum</p>
                </div>
            )}
        </div>
    );
}