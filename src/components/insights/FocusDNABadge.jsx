/**
 * FocusDNABadge — compact badge displaying your Focus DNA trait score
 * Used as a standalone visual badge in the Insights dashboard
 */
import { Target, Brain, Clock, Zap } from "lucide-react";

function getScoreColor(score) {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-blue-500";
    if (score >= 40) return "text-amber-500";
    return "text-red-500";
}


export default function FocusDNABadge({ dna, label = "Focus DNA" }) {
    if (!dna) return null;

    const traits = [
        { key: "focus", label: "Focus", icon: Target, score: dna.focus || 0 },
        { key: "discipline", label: "Discipline", icon: Zap, score: dna.discipline || 0 },
        { key: "consistency", label: "Consistency", icon: Clock, score: dna.consistency || 0 },
    ];

    const topTrait = traits.sort((a, b) => b.score - a.score)[0];

    return (
        <div className="bg-white dark:bg-gray-900 rounded-[24px] border border-[#E9DFD3] dark:border-gray-700 p-6 space-y-5">
            {/* Badge Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-lg shadow-purple-500/20">
                        <Brain className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-gray-950 dark:text-gray-100">{label}</h3>
                        <p className="text-[11px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                            Peak Trait: {topTrait?.label || "—"}
                        </p>
                    </div>
                </div>
            </div>

            {/* Circular Scores */}
            <div className="grid grid-cols-3 gap-4">
                {traits.map((trait) => {
                    const Icon = trait.icon;
                    const colorClass = getScoreColor(trait.score);
                    return (
                        <div key={trait.key} className="flex flex-col items-center space-y-2">
                            <div className="relative w-20 h-20">
                                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                                    <circle
                                        cx="40" cy="40" r="34"
                                        stroke="currentColor"
                                        strokeWidth="6"
                                        fill="none"
                                        className="text-gray-100 dark:text-gray-800"
                                    />
                                    <circle
                                        cx="40" cy="40" r="34"
                                        stroke="currentColor"
                                        strokeWidth="6"
                                        fill="none"
                                        strokeLinecap="round"
                                        strokeDasharray={`${(trait.score / 100) * 213.6} 213.6`}
                                        className={`${colorClass}`}
                                    />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Icon className={`w-5 h-5 ${colorClass}`} />
                                </div>
                            </div>
                            <div className="text-center">
                                <span className={`text-xl font-black ${colorClass}`}>{trait.score}%</span>
                                <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mt-0.5">
                                    {trait.label}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Insight */}
            <div className="p-3.5 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 leading-relaxed">
                    Your strongest trait is <span className="font-black text-purple-700 dark:text-purple-300">{topTrait?.label}</span> at{" "}
                    <span className="font-black text-purple-700 dark:text-purple-300">{topTrait?.score}%</span>.
                    {topTrait?.score >= 70
                        ? " You're in a strong rhythm — protect this strength."
                        : " Focus on improving this area for better execution."}
                </p>
            </div>
        </div>
    );
}