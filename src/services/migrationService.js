// src/services/migrationService.js
import { db } from "./firebaseService";
import { 
    collection, query, where, getDocs, 
    doc, serverTimestamp, writeBatch
} from "firebase/firestore";

const COLLECTIONS_MIGRATED_KEY = "flowmind_migrated_collections";

const getMigrationStatus = () => {
    try {
        return JSON.parse(localStorage.getItem(COLLECTIONS_MIGRATED_KEY) || "{}");
    } catch {
        return {};
    }
};

const setMigrationComplete = (version) => {
    const status = getMigrationStatus();
    status[version] = true;
    localStorage.setItem(COLLECTIONS_MIGRATED_KEY, JSON.stringify(status));
};

export const migrateExistingData = async (userId, plan) => {
    if (!userId || !plan) return { migrated: false, reason: "no_data" };

    const status = getMigrationStatus();
    if (status["v1_history"]) return { migrated: false, reason: "already_migrated" };

    try {
        let migratedCount = 0;

        const existingCompletions = await getDocs(
            query(collection(db, "completionLog"), where("userId", "==", userId))
        );
        if (!existingCompletions.empty) {
            setMigrationComplete("v1_history");
            return { migrated: false, reason: "data_exists" };
        }

        const tasks = Array.isArray(plan.taskBoardTasks) ? plan.taskBoardTasks : [];

        const completedTasks = tasks.filter((t) => 
            t.completed === true || t.status === "Completed"
        );

        if (completedTasks.length === 0 && !plan.confidenceScore) {
            setMigrationComplete("v1_history");
            return { migrated: true, reason: "no_completed_tasks", count: 0 };
        }

        const batch = writeBatch(db);

        for (const task of completedTasks) {
            const taskTitle = task.title || task.task || "Migrated Task";
            const taskPriority = task.priority || "MEDIUM";
            const completionDate = task.completedDate || task.completedAt?.slice(0, 10) || new Date().toLocaleDateString("en-CA");
            const completionTimestamp = task.completedAt ? new Date(task.completedAt) : new Date();

            const ref = doc(collection(db, "completionLog"));
            batch.set(ref, {
                userId,
                taskTitle,
                priority: taskPriority,
                estimatedTime: task.estimatedTime || null,
                actualTime: null,
                completedAt: completionTimestamp,
                date: completionDate,
                migrated: true
            });
            migratedCount++;
        }

        const currentScore = Number(plan.confidenceScore || 50);
        const confRef = doc(collection(db, "confidenceHistory"));
        batch.set(confRef, {
            userId,
            oldScore: Math.max(0, currentScore - 10),
            newScore: currentScore,
            delta: 10,
            reason: "migration_baseline",
            recordedAt: new Date(),
            date: new Date().toLocaleDateString("en-CA"),
            migrated: true
        });

        const today = new Date().toLocaleDateString("en-CA");
        const summaryRef = doc(db, "dailyHistory", `${userId}_${today}`);
        batch.set(summaryRef, {
            userId,
            date: today,
            tasksCompleted: completedTasks.length,
            peakHour: null,
            updatedAt: serverTimestamp(),
            migrated: true
        }, { merge: true });

        await batch.commit();
        setMigrationComplete("v1_history");

        return { migrated: true, reason: "success", count: migratedCount };
    } catch (error) {
        console.error("Migration failed:", error);
        return { migrated: false, reason: "error", error: error.message };
    }
};

export const hasMigrated = () => {
    const status = getMigrationStatus();
    return !!status["v1_history"];
};
