import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, LayoutDashboard, Sparkles, CheckSquare, BarChart2, Settings, Moon, Sun } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

const COMMANDS = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/" },
    { id: "planner", label: "AI Planner", icon: Sparkles, path: "/planner" },
    { id: "tasks", label: "Task Board", icon: CheckSquare, path: "/tasks" },
    { id: "insights", label: "Insights", icon: BarChart2, path: "/insights" },
    { id: "settings", label: "Settings", icon: Settings, path: "/settings" },
];

function CommandPalette({ isOpen, onClose }) {
    const navigate = useNavigate();
    const { isDark, toggleTheme } = useTheme();
    const [query, setQuery] = useState("");
    const [selectedIdx, setSelectedIdx] = useState(0);
    const inputRef = useRef(null);
    const isOpenRef = useRef(false);

    const filtered = useMemo(() => {
        const q = query.toLowerCase();
        const base = COMMANDS.map(cmd => ({ ...cmd, type: "nav" }));
        base.push({ id: "theme", label: isDark ? "Switch to Light Mode" : "Switch to Dark Mode", icon: isDark ? Sun : Moon, path: null, type: "theme" });
        if (!q) return base;
        return base.filter(cmd => cmd.label.toLowerCase().includes(q));
    }, [query, isDark]);

    useEffect(() => {
        if (isOpen && !isOpenRef.current) {
            isOpenRef.current = true;
            setQuery("");
            setSelectedIdx(0);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
        if (!isOpen) {
            isOpenRef.current = false;
        }
    }, [isOpen]);

    const handleQueryChange = (e) => {
        setQuery(e.target.value);
        setSelectedIdx(0);
    };

    const executeCommand = (cmd) => {
        if (cmd.type === "theme") {
            toggleTheme();
        } else if (cmd.path) {
            navigate(cmd.path);
        }
        onClose();
    };

    const handleKeyDown = (e) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIdx((prev) => Math.min(prev + 1, filtered.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIdx((prev) => Math.max(prev - 1, 0));
        } else if (e.key === "Enter" && filtered[selectedIdx]) {
            executeCommand(filtered[selectedIdx]);
        } else if (e.key === "Escape") {
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[20vh]" onClick={onClose}>
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
            <div
                className="relative w-full max-w-[480px] mx-4 bg-white dark:bg-gray-900 rounded-2xl border border-[#E9DFD3] dark:border-gray-700 shadow-2xl overflow-hidden animate-fade-in-up"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E9DFD3] dark:border-gray-700">
                    <Search className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={handleQueryChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a command..."
                        className="flex-1 bg-transparent text-sm font-semibold text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
                    />
                    <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded">
                        ESC
                    </kbd>
                </div>

                <div className="max-h-[300px] overflow-y-auto p-2">
                    {filtered.length > 0 ? filtered.map((cmd, idx) => {
                        const Icon = cmd.icon;
                        return (
                            <button
                                key={cmd.id}
                                onClick={() => executeCommand(cmd)}
                                onMouseEnter={() => setSelectedIdx(idx)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                                    idx === selectedIdx
                                        ? "bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400"
                                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                                }`}
                            >
                                <Icon className="w-4 h-4 shrink-0" />
                                <span className="flex-1 text-left">{cmd.label}</span>
                                {cmd.type === "nav" && (
                                    <kbd className="text-[9px] font-bold text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700">
                                        ↵
                                    </kbd>
                                )}
                            </button>
                        );
                    }) : (
                        <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-6">No commands found</p>
                    )}
                </div>

                <div className="flex items-center gap-4 px-4 py-2 border-t border-[#E9DFD3] dark:border-gray-700 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    <span>↑↓ Navigate</span>
                    <span>↵ Select</span>
                    <span>ESC Close</span>
                </div>
            </div>
        </div>
    );
}

export default CommandPalette;
