/**
 * FocusHeatmap — visual productivity heatmap by hour of day
 * Data source: completionLog peakHour from Firestore
 */
import { useState, useEffect } from "react";
import { Flame, Activity } from "lucide-react";
import { db } from "../../services/firebaseService";
import { collection, query, where, getDocs } from "firebase/firestore";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getHeatColor(count, maxCount) {
    if (count === 0) return "bg-gray-100 dark:bg-gray-800";
    const intensity = maxCount > 0 ? count / maxCount : 0;
    if (intensity > 0.75) return "bg-purple-600";
    if (intensity > 0.5) return "bg-purple-500";
    if (intensity > 0.25) return "bg-purple-400";
    return "bg-purple-300 dark:bg-purple-400";
}

export default function FocusHeatmap({ userId }) {
    const [hourlyData, setHourlyData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [peakHour, setPeakHour] = useState(null);

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;

        const fetchData = async () => {
            try {
                // Get last 30 days of completions
                const cutoff = new Date();
                cutoff.setDate(cutoff.getDate() - 30);
                const cutoffDate = cutoff.toLocaleDateString("en-CA");

                const q = query(
                    collection(db, "completionLog"),
                    where("userId", "==", userId),
                    where("date", ">=", cutoffDate)
                );
                const snap = await getDocs(q);

                const hourCounts = Array(24).fill(0);
                snap.forEach((docSnap) => {
                    const data = docSnap.data();
                    const hour = data.completedAt?.toDate?.()?.getHours?.();
                    if (typeof hour === "number" && hour >= 0 && hour < 24) {
                        hourCounts[hour]++;
                    }
                });

                if (!cancelled) {
                    const maxCount = Math.max(...hourCounts);
                    setHourlyData(HOURS.map(h => ({ hour: h, count: hourCounts[h], color: getHeatColor(hourCounts[h], maxCount) })));
                    const peakIdx = hourCounts.indexOf(maxCount);
                    setPeakHour(maxCount > 0 ? peakIdx : null);
                }
            } catch (e) {
                console.error("Failed to fetch hourly data:", e);
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
                <div className="grid grid-cols-24 gap-1">
                    {HOURS.map(h => <div key={h} className="h-8 bg-gray-200 dark:bg-gray-700 rounded" />)}
                </div>
            </div>
        );
    }

    const hasData = hourlyData.some(d => d.count > 0);

    return (
        <div className="bg-white dark:bg-gray-900 rounded-[24px] border border-[#E9DFD3] dark:border-gray-700 p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800 flex items-center justify-center">
                        <Flame className="w-5 h-5 text-orange-500" />
                    </div>
                    <div>
                        <h3 className="text-base font-black text-gray-950 dark:text-gray-100">Focus Heatmap</h3>
                        <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500">When you complete tasks most (last 30 days)</p>
                    </div>
                </div>
                {peakHour !== null && (
                    <span className="text-[10px] font-black uppercase tracking-widest text-orange-600 bg-orange-50 dark:bg-orange-900/20 px-2.5 py-1 rounded-full border border-orange-100 dark:border-orange-800">
                        Peak: {peakHour}:00
                    </span>
                )}
            </div>

            {/* Heatmap Grid */}
            {hasData ? (
                <>
                    <div className="grid grid-cols-12 gap-1 sm:grid-cols-24">
                        {hourlyData.map((cell) => (
                            <div
                                key={cell.hour}
                                className={`aspect-square rounded ${cell.color} transition-all duration-300 hover:scale-110 cursor-pointer`}
                                title={`${cell.hour}:00 — ${cell.count} task${cell.count !== 1 ? 's' : ''} completed`}
                            />
                        ))}
                    </div>
                    <div className="flex items-center justify-between text-[9px] font-bold text-gray-400 dark:text-gray-500">
                        <span>12 AM</span>
                        <span>6 AM</span>
                        <span>12 PM</span>
                        <span>6 PM</span>
                        <span>11 PM</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Less</span>
                        <div className="flex gap-0.5">
                            <div className="w-3 h-3 rounded bg-gray-100 dark:bg-gray-800" />
                            <div className="w-3 h-3 rounded bg-purple-300 dark:bg-purple-400" />
                            <div className="w-3 h-3 rounded bg-purple-400" />
                            <div className="w-3 h-3 rounded bg-purple-500" />
                            <div className="w-3 h-3 rounded bg-purple-600" />
                        </div>
                        <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">More</span>
                    </div>
                </>
            ) : (
                <div className="py-8 text-center">
                    <Activity className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                    <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">No task completion data yet</p>
                    <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-1">Complete tasks to see your focus patterns</p>
                </div>
            )}
        </div>
    );
}