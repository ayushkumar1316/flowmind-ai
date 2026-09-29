/**
 * WeeklySummaryCard — AI-generated weekly execution summary
 * Shows: summary, risk level, recommendation, prediction, motivation
 */
import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, CheckCircle, TrendingUp, TrendingDown, Minus, Brain, Sparkles } from "lucide-react";
import { generateWeeklyAIInsight } from "../../services/historyService";

const riskIcons = {
    low: { icon: CheckCircle, color: "text-green-500", bg: "bg-green-50 dark:bg-green-900/20", border: "border-green-100 dark:border-green-800" },
    medium: { icon: Minus, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-900/20", border: "border-amber-100 dark:border-amber-800" },
    high: { icon: AlertTriangle, color: "text-red-500", bg: "bg-red-50 dark:bg-red-900/20", border: "border-red-100 dark:border-red-800" },
    unknown: { icon: Brain, color: "text-gray-400", bg: "bg-gray-50 dark:bg-gray-800/50", border: "border-gray-100 dark:border-gray-700" }
};

const trendIcons = {
    up: { icon: TrendingUp, color: "text-green-500", label: "Trending Up" },
    down: { icon: TrendingDown, color: "text-red-500", label: "Trending Down" },
    stable: { icon: Minus, color: "text-blue-500", label: "Stable" },
    volatile: { icon: Sparkles, color: "text-purple-500", label: "Volatile" }
};

export default function WeeklySummaryCard({ userId, weekStartDate }) {
    const [insight, setInsight] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

const fetchInsight = useCallback(async () => {
        if (!userId) return;
        setLoading(true);
        setError(null);
        try {
            const result = await generateWeeklyAIInsight(userId, weekStartDate);
            setInsight(result);
        } catch {
            setError("Failed to load weekly insight");
        } finally {
            setLoading(false);
        }
    }, [userId, weekStartDate]);
    useEffect(() => {
        if (!userId) return;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const result = await generateWeeklyAIInsight(userId, weekStartDate);
                setInsight(result);
            } catch {
                setError("Failed to load weekly insight");
            } finally {
                setLoading(false);
            }
        })();
    }, [userId, weekStartDate]);

    if (loading) {
        return (
            <div className="bg-white dark:bg-gray-900 rounded-[24px] border border-[#E9DFD3] dark:border-gray-700 p-6 animate-pulse space-y-4">
                <div className="h-5 w-1/4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded"></div>
                <div className="h-4 w-1/2 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </div>
        );
    }

    if (error || !insight) {
        return (
            <div className="bg-white dark:bg-gray-900 rounded-[24px] border border-[#E9DFD3] dark:border-gray-700 p-6 text-center text-gray-500">
                <Brain className="w-10 h-10 mx-auto text-gray-300 mb-3" />
                <p className="font-medium">Unable to load weekly insight</p>
                <button onClick={fetchInsight} className="mt-3 text-sm text-purple-600 hover:underline">Retry</button>
            </div>
        );
    }

    const RiskIcon = riskIcons[insight.riskLevel]?.icon || Brain;
    const riskStyle = riskIcons[insight.riskLevel] || riskIcons.unknown;
    const TrendIcon = trendIcons[insight.trend]?.icon || Minus;
    const trendStyle = trendIcons[insight.trend] || trendIcons.stable;

    return (
        <div className="bg-white dark:bg-gray-900 rounded-[24px] border border-[#E9DFD3] dark:border-gray-700 p-6 space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${riskStyle.bg} ${riskStyle.border}`}>
                        <RiskIcon className={`w-5 h-5 ${riskStyle.color}`} />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-gray-950 dark:text-gray-100">Weekly AI Summary</h3>
                        <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                            Week of {new Date(weekStartDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <TrendIcon className={`w-4 h-4 ${trendStyle.color}`} />
                    <span className={`text-[10px] font-black uppercase tracking-widest ${trendStyle.color}`}>{trendStyle.label}</span>
                </div>
            </div>

            {/* AI Summary */}
            <div className="bg-[#FAF8F4] dark:bg-gray-800/50 rounded-xl p-4 border border-[#E9DFD3] dark:border-gray-700">
                <Sparkles className="w-4 h-4 text-purple-500 mb-2" />
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{insight.summary}</p>
            </div>

            {/* Recommendation + Prediction + Motivation */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
                    <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-1">
                        <Sparkles className="w-3 h-3" />
                        Recommendation
                    </div>
                    <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{insight.recommendation}</p>
                </div>

                <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800">
                    <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400 mb-1">
                        <TrendingUp className="w-3 h-3" />
                        Prediction
                    </div>
                    <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{insight.prediction}</p>
                </div>

                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800">
                    <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-1">
                        <Brain className="w-3 h-3" />
                        Motivation
                    </div>
                    <p className="text-xs font-medium text-gray-800 dark:text-gray-200 italic">"{insight.motivation}"</p>
                </div>
            </div>

            {/* Stats Row */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E9DFD3] dark:border-gray-700">
                <div className="flex items-center gap-4 text-xs">
                    <span className="text-gray-400 dark:text-gray-500">Confidence</span>
                    <span className="font-black text-gray-950 dark:text-gray-100">{insight.confidenceScore}%</span>
                    <span className="text-gray-400 dark:text-gray-500">Peak Day</span>
                    <span className="font-black text-purple-600 dark:text-purple-400">{insight.peakProductivityDay}</span>
                </div>
                <button onClick={fetchInsight} className="text-[10px] font-black uppercase tracking-wider text-purple-600 hover:underline flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Regenerate
                </button>
            </div>
        </div>
    );
}