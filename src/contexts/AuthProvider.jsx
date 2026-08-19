import { useEffect, useState } from "react";
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

    const logout = async () => {
        await logoutUser();
        setUser(null);
        setProfile(null);
    };

    const updateProfileStats = (nextStats) => {
        setProfile((current) => (current ? { ...current, stats: nextStats } : current));
    };

    return (
        <AuthContext.Provider value={{ user, profile, loading, logout, updateProfileStats }}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthProvider;