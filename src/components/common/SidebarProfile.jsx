import { useState, useRef, useEffect } from "react";
import { ChevronRight, LogOut, User, Settings, Sliders } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";

/**
 * SidebarProfile
 * Fully integrated with Global Auth Architecture and strictly formatted.
 */
function SidebarProfile() {
  const { user, profile, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Set this to your actual developer email
  const MY_DEVELOPER_EMAIL = "ayushkumarbiswal@gmail.com"; 
  const displayRole = user?.email === MY_DEVELOPER_EMAIL ? "Developer" : profile?.profile?.occupation;

  // Sync data dynamically from Context
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
      
      {/* Settings Dropdown Menu */}
      {isMenuOpen && (
        <div className="absolute bottom-[calc(100%+12px)] left-0 w-full bg-white border border-[#E9DFD3] rounded-[20px] shadow-[0_14px_40px_rgba(80,62,38,0.12)] p-2 z-50 animate-fade-in-up origin-bottom">
          
          <button 
            onClick={handleLogout} 
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Logout
          </button>
          
          <div className="h-px bg-[#E9DFD3] my-1 mx-2"></div>
          
          <button disabled className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-gray-400 hover:bg-gray-50/50 cursor-not-allowed group transition-colors">
            <User className="w-4 h-4 shrink-0 text-gray-300" />
            <span className="flex-1 text-left">Profile Settings</span>
            <span className="text-[9px] uppercase font-black tracking-widest bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded border border-gray-200">Soon</span>
          </button>

          <button disabled className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-gray-400 hover:bg-gray-50/50 cursor-not-allowed group transition-colors">
            <Settings className="w-4 h-4 shrink-0 text-gray-300" />
            <span className="flex-1 text-left">Account</span>
            <span className="text-[9px] uppercase font-black tracking-widest bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded border border-gray-200">Soon</span>
          </button>

          <button disabled className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-gray-400 hover:bg-gray-50/50 cursor-not-allowed group transition-colors">
            <Sliders className="w-4 h-4 shrink-0 text-gray-300" />
            <span className="flex-1 text-left">Preferences</span>
            <span className="text-[9px] uppercase font-black tracking-widest bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded border border-gray-200">Soon</span>
          </button>
        </div>
      )}

      {/* Main Profile Trigger Card */}
      <button
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className="w-full bg-white rounded-[20px] border border-[#E9DFD3] p-2 shadow-[0_4px_14px_rgba(80,62,38,0.04)] hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(80,62,38,0.08)] transition-all duration-200 flex items-center gap-2.5 group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
        aria-expanded={isMenuOpen}
      >
        <div className="w-10 h-10 rounded-full bg-purple-50 border-2 border-transparent group-hover:border-purple-200 transition-colors overflow-hidden shrink-0 flex items-center justify-center text-purple-600 font-black text-lg">
          {displayData.photoURL ? (
            <img src={displayData.photoURL} alt={displayData.name} className="w-full h-full object-cover" />
          ) : (
            displayData.name.charAt(0) // Safe fallback
          )}
        </div>
        
        <div className="flex-1 text-left min-w-0">
          <h4 className="text-[13px] font-black text-gray-950 truncate leading-tight">{displayData.name}</h4>
          {displayData.role && (
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 truncate mt-0.5">
              {displayData.role}
            </p>
          )}
        </div>
        
        <div className="shrink-0 pr-1 text-gray-300 group-hover:text-purple-600 group-hover:translate-x-1 transition-all duration-200">
          <ChevronRight className="w-4 h-4" />
        </div>
      </button>

    </div>
  );
}

export default SidebarProfile;