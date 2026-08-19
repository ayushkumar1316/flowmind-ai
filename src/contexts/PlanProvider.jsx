import { useEffect, useState, useCallback, useRef } from "react";
import { PlanContext } from "./PlanContext";
import { subscribeToPlan, savePlan } from "../services/firebaseService";
import { migrateExistingData, hasMigrated } from "../services/migrationService";

export const PlanProvider = ({ children }) => {
    const [plan, setPlan] = useState(null);
    const [loadingPlan, setLoadingPlan] = useState(true);
    const planRef = useRef(null);
    const migratedRef = useRef(false);

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

    useEffect(() => {
        if (migratedRef.current || hasMigrated() || !plan || loadingPlan) return;
        migratedRef.current = true;
        const uid = plan.userId || plan.uid || null;
        if (!uid) return;
        migrateExistingData(uid, plan).then((result) => {
            if (result.migrated) {
                console.log(`Migration complete: ${result.count} tasks migrated`);
            }
        });
    }, [plan, loadingPlan]);

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
        try {
            const didSave = await savePlan({
                taskBoardTasks: updatedTasks,
            });
            if (!didSave) throw new Error("Firebase rejected the task update");
        } catch (error) {
            console.error("Failed to sync tasks:", error);
            throw error;
        }
    }, []);

    const saveTemplate = useCallback(async (template) => {
        try {
            const currentTemplates = planRef.current?.taskTemplates || [];
            const updatedTemplates = [...currentTemplates, { ...template, createdAt: Date.now() }];
            await savePlan({ taskTemplates: updatedTemplates });
        } catch (error) {
            console.error("Failed to save template:", error);
            throw error;
        }
    }, []);

    const deleteTemplate = useCallback(async (templateId) => {
        try {
            const currentTemplates = planRef.current?.taskTemplates || [];
            const updatedTemplates = currentTemplates.filter(t => t.id !== templateId);
            await savePlan({ taskTemplates: updatedTemplates });
        } catch (error) {
            console.error("Failed to delete template:", error);
            throw error;
        }
    }, []);

    return (
        <PlanContext.Provider value={{ plan, loadingPlan, updatePlan, syncTasks, saveTemplate, deleteTemplate }}>
            {children}
        </PlanContext.Provider>
    );
};

export default PlanProvider;