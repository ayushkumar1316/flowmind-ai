import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, User, Briefcase, Target, Clock, CheckCircle2, AlertCircle, Shield, Mail, Globe } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { updateProfile, linkEmailToGuest, linkGoogleToGuest } from "../services/authService";

const OCCUPATIONS = [
    "Student", "Software Engineer", "Designer", "Product Manager",
    "Marketing", "Data Scientist", "Freelancer", "Entrepreneur", "Other"
];

const GOALS = [
    "Crack placement/internship", "Build a side project", "Get fit & healthy",
    "Learn new skills", "Improve productivity", "Start a business", "Other"
];

const WORK_TIMES = ["Morning (6-12)", "Afternoon (12-5)", "Evening (5-9)", "Night (9-12)"];

const HOURS_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

function SettingsPage() {
    const navigate = useNavigate();
    const { user, profile, refreshProfile, updateProfileLocal } = useAuth();
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState(null);
    const [upgradeMode, setUpgradeMode] = useState(null);
    const [upgradeEmail, setUpgradeEmail] = useState("");
    const [upgradePassword, setUpgradePassword] = useState("");
    const [upgrading, setUpgrading] = useState(false);

    const isGuest = !user?.email && profile?.isGuest;

    const [form, setForm] = useState(() => ({
        name: profile?.profile?.name || "",
        occupation: profile?.profile?.occupation || "",
        goal: profile?.profile?.goal || "",
        availableHours: profile?.profile?.availableHours || 3,
        preferredWorkTime: profile?.profile?.preferredWorkTime || "",
    }));

    const handleChange = (field, value) => {
        setForm((prev) => ({ ...prev, [field]: value }));
    };

    const handleUpgradeEmail = async () => {
        if (!upgradeEmail.trim() || !upgradePassword.trim()) {
            setToast({ type: "error", message: "Email and password are required" });
            setTimeout(() => setToast(null), 3000);
            return;
        }
        setUpgrading(true);
        try {
            await linkEmailToGuest(user, upgradeEmail, upgradePassword);
            await refreshProfile();
            setUpgradeMode(null);
            setToast({ type: "success", message: "Account upgraded successfully!" });
            setTimeout(() => setToast(null), 3000);
        } catch (error) {
            console.error("Failed to upgrade:", error);
            const msg = error.code === "auth/email-already-in-use" 
                ? "This email is already registered" 
                : "Failed to upgrade. Please try again.";
            setToast({ type: "error", message: msg });
            setTimeout(() => setToast(null), 3000);
        } finally {
            setUpgrading(false);
        }
    };

    const handleUpgradeGoogle = async () => {
        setUpgrading(true);
        try {
            await linkGoogleToGuest(user);
            await refreshProfile();
            setUpgradeMode(null);
            setToast({ type: "success", message: "Account upgraded with Google!" });
            setTimeout(() => setToast(null), 3000);
        } catch (error) {
            console.error("Failed to upgrade with Google:", error);
            setToast({ type: "error", message: "Failed to upgrade with Google." });
            setTimeout(() => setToast(null), 3000);
        } finally {
            setUpgrading(false);
        }
    };

    const handleSave = async () => {
        if (!form.name.trim()) {
            setToast({ type: "error", message: "Name is required" });
            setTimeout(() => setToast(null), 3000);
            return;
        }
        setSaving(true);
        try {
            await updateProfile(user.uid, form);
            updateProfileLocal({ profile: { ...profile?.profile, ...form } });
            await refreshProfile();
            setToast({ type: "success", message: "Profile updated successfully!" });
            setTimeout(() => setToast(null), 3000);
        } catch (error) {
            console.error("Failed to update profile:", error);
            setToast({ type: "error", message: "Failed to save. Please try again." });
            setTimeout(() => setToast(null), 3000);
        } finally {
            setSaving(false);
        }
    };

    const inputBase = "w-full bg-[#FAF8F4] dark:bg-gray-800 border border-[#E9DFD3] dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-purple-300 focus:ring-4 focus:ring-purple-500/10 transition-all";
    const labelBase = "text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1.5 block";

    return (
        <>
            {toast && (
                <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[150] px-6 py-3 rounded-xl shadow-[0_10px_40px_rgba(80,62,38,0.12)] border animate-fade-in-up flex items-center gap-3 ${
                    toast.type === "success" 
                        ? "bg-white dark:bg-gray-900 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800" 
                        : "bg-white dark:bg-gray-900 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800"
                }`}>
                    {toast.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    <span className="text-sm font-bold">{toast.message}</span>
                </div>
            )}

            <div className="relative min-h-screen bg-transparent text-gray-800 dark:text-gray-200 font-sans pb-16">
                <div className="pointer-events-none absolute top-0 right-0 w-[600px] h-[600px] bg-[#D6C6FF] rounded-full filter blur-[120px] opacity-[0.12] dark:opacity-[0.06] z-0" />

                <div className="relative z-10 max-w-[700px] mx-auto px-5 py-6 lg:px-7 lg:py-8">
                    
                    {/* Header */}
                    <div className="flex items-center gap-4 mb-8">
                        <button 
                            onClick={() => navigate(-1)}
                            className="w-10 h-10 rounded-xl bg-white dark:bg-gray-900 border border-[#E9DFD3] dark:border-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:border-purple-200 dark:hover:border-purple-700 transition-all shadow-sm"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                        <div>
                            <h1 className="text-2xl font-black text-gray-950 dark:text-gray-100 tracking-tight">Profile Settings</h1>
                            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Update your profile and preferences</p>
                        </div>
                    </div>

                    {/* Profile Card */}
                    <div className="bg-white dark:bg-gray-900 rounded-[24px] border border-[#E9DFD3] dark:border-gray-700 shadow-[0_14px_40px_rgba(80,62,38,0.03)] p-6 md:p-8 space-y-6">
                        
                        {/* Avatar Section */}
                        <div className="flex items-center gap-5 pb-6 border-b border-[#E9DFD3] dark:border-gray-700">
                            <div className="w-20 h-20 rounded-full bg-purple-50 dark:bg-purple-900/30 border-2 border-purple-100 dark:border-purple-800 flex items-center justify-center text-purple-600 font-black text-3xl overflow-hidden">
                                {profile?.photoURL || user?.photoURL ? (
                                    <img src={profile?.photoURL || user?.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    (form.name || "U").charAt(0).toUpperCase()
                                )}
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-gray-900 dark:text-gray-100">{form.name || "User"}</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email || "Guest Account"}</p>
                                {user?.email ? (
                                    <span className="inline-block mt-1 text-[9px] font-black uppercase tracking-widest text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded border border-green-100 dark:border-green-800">Verified</span>
                                ) : (
                                    <span className="inline-block mt-1 text-[9px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded border border-amber-100 dark:border-amber-800">Guest</span>
                                )}
                            </div>
                        </div>

                        {/* Guest Upgrade Section */}
                        {isGuest && (
                            <div className="bg-gradient-to-br from-amber-50/80 to-orange-50/50 dark:from-amber-900/20 dark:to-orange-900/10 rounded-[20px] border border-amber-200/60 dark:border-amber-800/40 p-5 space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                                        <Shield className="w-5 h-5 text-amber-600" />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-black text-gray-900 dark:text-gray-100">Upgrade Your Account</h4>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Link email or Google to save your data permanently</p>
                                    </div>
                                </div>

                                {!upgradeMode ? (
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => setUpgradeMode("email")}
                                            className="flex-1 flex items-center justify-center gap-2 bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 font-bold text-xs px-4 py-3 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all"
                                        >
                                            <Mail className="w-4 h-4" /> Email
                                        </button>
                                        <button
                                            onClick={() => setUpgradeMode("google")}
                                            className="flex-1 flex items-center justify-center gap-2 bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 font-bold text-xs px-4 py-3 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all"
                                        >
                                            <Globe className="w-4 h-4" /> Google
                                        </button>
                                    </div>
                                ) : upgradeMode === "email" ? (
                                    <div className="space-y-3">
                                        <input
                                            type="email"
                                            value={upgradeEmail}
                                            onChange={(e) => setUpgradeEmail(e.target.value)}
                                            placeholder="Email address"
                                            className={inputBase}
                                        />
                                        <input
                                            type="password"
                                            value={upgradePassword}
                                            onChange={(e) => setUpgradePassword(e.target.value)}
                                            placeholder="Password (min 6 chars)"
                                            className={inputBase}
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleUpgradeEmail}
                                                disabled={upgrading}
                                                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs px-4 py-3 rounded-xl transition-all disabled:opacity-50"
                                            >
                                                {upgrading ? "Linking..." : "Link Email"}
                                            </button>
                                            <button
                                                onClick={() => setUpgradeMode(null)}
                                                className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <button
                                            onClick={handleUpgradeGoogle}
                                            disabled={upgrading}
                                            className="w-full flex items-center justify-center gap-2 bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 font-bold text-xs px-4 py-3 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all disabled:opacity-50"
                                        >
                                            <Globe className="w-4 h-4" />
                                            {upgrading ? "Linking..." : "Continue with Google"}
                                        </button>
                                        <button
                                            onClick={() => setUpgradeMode(null)}
                                            className="w-full text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors py-1"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Form Fields */}
                        <div className="space-y-5">
                            {/* Name */}
                            <div>
                                <label className={labelBase}>
                                    <span className="flex items-center gap-1.5"><User className="w-3 h-3" /> Full Name</span>
                                </label>
                                <input
                                    type="text"
                                    value={form.name}
                                    onChange={(e) => handleChange("name", e.target.value)}
                                    placeholder="Your name"
                                    className={inputBase}
                                />
                            </div>

                            {/* Occupation */}
                            <div>
                                <label className={labelBase}>
                                    <span className="flex items-center gap-1.5"><Briefcase className="w-3 h-3" /> Occupation</span>
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {OCCUPATIONS.map((occ) => (
                                        <button
                                            key={occ}
                                            onClick={() => handleChange("occupation", occ)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                                form.occupation === occ
                                                    ? "bg-purple-600 text-white border-purple-600"
                                                    : "bg-[#FAF8F4] dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-[#E9DFD3] dark:border-gray-700 hover:border-purple-200 dark:hover:border-purple-700"
                                            }`}
                                        >
                                            {occ}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Goal */}
                            <div>
                                <label className={labelBase}>
                                    <span className="flex items-center gap-1.5"><Target className="w-3 h-3" /> Primary Goal</span>
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {GOALS.map((g) => (
                                        <button
                                            key={g}
                                            onClick={() => handleChange("goal", g)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                                form.goal === g
                                                    ? "bg-purple-600 text-white border-purple-600"
                                                    : "bg-[#FAF8F4] dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-[#E9DFD3] dark:border-gray-700 hover:border-purple-200 dark:hover:border-purple-700"
                                            }`}
                                        >
                                            {g}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Available Hours */}
                            <div>
                                <label className={labelBase}>
                                    <span className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> Daily Available Hours</span>
                                </label>
                                <div className="flex gap-2">
                                    {HOURS_OPTIONS.map((h) => (
                                        <button
                                            key={h}
                                            onClick={() => handleChange("availableHours", h)}
                                            className={`w-10 h-10 rounded-lg text-sm font-bold border transition-all ${
                                                form.availableHours === h
                                                    ? "bg-purple-600 text-white border-purple-600"
                                                    : "bg-[#FAF8F4] dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-[#E9DFD3] dark:border-gray-700 hover:border-purple-200 dark:hover:border-purple-700"
                                            }`}
                                        >
                                            {h}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Preferred Work Time */}
                            <div>
                                <label className={labelBase}>
                                    <span className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> Preferred Work Time</span>
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {WORK_TIMES.map((t) => (
                                        <button
                                            key={t}
                                            onClick={() => handleChange("preferredWorkTime", t)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                                form.preferredWorkTime === t
                                                    ? "bg-purple-600 text-white border-purple-600"
                                                    : "bg-[#FAF8F4] dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-[#E9DFD3] dark:border-gray-700 hover:border-purple-200 dark:hover:border-purple-700"
                                            }`}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Save Button */}
                        <div className="pt-4 border-t border-[#E9DFD3] dark:border-gray-700">
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-black text-sm px-6 py-3.5 rounded-xl shadow-lg shadow-purple-500/25 transition-all flex items-center justify-center gap-2 hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-500"
                            >
                                <Save className="w-4 h-4" />
                                {saving ? "Saving..." : "Save Changes"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

export default SettingsPage;
