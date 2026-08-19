import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { LayoutDashboard, Sparkles, CheckSquare, BarChart2, Menu, X, Brain, CalendarDays, Clock3, Flame } from "lucide-react";

import { useAuth } from "../../hooks/useAuth";
import SidebarProfile from "../common/SidebarProfile";
import { getProductivityStreak } from "../../utils/dashboardMetrics";

function MobileSidebar() {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [clock, setClock] = useState({ time: "", date: "", day: "" });

  const { profile } = useAuth();
  const streak = getProductivityStreak(profile);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setClock({
        time: now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
        date: now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
        day: now.toLocaleDateString("en-US", { weekday: "long" }),
      });
    };
    updateClock();
    const intervalId = setInterval(updateClock, 1000);
    return () => clearInterval(intervalId);
  }, []);

  // Close sidebar on route change
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setIsOpen(false); }, [location.pathname]);

  const navItems = [
    { path: "/", label: "Dashboard", icon: LayoutDashboard },
    { path: "/planner", label: "AI Planner", icon: Sparkles },
    { path: "/tasks", label: "Task Board", icon: CheckSquare },
    { path: "/insights", label: "Insights", icon: BarChart2 },
  ];

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="md:hidden fixed top-4 left-4 z-[60] w-10 h-10 bg-white dark:bg-gray-800 border border-[#E9DFD3] dark:border-gray-700 rounded-xl shadow-lg flex items-center justify-center text-gray-700 dark:text-gray-200 active:scale-95 transition-all"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {isOpen && (
        <div
          className="md:hidden fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      <div
        className={`md:hidden fixed top-0 left-0 z-[80] h-full w-[280px] bg-white dark:bg-gray-900 border-r border-[#E9DFD3] dark:border-gray-700 shadow-2xl transform transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-full flex flex-col p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-[14px] bg-purple-50 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center border border-purple-100 dark:border-purple-800">
                <Brain className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-none">FlowMind</h1>
                <span className="text-[9px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest block">AI Execution Coach</span>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              aria-label="Close menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-col gap-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-[14px] font-semibold transition-all duration-200 ${
                    isActive
                      ? "bg-[#F4ECFF] dark:bg-purple-900/30 text-purple-700 dark:text-purple-400"
                      : "text-gray-500 dark:text-gray-400 hover:bg-[#FAF7F2] dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? "text-purple-600 dark:text-purple-400" : "text-gray-400 dark:text-gray-500"}`} />
                  <span className="text-sm">{item.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="mt-6 border-t border-[#EFE5D9] dark:border-gray-700 pt-4 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center border border-purple-100 dark:border-purple-800 shrink-0">
                <CalendarDays className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500 leading-none mb-1">Today</p>
                <p className="text-sm font-black text-gray-950 dark:text-gray-100 leading-tight">{clock.date}</p>
              </div>
            </div>

            <div className="border-t border-[#EFE5D9] dark:border-gray-700" />

            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center border border-purple-100 dark:border-purple-800 shrink-0">
                <Clock3 className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500 leading-none mb-1">Live Time</p>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-black text-gray-950 dark:text-gray-100 leading-tight">{clock.time}</p>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full bg-green-500 h-2 w-2"></span>
                  </span>
                </div>
              </div>
            </div>

            <div className="border-t border-[#EFE5D9] dark:border-gray-700" />

            <div className="rounded-2xl bg-[#FAF8F4] dark:bg-gray-800 border border-[#EFE5D9] dark:border-gray-700 p-2.5">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-500" />
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500 leading-none mt-0.5">Streak</p>
              </div>
              <p className="mt-1.5 text-lg font-black text-gray-950 dark:text-gray-100 leading-none">{streak} Days</p>
            </div>
          </div>

          <div className="mt-auto pt-4">
            <SidebarProfile />
          </div>
        </div>
      </div>
    </>
  );
}

export default MobileSidebar;
