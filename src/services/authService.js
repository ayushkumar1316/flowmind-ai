import { 
    signInWithPopup, 
    GoogleAuthProvider, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    signInAnonymously
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";

// ONLY import the shared instances from your central firebaseService
import { auth, db } from "./firebaseService";

const googleProvider = new GoogleAuthProvider();

// Generate readable username from display name
const generateUsername = (name) => {
    if (!name) return `user-${Math.floor(Math.random() * 10000)}`;
    return name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.floor(Math.random() * 1000);
};

const getTodayKey = () => new Date().toLocaleDateString("en-CA");

const daysBetweenKeys = (fromKey, toKey) => {
    if (!fromKey || !toKey) return Infinity;
    const from = new Date(`${fromKey}T12:00:00`);
    const to = new Date(`${toKey}T12:00:00`);
    return Math.round((to - from) / (1000 * 60 * 60 * 24));
};

export const resolveStreakOnLoad = (currentStats = {}) => {
    const today = getTodayKey();
    const lastCompletionDate = currentStats.lastCompletionDate || currentStats.lastActiveDate || null;
    const currentStreak = Number(currentStats.currentStreak || 0);

    if (!lastCompletionDate) {
        return { ...currentStats, currentStreak: 0 };
    }

    const gap = daysBetweenKeys(lastCompletionDate, today);
    if (gap <= 1) {
        return { ...currentStats, currentStreak };
    }

    return { ...currentStats, currentStreak: 0 };
};

export const checkAndUpdateStreak = async (uid, currentStats) => {
    const resolvedStats = resolveStreakOnLoad(currentStats || {});
    const needsPersist = Number(resolvedStats.currentStreak || 0) !== Number(currentStats?.currentStreak || 0);

    if (needsPersist) {
        await setDoc(doc(db, "users", uid), { stats: resolvedStats }, { merge: true });
    }

    return resolvedStats;
};

const syncUserProfile = async (user, additionalData = {}) => {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    
    const isNewUser = !userSnap.exists();
    let profileCompleted = false;

    const displayName = user.displayName || additionalData.displayName || "User";

    if (!isNewUser) {
        profileCompleted = userSnap.data().profileCompleted ?? false;
    }

    const userData = {
        displayName: displayName,
        username: isNewUser ? generateUsername(displayName) : (userSnap.data().username || generateUsername(displayName)),
        email: user.email,
        photoURL: user.photoURL || null,
        uid: user.uid,
        lastLogin: serverTimestamp(),
        ...(isNewUser ? { createdAt: serverTimestamp(), profileCompleted: false } : {}),
        ...additionalData
    };

    await setDoc(userRef, userData, { merge: true });
    
    return { ...userData, profileCompleted: isNewUser ? false : profileCompleted };
};

export const signInWithGoogle = async () => {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        return await syncUserProfile(result.user);
    } catch (error) {
        console.error("Google Sign-In Error:", error);
        throw error;
    }
};

export const emailLogin = async (email, password) => {
    try {
        const result = await signInWithEmailAndPassword(auth, email, password);
        return await syncUserProfile(result.user);
    } catch (error) {
        console.error("Email Login Error:", error);
        throw error;
    }
};

export const emailSignUp = async (email, password, displayName) => {
    try {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        return await syncUserProfile(result.user, { displayName });
    } catch (error) {
        console.error("Email Sign-Up Error:", error);
        throw error;
    }
};

export const logoutUser = async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Error signing out:", error);
        throw error;
    }
};

export const signInAsGuest = async () => {
    try {
        const result = await signInAnonymously(auth);
        const guestName = `Guest-${Math.floor(Math.random() * 10000)}`;
        return await syncUserProfile(result.user, { displayName: guestName, isGuest: true });
    } catch (error) {
        console.error("Guest Sign-In Error:", error);
        throw error;
    }
};

export const getUserProfile = async (uid) => {
    try {
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);
        return userSnap.exists() ? userSnap.data() : null;
    } catch (error) {
        console.error("Error fetching user profile:", error);
        throw error;
    }
};

export const checkAuthState = (callback) => {
    return onAuthStateChanged(auth, callback);
};

export const completeUserSetup = async (uid, profileData) => {
    try {
        const userRef = doc(db, "users", uid);
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const locale = navigator.language || "en-US";

        await setDoc(userRef, {
            profileCompleted: true,
            aiReady: true,
            onboardingVersion: 1,
            timezone: timezone,
            locale: locale,
            profile: {
                name: profileData.name,
                occupation: profileData.occupation,
                goal: profileData.goal,
                availableHours: Number(profileData.availableHours),
                preferredWorkTime: profileData.preferredWorkTime,
                updatedAt: serverTimestamp()
            }
        }, { merge: true });

        return true;
    } catch (error) {
        console.error("Error updating profile:", error);
        throw error;
    }
};

export const updateProfile = async (uid, profileData) => {
    try {
        const userRef = doc(db, "users", uid);
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const locale = navigator.language || "en-US";

        await setDoc(userRef, {
            timezone: timezone,
            locale: locale,
            profile: {
                name: profileData.name,
                occupation: profileData.occupation,
                goal: profileData.goal,
                availableHours: Number(profileData.availableHours),
                preferredWorkTime: profileData.preferredWorkTime,
                updatedAt: serverTimestamp()
            }
        }, { merge: true });

        return true;
    } catch (error) {
        console.error("Error updating profile:", error);
        throw error;
    }
};

export const recordTaskCompletionStreak = async (uid, currentStats = {}) => {
    if (!uid) return currentStats;

    const today = new Date().toLocaleDateString("en-CA");
    const lastCompletionDate = currentStats.lastCompletionDate || currentStats.lastActiveDate;
    const currentStreak = Number(currentStats.currentStreak || 0);
    const bestStreak = Number(currentStats.bestStreak || 0);

    if (lastCompletionDate === today) {
        return currentStats;
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = yesterday.toLocaleDateString("en-CA");
    const nextCurrentStreak = lastCompletionDate === yesterdayKey ? currentStreak + 1 : 1;
    const nextStats = {
        ...currentStats,
        currentStreak: nextCurrentStreak,
        bestStreak: Math.max(bestStreak, nextCurrentStreak),
        lastCompletionDate: today,
    };

    await setDoc(doc(db, "users", uid), { stats: nextStats }, { merge: true });
    return nextStats;
};
