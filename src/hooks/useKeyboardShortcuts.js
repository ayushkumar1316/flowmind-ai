import { useEffect, useCallback } from "react";

export const useKeyboardShortcuts = ({
    onNavigate,
    onCompleteTask,
    focusedTaskId,
    onQuickAdd,
}) => {
    const handleKeyDown = useCallback((e) => {
        const target = e.target;
        const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

        // Cmd/Ctrl + K → Command palette (always works)
        if ((e.metaKey || e.ctrlKey) && e.key === "k") {
            e.preventDefault();
            onNavigate?.("palette");
            return;
        }

        // Skip remaining shortcuts if user is typing in an input
        if (isInput) return;

        // / → Focus quick add (always works when not in input)
        if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            onQuickAdd?.();
            return;
        }

        // Space → Complete focused task (only on TaskBoard)
        if (e.key === " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (focusedTaskId) {
                e.preventDefault();
                onCompleteTask?.(focusedTaskId);
            }
            return;
        }
    }, [onNavigate, onCompleteTask, focusedTaskId, onQuickAdd]);

    useEffect(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handleKeyDown]);
};
