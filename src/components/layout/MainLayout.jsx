import { useState, useCallback } from "react";
import Sidebar from "./Sidebar";
import MobileSidebar from "./MobileSidebar";
import CommandPalette from "../CommandPalette";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { Outlet } from "react-router-dom";

function MainLayout() {
  const [paletteOpen, setPaletteOpen] = useState(false);

  const onNavigate = useCallback((target) => {
    if (target === "palette") setPaletteOpen(true);
  }, []);

  const onQuickAdd = useCallback(() => {
    const el = document.querySelector('[data-quick-add]');
    if (el) el.focus();
  }, []);

  useKeyboardShortcuts({
    onNavigate,
    onQuickAdd,
    focusedTaskId: null,
    onCompleteTask: null,
  });

  return (
    <div className="flex bg-[#F6F1EA] dark:bg-gray-950 min-h-screen font-sans text-gray-900 dark:text-gray-100 selection:bg-purple-200 dark:selection:bg-purple-800 overflow-hidden">
      <Sidebar />
      <MobileSidebar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden h-screen scroll-smooth">
        <Outlet /> 
      </main>
      <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

export default MainLayout;
