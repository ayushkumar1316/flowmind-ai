import { useState, useCallback } from "react";
import { Clock, Zap, ChevronRight, AlertTriangle, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { generateSaveMyDay } from "../services/gemini";

export default function SaveMyDayModal({ plan, onClose, onApply }) {
    const [hours, setHours] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [applying, setApplying] = useState(false);

    const handleGenerate = useCallback(async () => {
        const parsed = parseFloat(hours);
        if (!parsed || parsed <= 0 || parsed > 24) return;

        setLoading(true);
        setError(null);
        try {
            const triage = await generateSaveMyDay(parsed, plan);
            setResult(triage);
        } catch (err) {
            console.error("Save My Day failed:", err);
            setError("AI triage failed. Please try again.");
        } finally {
            setLoading(false);
        }
    }, [hours, plan]);

    const handleApply = useCallback(async () => {
        if (!result) return;
        setApplying(true);
        try {
            onApply(result);
        } finally {
            setApplying(false);
        }
    }, [result, onApply]);

    const totalHoursUsed = result?.strictlyDoToday?.reduce((sum, t) => sum + (t.hours || 0), 0) || 0;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

            <div className="relative bg-white rounded-[24px] shadow-[0_32px_80px_rgba(0,0,0,0.18)] w-full max-w-[640px] max-h-[90vh] overflow-hidden animate-fade-in-up">
                {/* Header */}
                <div className="px-6 pt-6 pb-4 border-b border-[#E9DFD3]">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center">
                                <Zap className="w-5 h-5 text-purple-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-gray-950 tracking-tight">Save My Day</h2>
                                <p className="text-[11px] font-semibold text-gray-400">AI will triage your tasks for available time</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                            aria-label="Close"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="px-6 py-5 overflow-y-auto max-h-[calc(90vh-140px)]">
                    {!result && !loading && (
                        <div className="flex flex-col items-center py-6">
                            <div className="w-16 h-16 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center mb-4">
                                <Clock className="w-8 h-8 text-purple-500" />
                            </div>
                            <h3 className="text-base font-black text-gray-900 mb-1">How many hours do you have today?</h3>
                            <p className="text-sm text-gray-500 text-center max-w-xs mb-6">
                                FlowMind will ruthlessly prioritize your tasks and build an optimized execution plan.
                            </p>

                            <div className="flex items-center gap-3 mb-4">
                                {[2, 4, 6, 8].map((h) => (
                                    <button
                                        key={h}
                                        onClick={() => setHours(String(h))}
                                        className={`px-4 py-2.5 rounded-xl text-sm font-bold border transition-all ${
                                            hours === String(h)
                                                ? "bg-purple-600 text-white border-purple-600 shadow-lg shadow-purple-500/20"
                                                : "bg-white text-gray-700 border-[#E9DFD3] hover:border-purple-200 hover:bg-purple-50"
                                        }`}
                                    >
                                        {h}h
                                    </button>
                                ))}
                            </div>

                            <div className="relative w-full max-w-[200px] mb-6">
                                <input
                                    type="number"
                                    min="0.5"
                                    max="24"
                                    step="0.5"
                                    value={hours}
                                    onChange={(e) => setHours(e.target.value)}
                                    placeholder="Custom hours"
                                    className="w-full px-4 py-3 rounded-xl border border-[#E9DFD3] bg-[#FAF8F4] text-center text-lg font-black text-gray-900 placeholder-gray-300 focus:outline-none focus:border-purple-300 focus:ring-4 focus:ring-purple-500/10 transition-all"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">hrs</span>
                            </div>

                            <button
                                onClick={handleGenerate}
                                disabled={!hours || parseFloat(hours) <= 0}
                                className="px-8 py-3 bg-purple-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-purple-500/20 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 flex items-center gap-2"
                            >
                                <Zap className="w-4 h-4" />
                                Triage My Day
                            </button>
                        </div>
                    )}

                    {loading && (
                        <div className="flex flex-col items-center py-12">
                            <Loader2 className="w-10 h-10 text-purple-500 animate-spin mb-4" />
                            <h3 className="text-base font-black text-gray-900 mb-1">AI is triaging your tasks...</h3>
                            <p className="text-sm text-gray-500">Analyzing priorities and time allocation</p>
                        </div>
                    )}

                    {error && (
                        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl mb-4">
                            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                            <p className="text-sm font-semibold text-red-600">{error}</p>
                        </div>
                    )}

                    {result && !loading && (
                        <div className="space-y-5">
                            {/* Confidence Message */}
                            <div className="bg-purple-50/50 border border-purple-100 rounded-xl p-4">
                                <p className="text-sm font-semibold text-purple-800 italic leading-relaxed">
                                    "{result.confidenceMessage}"
                                </p>
                            </div>

                            {/* Strictly Do Today */}
                            {result.strictlyDoToday?.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                                        <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider">Do This Now</h4>
                                        <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-md border border-green-100">
                                            {result.strictlyDoToday.length} tasks · {totalHoursUsed}h
                                        </span>
                                    </div>
                                    <div className="space-y-2">
                                        {result.strictlyDoToday.map((item, i) => (
                                            <div key={i} className="flex items-start gap-3 p-3 bg-green-50/50 border border-green-100 rounded-xl">
                                                <span className="w-6 h-6 rounded-lg bg-green-500 text-white text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">
                                                    {i + 1}
                                                </span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold text-gray-900">{item.task}</p>
                                                    <p className="text-[11px] text-gray-500 mt-0.5">{item.reason}</p>
                                                </div>
                                                <span className="text-[11px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded shrink-0">
                                                    {item.hours}h
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Postpone */}
                            {result.postponeTomorrow?.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <ChevronRight className="w-4 h-4 text-amber-500" />
                                        <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider">Push to Tomorrow</h4>
                                    </div>
                                    <div className="space-y-2">
                                        {result.postponeTomorrow.map((item, i) => (
                                            <div key={i} className="flex items-start gap-3 p-3 bg-amber-50/50 border border-amber-100 rounded-xl">
                                                <span className="text-sm mt-0.5">📅</span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold text-gray-900">{item.task}</p>
                                                    <p className="text-[11px] text-gray-500 mt-0.5">{item.reason}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Drop */}
                            {result.dropCancel?.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <XCircle className="w-4 h-4 text-red-400" />
                                        <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider">Drop / Cancel</h4>
                                    </div>
                                    <div className="space-y-2">
                                        {result.dropCancel.map((item, i) => (
                                            <div key={i} className="flex items-start gap-3 p-3 bg-red-50/30 border border-red-100/60 rounded-xl">
                                                <span className="text-sm mt-0.5">🗑</span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold text-gray-500 line-through">{item.task}</p>
                                                    <p className="text-[11px] text-gray-400 mt-0.5">{item.reason}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {result && !loading && (
                    <div className="px-6 py-4 border-t border-[#E9DFD3] flex items-center justify-between bg-[#FAF8F4]">
                        <button
                            onClick={() => { setResult(null); setHours(""); setError(null); }}
                            className="px-4 py-2 text-sm font-bold text-gray-600 hover:text-gray-900 hover:bg-white rounded-xl transition-colors"
                        >
                            ← Try Again
                        </button>
                        <button
                            onClick={handleApply}
                            disabled={applying}
                            className="px-6 py-2.5 bg-purple-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-purple-500/20 hover:bg-purple-500 disabled:opacity-50 transition-all active:scale-95 flex items-center gap-2"
                        >
                            {applying ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Applying...</>
                            ) : (
                                <>Apply Execution Plan</>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
