import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
    Brain, CheckCircle2, AlertCircle, Loader2, GraduationCap, Briefcase,
    Laptop, Sparkles, Sun, Sunset, Moon, Clock, Search, Rocket, Palette, Check, CloudSun
} from "lucide-react";
import { checkAuthState, getUserProfile, completeUserSetup } from "../services/authService";


function SetupPage() {
    const navigate = useNavigate();
    const [isInitializing, setIsInitializing] = useState(true);
    const [currentUser, setCurrentUser] = useState(null);

    const [formData, setFormData] = useState({
        name: "",
        occupation: "",
        availableHours: 6,
        preferredWorkTime: ""
    });

    const [selectedGoalChip, setSelectedGoalChip] = useState("");
    const [customGoalText, setCustomGoalText] = useState("");

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showSuccess, setShowSuccess] = useState(false);
    const [successStep, setSuccessStep] = useState(0);

    useEffect(() => {
        let isMounted = true;

        const unsubscribe = checkAuthState(async (user) => {
            if (!isMounted) return;

            if (user) {
                try {
                    const profile = await getUserProfile(user.uid);
                    if (!isMounted) return;

                    if (profile?.profileCompleted) {
                        navigate("/", { replace: true });
                    } else {
                        setCurrentUser(user);

                        const existingProfile = profile?.profile || {};
                        setFormData(prev => ({
                            ...prev,
                            name: existingProfile.name || user.displayName || "",
                            occupation: existingProfile.occupation || "",
                            availableHours: existingProfile.availableHours || 6,
                            preferredWorkTime: existingProfile.preferredWorkTime || ""
                        }));

                        if (existingProfile.goal) {
                            const standardGoals = ["Get a Job", "Study Better", "Build Projects", "Fitness", "Stay Organized"];
                            if (standardGoals.includes(existingProfile.goal)) {
                                setSelectedGoalChip(existingProfile.goal);
                            } else {
                                setSelectedGoalChip("Other");
                                setCustomGoalText(existingProfile.goal);
                            }
                        }

                        setIsInitializing(false);
                    }
                } catch (err) {
                    console.error("Error fetching profile:", err);
                    if (isMounted) setIsInitializing(false);
                }
            } else {
                navigate("/login", { replace: true });
            }
        });

        return () => {
            isMounted = false;
            if (typeof unsubscribe === "function") {
                unsubscribe();
            }
        };
    }, [navigate]);

    useEffect(() => {
        let stepTimer;
        let navTimer;

        if (showSuccess && successStep < 4) {
            stepTimer = setTimeout(() => {
                setSuccessStep(prev => prev + 1);
            }, 600);
        } else if (showSuccess && successStep >= 4) {
            navTimer = setTimeout(() => navigate("/", { replace: true }), 400);
        }

        return () => {
            if (stepTimer) clearTimeout(stepTimer);
            if (navTimer) clearTimeout(navTimer);
        };
    }, [showSuccess, successStep, navigate]);

    const occupations = [
        { id: "Student", icon: GraduationCap },
        { id: "Working Professional", icon: Briefcase },
        { id: "Job Seeker", icon: Search },
        { id: "Freelancer", icon: Laptop },
        { id: "Founder", icon: Rocket },
        { id: "Creator", icon: Palette },
        { id: "Other", icon: Sparkles }
    ];

    const goals = [
        { id: "Get a Job", label: "💼 Get a Job" },
        { id: "Study Better", label: "📚 Study Better" },
        { id: "Build Projects", label: "🚀 Build Projects" },
        { id: "Fitness", label: "🏋️ Fitness" },
        { id: "Stay Organized", label: "🎯 Stay Organized" },
        { id: "Other", label: "➕ Other" }
    ];

    const workTimes = [
        { id: "Morning", icon: Sun },
        { id: "Afternoon", icon: CloudSun },
        { id: "Evening", icon: Sunset },
        { id: "Night", icon: Moon },
        { id: "Flexible", icon: Clock }
    ];

    const successSequence = [
        "Profile Created",
        "Preparing Dashboard",
        "Personalizing AI",
        "Loading Workspace"
    ];

    const getHoursHelper = (hours) => {
        const h = Number(hours);
        if (h <= 3) return "Light Schedule";
        if (h <= 6) return "Balanced Schedule";
        if (h <= 10) return "High Productivity";
        return "Power User";
    };

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        if (isLoading) return;

        setError(null);

        const cleanName = formData.name.trim().replace(/\s+/g, ' ');
        const finalGoal = selectedGoalChip === "Other" ? customGoalText.trim().replace(/\s+/g, ' ') : selectedGoalChip;
        const hours = Number(formData.availableHours);

        if (!cleanName || cleanName.length < 2) return setError("Please enter a valid full name.");
        if (!formData.occupation) return setError("Please select an occupation.");
        if (!finalGoal || finalGoal.length < 3) return setError("Please provide a valid primary goal.");
        if (!formData.preferredWorkTime) return setError("Please select a preferred working time.");
        if (hours < 1 || hours > 16) return setError("Hours must be between 1 and 16.");

        setIsLoading(true);

        try {
            await completeUserSetup(currentUser.uid, {
                ...formData,
                name: cleanName,
                goal: finalGoal,
            });

            console.log("✅ Profile setup completed");

            setShowSuccess(true);

            // Give the success animation time to play
            setTimeout(() => {
                navigate("/");
            }, 1500);

        } catch (error) {
            console.error("❌ Setup failed:", error);
            setError(error.message || "Failed to complete setup.");
        } finally {
            setIsLoading(false);
        }
    }
        if (isInitializing) {
            return (
                <div className="min-h-screen w-full bg-[#F6F1EA] flex items-center justify-center p-4">
                    <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
                </div>
            );
        }

        return (
            <div className="min-h-screen w-full bg-[#F6F1EA] flex items-center justify-center p-4 relative overflow-hidden font-sans">
                <style>{`
        @keyframes fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fade-in 0.4s ease-out forwards; }
        .animate-fade-in-fast { animation: fade-in 0.2s ease-out forwards; }
      `}</style>

                <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-purple-300/20 blur-[120px] rounded-full pointer-events-none transform-gpu"></div>
                <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-indigo-200/15 blur-[120px] rounded-full pointer-events-none transform-gpu"></div>

                <div className="relative z-10 w-full max-w-[640px] mx-auto bg-white/80 backdrop-blur-sm border border-[#E9DFD3] rounded-[28px] shadow-[0_20px_60px_rgba(80,62,38,0.08)] p-8 md:p-10 overflow-hidden animate-fade-in my-8">

                    {showSuccess && (
                        <div className="absolute inset-0 bg-white/95 backdrop-blur-md z-50 flex flex-col items-center justify-center p-8 animate-fade-in">
                            <div className="w-20 h-20 bg-green-100 text-green-500 rounded-full flex items-center justify-center mb-8 shadow-lg shadow-green-100/50">
                                <CheckCircle2 className="w-10 h-10" />
                            </div>

                            <div className="space-y-4 w-full max-w-xs">
                                {successSequence.map((text, index) => (
                                    <div
                                        key={text}
                                        className={`flex items-center gap-4 transition-all duration-300 ${successStep >= index ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"
                                            }`}
                                    >
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${successStep > index ? "bg-green-500 text-white" :
                                            successStep === index ? "bg-purple-100 text-purple-600" : "bg-gray-100"
                                            }`}>
                                            {successStep > index ? <Check className="w-3.5 h-3.5" /> :
                                                successStep === index ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                        </div>
                                        <span className={`font-bold ${successStep > index ? "text-gray-900" :
                                            successStep === index ? "text-purple-600" : "text-gray-400"
                                            }`}>
                                            {text}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="mb-8 text-center">
                        <div className="w-12 h-12 mx-auto rounded-[16px] bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100 mb-6">
                            <Brain className="w-6 h-6" />
                        </div>
                        <h3 className="text-3xl font-black text-gray-950 tracking-tight mb-2">Welcome to FlowMind</h3>
                        <p className="text-gray-500 font-medium">Let's personalize your AI execution coach. This only takes a minute.</p>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 animate-fade-in-fast">
                            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                            <p className="text-sm font-medium text-red-800">{error}</p>
                        </div>
                    )}

                    <form className="space-y-8" onSubmit={handleSaveProfile} autoComplete="off">

                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">Full Name</label>
                            <input
                                type="text"
                                name="userName"
                                autoComplete="off"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="How should the AI address you?"
                                disabled={isLoading}
                                className="w-full px-5 py-4 rounded-2xl bg-[#FAF8F4] border border-[#E9DFD3] focus:border-purple-300 focus:ring-4 focus:ring-purple-500/10 transition-all outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">I am a...</label>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {occupations.map((occ) => (
                                    <button
                                        key={occ.id}
                                        type="button"
                                        disabled={isLoading}
                                        onClick={() => setFormData({ ...formData, occupation: occ.id })}
                                        className={`flex items-center gap-2.5 p-3 rounded-2xl border transition-all text-left disabled:opacity-70 ${formData.occupation === occ.id
                                            ? "bg-purple-50 border-purple-300 ring-2 ring-purple-500/20 text-purple-700"
                                            : "bg-white border-[#E9DFD3] text-gray-600 hover:border-purple-200 hover:bg-gray-50"
                                            }`}
                                    >
                                        <occ.icon className={`w-4 h-4 shrink-0 ${formData.occupation === occ.id ? "text-purple-600" : "text-gray-400"}`} />
                                        <span className="font-bold text-xs truncate">{occ.id}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">Primary Goal</label>
                            <div className="flex flex-wrap gap-2 mb-3">
                                {goals.map((goal) => (
                                    <button
                                        key={goal.id}
                                        type="button"
                                        disabled={isLoading}
                                        onClick={() => {
                                            setSelectedGoalChip(goal.id);
                                            if (goal.id !== "Other") setCustomGoalText("");
                                        }}
                                        className={`px-4 py-2.5 rounded-xl border text-sm font-bold transition-all disabled:opacity-70 ${selectedGoalChip === goal.id
                                            ? "bg-purple-600 border-purple-600 text-white shadow-md shadow-purple-500/20"
                                            : "bg-white border-[#E9DFD3] text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                                            }`}
                                    >
                                        {goal.label}
                                    </button>
                                ))}
                            </div>

                            {selectedGoalChip === "Other" && (
                                <div className="animate-fade-in-fast mt-2">
                                    <input
                                        type="text"
                                        name="customGoal"
                                        autoComplete="off"
                                        value={customGoalText}
                                        onChange={(e) => setCustomGoalText(e.target.value)}
                                        placeholder="Type your specific goal..."
                                        disabled={isLoading}
                                        autoFocus
                                        className="w-full px-5 py-4 rounded-2xl bg-[#FAF8F4] border border-purple-200 focus:border-purple-400 focus:ring-4 focus:ring-purple-500/10 transition-all outline-none"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-[#FAF8F4] p-5 rounded-3xl border border-[#E9DFD3]">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Best Time to Work</label>
                                <div className="flex flex-wrap gap-2">
                                    {workTimes.map((time) => (
                                        <button
                                            key={time.id}
                                            type="button"
                                            disabled={isLoading}
                                            onClick={() => setFormData({ ...formData, preferredWorkTime: time.id })}
                                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all disabled:opacity-70 ${formData.preferredWorkTime === time.id
                                                ? "bg-gray-900 border-gray-900 text-white"
                                                : "bg-white border-[#E9DFD3] text-gray-600 hover:border-gray-400"
                                                }`}
                                        >
                                            <time.icon className="w-3.5 h-3.5" />
                                            {time.id}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between items-end mb-3">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Daily Capacity</label>
                                    <span className="text-[10px] font-black text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                        {getHoursHelper(formData.availableHours)}
                                    </span>
                                </div>
                                <div className="flex items-center gap-4 bg-white border border-[#E9DFD3] p-2 rounded-2xl shadow-sm">
                                    <input
                                        type="range"
                                        min="1"
                                        max="16"
                                        value={formData.availableHours}
                                        disabled={isLoading}
                                        onChange={(e) => setFormData({ ...formData, availableHours: e.target.value })}
                                        className="w-full ml-3 accent-purple-600 cursor-pointer disabled:opacity-70"
                                    />
                                    <div className="min-w-[50px] text-center bg-[#FAF8F4] py-1.5 px-2 rounded-xl border border-[#E9DFD3] font-black text-gray-900">
                                        {formData.availableHours}h
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-100 rounded-2xl p-5 mt-8">
                            <h4 className="text-xs font-black text-purple-800 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <Sparkles className="w-4 h-4" /> FlowMind Personalization
                            </h4>
                            <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                                {['AI Planner', 'Dashboard', 'Insights', 'Recovery Planner', 'Task Priorities'].map(item => (
                                    <div key={item} className="flex items-center gap-2 text-sm font-semibold text-purple-900/70">
                                        <CheckCircle2 className="w-4 h-4 text-purple-400" />
                                        {item}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="pt-2">
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-purple-500/20 hover:-translate-y-1 hover:shadow-xl transition-all active:scale-[0.98] disabled:opacity-70 disabled:hover:translate-y-0"
                            >
                                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Complete Setup & Enter Workspace"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    export default SetupPage;