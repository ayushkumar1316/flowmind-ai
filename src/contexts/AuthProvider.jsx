import { useEffect, useState, useCallback } from "react";
import { AuthContext } from "./AuthContext";
import { checkAuthState, getUserProfile, checkAndUpdateStreak, logoutUser } from "../services/authService";

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = checkAuthState(async (authUser) => {
            if (authUser) {
                setUser(authUser);
                try {
                    const userProfile = await getUserProfile(authUser.uid);
                    if (userProfile) {
                        const updatedStats = await checkAndUpdateStreak(authUser.uid, userProfile.stats);
                        setProfile({ ...userProfile, stats: updatedStats });
                    }
                } catch (error) {
                    console.error("Failed to load global profile:", error);
                }
            } else {
                setUser(null);
                setProfile(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const refreshProfile = useCallback(async () => {
        if (!user?.uid) return;
        try {
            const userProfile = await getUserProfile(user.uid);
            if (userProfile) {
                const updatedStats = await checkAndUpdateStreak(user.uid, userProfile.stats);
                setProfile({ ...userProfile, stats: updatedStats });
            }
        } catch (error) {
            console.error("Failed to refresh profile:", error);
        }
    }, [user]);

    const updateProfileLocal = useCallback((updates) => {
        setProfile((current) => current ? { ...current, ...updates } : current);
    }, []);

    const logout = async () => {
        await logoutUser();
        setUser(null);
        setProfile(null);
    };

    const updateProfileStats = (nextStats) => {
        setProfile((current) => (current ? { ...current, stats: nextStats } : current));
    };

    return (
        <AuthContext.Provider value={{ user, profile, loading, logout, updateProfileStats, refreshProfile, updateProfileLocal }}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthProvider;