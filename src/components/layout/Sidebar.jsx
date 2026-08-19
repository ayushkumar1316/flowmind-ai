import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { LayoutDashboard, Sparkles, CheckSquare, BarChart2, Brain, CalendarDays, Clock3, Flame } from "lucide-react";

import { useAuth } from "../../hooks/useAuth";
import SidebarProfile from "../common/SidebarProfile";
import { getProductivityStreak } from "../../utils/dashboardMetrics";

function Sidebar() {
  const location = useLocation();
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

  const navItems = [
    { path: "/", label: "Dashboard", icon: LayoutDashboard },
    { path: "/planner", label: "AI Planner", icon: Sparkles },
    { path: "/tasks", label: "Task Board", icon: CheckSquare },
    { path: "/insights", label: "Insights", icon: BarChart2 },
  ];

  return (
    <div className="h-screen p-4 md:p-4 flex-shrink-0 hidden md:block z-50 relative">
      <div className="w-[250px] h-full bg-white/95 dark:bg-gray-900/95 rounded-[26px] border border-[#E9DFD3] dark:border-gray-700 shadow-[0_16px_45px_rgba(80,62,38,0.08)] dark:shadow-[0_16px_45px_rgba(0,0,0,0.4)] p-4 flex flex-col overflow-hidden backdrop-blur-xl">
        
        <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar pb-3 flex flex-col">
          
          <div className="flex items-center gap-3 px-2 mb-7 mt-1 shrink-0">
            <div className="w-9 h-9 rounded-[14px] bg-purple-50 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center border border-purple-100 dark:border-purple-800 shadow-sm shadow-purple-100/60">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-[22px] font-bold text-gray-900 dark:text-gray-100 leading-none tracking-tight">FlowMind</h1>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest mt-1 block">AI Execution Coach</span>
            </div>
          </div>

          <div className="flex flex-col gap-1 shrink-0">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-[16px] font-semibold transition-all duration-200 group ${
                    isActive 
                      ? "bg-[#F4ECFF] dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 shadow-[inset_0_0_0_1px_rgba(126,34,206,0.06)] dark:shadow-[inset_0_0_0_1px_rgba(147,51,234,0.2)]" 
                      : "text-gray-500 dark:text-gray-400 hover:bg-[#FAF7F2] dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 hover:translate-x-0.5"
                  }`}
                >
                  <Icon 
                    className={`w-[20px] h-[20px] transition-transform duration-200 group-hover:scale-110 ${
                      isActive ? "text-purple-600 dark:text-purple-400" : "text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300"
                    }`} 
                  />
                  <span className="tracking-wide text-sm">{item.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="mt-6 border-t border-[#EFE5D9] dark:border-gray-700 pt-4 space-y-3 shrink-0">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center border border-purple-100 dark:border-purple-800 shrink-0">
                <CalendarDays className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500 leading-none mb-1">Today</p>
                <p className="text-sm font-black text-gray-950 dark:text-gray-100 leading-tight">{clock.date}</p>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mt-0.5">{clock.day}</p>
              </div>
            </div>

            <div className="border-t border-[#EFE5D9] dark:border-gray-700" />

            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center border border-purple-100 dark:border-purple-800 shrink-0">
                <Clock3 className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500 leading-none mb-1">Live Time</p>
                <div className="flex items-center justify-between gap-2">
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
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500 leading-none mt-0.5">Productivity Streak</p>
              </div>
              <p className="mt-1.5 text-lg font-black text-gray-950 dark:text-gray-100 leading-none">{streak} Days</p>
              <div className="mt-2 grid grid-cols-7 gap-1">
                {Array.from({ length: 7 }).map((_, index) => (
                  <span 
                    key={index} 
                    className={`h-1.5 rounded-full transition-all duration-500 ease-out ${
                      index < (streak % 7 || (streak > 0 ? 7 : 0)) ? "bg-purple-500" : "bg-gray-200 dark:bg-gray-700"
                    }`}
                  ></span>
                ))}
              </div>
            </div>
          </div>
          
        </div>

        <SidebarProfile />

      </div>
    </div>
  );
}

export default Sidebar;
