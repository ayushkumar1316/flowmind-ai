import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, LogOut, User, Settings, Sliders, Moon, Sun } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useTheme } from "../../contexts/ThemeContext";

function SidebarProfile() {
  const navigate = useNavigate();
  const { user, profile, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const MY_DEVELOPER_EMAIL = "ayushkumarbiswal@gmail.com";
  const displayRole = user?.email === MY_DEVELOPER_EMAIL ? "Developer" : profile?.profile?.occupation;

  const displayData = {
    name: profile?.profile?.name || profile?.displayName || user?.displayName || "User",
    role: displayRole || profile?.profile?.occupation || "",
    photoURL: profile?.photoURL || user?.photoURL || null,
  };

  const handleLogout = async () => {
    setIsMenuOpen(false);
    await logout();
  };

  return (
    <div className="relative mt-auto pt-3" ref={menuRef}>
      {isMenuOpen && (
        <div className="absolute bottom-[calc(100%+12px)] left-0 w-full bg-white dark:bg-gray-800 border border-[#E9DFD3] dark:border-gray-700 rounded-[20px] shadow-[0_14px_40px_rgba(80,62,38,0.12)] dark:shadow-[0_14px_40px_rgba(0,0,0,0.4)] p-2 z-50 animate-fade-in-up origin-bottom">
          
          <button 
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-purple-50 dark:hover:bg-gray-700 hover:text-purple-700 dark:hover:text-purple-400 transition-colors"
          >
            {isDark ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
            <span className="flex-1 text-left">{isDark ? "Light Mode" : "Dark Mode"}</span>
          </button>

          <div className="h-px bg-[#E9DFD3] dark:bg-gray-700 my-1 mx-2"></div>
          
          <button 
            onClick={() => { setIsMenuOpen(false); navigate("/settings"); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-purple-50 dark:hover:bg-purple-900/30 hover:text-purple-700 dark:hover:text-purple-400 transition-colors"
          >
            <User className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">Profile Settings</span>
          </button>

          <button disabled className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-gray-400 dark:text-gray-500 hover:bg-gray-50/50 dark:hover:bg-gray-700/50 cursor-not-allowed group transition-colors">
            <Settings className="w-4 h-4 shrink-0 text-gray-300 dark:text-gray-600" />
            <span className="flex-1 text-left">Account</span>
            <span className="text-[9px] uppercase font-black tracking-widest bg-gray-100 dark:bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600">Soon</span>
          </button>

          <button disabled className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-gray-400 dark:text-gray-500 hover:bg-gray-50/50 dark:hover:bg-gray-700/50 cursor-not-allowed group transition-colors">
            <Sliders className="w-4 h-4 shrink-0 text-gray-300 dark:text-gray-600" />
            <span className="flex-1 text-left">Preferences</span>
            <span className="text-[9px] uppercase font-black tracking-widest bg-gray-100 dark:bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600">Soon</span>
          </button>

          <div className="h-px bg-[#E9DFD3] dark:bg-gray-700 my-1 mx-2"></div>

          <button 
            onClick={handleLogout} 
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Logout
          </button>
        </div>
      )}

      <button
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className="w-full bg-white dark:bg-gray-800 rounded-[20px] border border-[#E9DFD3] dark:border-gray-700 p-2 shadow-[0_4px_14px_rgba(80,62,38,0.04)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.3)] hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(80,62,38,0.08)] dark:hover:shadow-[0_12px_30px_rgba(0,0,0,0.5)] transition-all duration-200 flex items-center gap-2.5 group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
        aria-expanded={isMenuOpen}
      >
        <div className="w-10 h-10 rounded-full bg-purple-50 dark:bg-purple-900/40 border-2 border-transparent group-hover:border-purple-200 dark:group-hover:border-purple-600 transition-colors overflow-hidden shrink-0 flex items-center justify-center text-purple-600 dark:text-purple-400 font-black text-lg">
          {displayData.photoURL ? (
            <img src={displayData.photoURL} alt={displayData.name} className="w-full h-full object-cover" />
          ) : (
            displayData.name.charAt(0)
          )}
        </div>
        
        <div className="flex-1 text-left min-w-0">
          <h4 className="text-[13px] font-black text-gray-950 dark:text-gray-100 truncate leading-tight">{displayData.name}</h4>
          {displayData.role && (
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 truncate mt-0.5">
              {displayData.role}
            </p>
          )}
        </div>
        
        <div className="shrink-0 pr-1 text-gray-300 dark:text-gray-600 group-hover:text-purple-600 dark:group-hover:text-purple-400 group-hover:translate-x-1 transition-all duration-200">
          <ChevronRight className="w-4 h-4" />
        </div>
      </button>
    </div>
  );
}

export default SidebarProfile;
