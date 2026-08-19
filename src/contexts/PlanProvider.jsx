import { useEffect, useState, useCallback, useRef } from "react";
import { PlanContext } from "./PlanContext";
import { subscribeToPlan, savePlan } from "../services/firebaseService";

export const PlanProvider = ({ children }) => {
    const [plan, setPlan] = useState(null);
    const [loadingPlan, setLoadingPlan] = useState(true);
    const planRef = useRef(null);

    useEffect(() => {
        const unsubscribe = subscribeToPlan((realtimePlan) => {
            setPlan(realtimePlan);
            planRef.current = realtimePlan;
            setLoadingPlan(false);
        });

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    const updatePlan = useCallback(async (updates) => {
        setPlan((prev) => ({ ...prev, ...updates }));
        planRef.current = { ...planRef.current, ...updates };

        try {
            await savePlan({ ...planRef.current, ...updates });
        } catch (error) {
            console.error("Failed to sync plan update:", error);
        }
    }, []);

    const syncTasks = useCallback(async (updatedTasks) => {
        const completedCount = updatedTasks.filter((t) => t.status === "Completed").length;
        const total = updatedTasks.length;
        const progress = total === 0 ? 0 : Math.round((completedCount / total) * 100);

        try {
            const didSave = await savePlan({
                taskBoardTasks: updatedTasks,
                confidenceScore: progress,
            });
            if (!didSave) throw new Error("Firebase rejected the task update");
        } catch (error) {
            console.error("Failed to sync tasks:", error);
            throw error;
        }
    }, []);

    return (
        <PlanContext.Provider value={{ plan, loadingPlan, updatePlan, syncTasks }}>
            {children}
        </PlanContext.Provider>
    );
};

export default PlanProvider;