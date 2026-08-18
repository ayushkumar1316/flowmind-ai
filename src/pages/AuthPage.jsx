import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Brain, Eye, EyeOff, Sparkles, CheckCircle2, ShieldCheck, Activity, AlertCircle, Loader2, UserPlus } from "lucide-react";
import { signInWithGoogle, emailLogin, emailSignUp, checkAuthState, getUserProfile, signInAsGuest } from "../services/authService";

const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

function AuthPage() {
  const navigate = useNavigate();
  
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successData, setSuccessData] = useState(null);

  useEffect(() => {
    let isMounted = true;
    
    const unsubscribe = checkAuthState(async (user) => {
      if (!isMounted) return;
      
      if (user) {
        try {
          const profile = await getUserProfile(user.uid);
          if (!isMounted) return;
          
          if (profile?.profileCompleted) {
            navigate("/", { replace: true });
          } else {
            navigate("/setup", { replace: true });
          }
        } catch (err) {
          console.error("Failed to fetch user profile:", err);
          if (isMounted) setIsInitializing(false);
        }
      } else {
        if (isMounted) setIsInitializing(false);
      }
    });

    return () => {
      isMounted = false;
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [navigate]);

  const mapFirebaseError = (err) => {
    switch (err.code) {
      case 'auth/popup-closed-by-user': return "Sign-in was cancelled.";
      case 'auth/invalid-email': return "Please enter a valid email address.";
      case 'auth/invalid-credential':
      case 'auth/wrong-password': return "Incorrect email or password.";
      case 'auth/email-already-in-use': return "An account with this email already exists.";
      case 'auth/weak-password': return "Password should be at least 6 characters.";
      default: return "An unexpected error occurred. Please try again.";
    }
  };

  const handleAuthSuccess = (userData) => {
    setSuccessData(userData);
    setTimeout(() => {
      if (userData.profileCompleted) {
        navigate("/", { replace: true });
      } else {
        navigate("/setup", { replace: true });
      }
    }, 1800);
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    if (!email || !password) return setError("Please fill in all required fields.");
    if (isSignUp && !name) return setError("Please provide a display name.");

    setIsLoading(true);
    setError(null);

    try {
      let userData;
      if (isSignUp) {
        userData = await emailSignUp(email, password, name);
      } else {
        userData = await emailLogin(email, password);
      }
      handleAuthSuccess(userData);
    } catch (err) {
      setError(mapFirebaseError(err));
      setIsLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const userData = await signInWithGoogle();
      handleAuthSuccess(userData);
    } catch (err) {
      setError(mapFirebaseError(err));
      setIsLoading(false);
    }
  };

  const handleGuestAuth = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const userData = await signInAsGuest();
      handleAuthSuccess(userData);
    } catch (err) {
      setError(mapFirebaseError(err));
      setIsLoading(false);
    }
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen w-full bg-[#F6F1EA] flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#F6F1EA] flex items-center justify-center p-4 relative overflow-hidden font-sans">
      <style>{`
        @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-10px); } }
        .animate-float { animation: float 6s ease-in-out infinite; }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }
      `}</style>

      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-purple-300/20 blur-[120px] rounded-full pointer-events-none transform-gpu"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-green-200/15 blur-[120px] rounded-full pointer-events-none transform-gpu"></div>

      <div className="relative z-10 w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        
        <div className="hidden lg:flex flex-col gap-8 animate-fade-in-up">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-[16px] bg-white text-purple-600 flex items-center justify-center border border-purple-100 shadow-xl shadow-purple-100/50 animate-float">
              <Brain className="w-7 h-7" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-black text-gray-950 tracking-tight">FlowMind</span>
              <span className="text-[10px] font-black text-purple-600 uppercase tracking-[0.2em]">AI Execution Coach</span>
            </div>
          </div>
          
          <div className="space-y-6">
            <h2 className="text-6xl font-black text-gray-950 leading-[0.95] tracking-tighter">
              Plan Better.<br />
              <span className="text-purple-600">Execute Smarter.</span>
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed max-w-md font-medium">
              FlowMind transforms your goals into intelligent execution plans powered by AI. Stay organized, focused and productive every single day.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {[
              { icon: Sparkles, label: "AI Planning" },
              { icon: Brain, label: "Smart Dashboard" },
              { icon: Activity, label: "Live Insights" },
              { icon: CheckCircle2, label: "Daily Execution" }
            ].map((chip) => (
              <span key={chip.label} className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white border border-[#E9DFD3] text-sm font-bold text-gray-700 shadow-sm hover:scale-105 transition-transform cursor-default">
                <chip.icon className="w-4 h-4 text-purple-500" /> {chip.label}
              </span>
            ))}
          </div>

          <div className="mt-4 flex gap-6">
            {["Secure Authentication", "Firebase Ready", "Privacy First"].map((trust) => (
              <div key={trust} className="flex items-center gap-2 text-xs font-bold text-gray-500">
                <ShieldCheck className="w-4 h-4 text-green-500" /> {trust}
              </div>
            ))}
          </div>
        </div>

        <div className="w-full max-w-[460px] mx-auto bg-white/80 backdrop-blur-sm border border-[#E9DFD3] rounded-[28px] shadow-[0_20px_60px_rgba(80,62,38,0.08)] p-8 md:p-10 transition-all duration-500 relative overflow-hidden">
          
          {successData && (
            <div className="absolute inset-0 bg-white/95 backdrop-blur-md z-50 flex flex-col items-center justify-center p-8 animate-fade-in">
              <div className="w-16 h-16 bg-green-100 text-green-500 rounded-full flex items-center justify-center mb-6">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-black text-gray-950 tracking-tight text-center">Login Successful</h3>
              <p className="text-gray-500 mt-2 font-medium text-center">Welcome, {successData.displayName || "User"}</p>
              <div className="mt-8 flex items-center gap-3 text-sm font-bold text-purple-600">
                <Loader2 className="w-4 h-4 animate-spin" /> Preparing your workspace...
              </div>
            </div>
          )}

          <div className="mb-8">
            <p className="text-[10px] font-black uppercase tracking-widest text-purple-600 mb-2">
              {isSignUp ? "Join Us" : "Welcome 🤗"}
            </p>
            <h3 className="text-3xl font-black text-gray-950 tracking-tight">
              {isSignUp ? "Create Account" : "Sign in to FlowMind"}
            </h3>
            <p className="text-gray-500 mt-2 font-medium">
              {isSignUp ? "Start your AI-powered execution journey today." : "Continue building your AI-powered execution journey."}
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 animate-fade-in">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm font-medium text-red-800">{error}</p>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleEmailAuth}>
            {isSignUp && (
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">Display Name</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  disabled={isLoading}
                  className="w-full px-5 py-4 rounded-2xl bg-[#FAF8F4] border border-[#E9DFD3] focus:border-purple-300 focus:ring-4 focus:ring-purple-500/10 transition-all outline-none disabled:opacity-60"
                />
              </div>
            )}
            
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">Email / ID</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                disabled={isLoading}
                className="w-full px-5 py-4 rounded-2xl bg-[#FAF8F4] border border-[#E9DFD3] focus:border-purple-300 focus:ring-4 focus:ring-purple-500/10 transition-all outline-none disabled:opacity-60"
              />
            </div>
            
            <div className="relative">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">Password</label>
              <input 
                type={showPassword ? "text" : "password"} 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isLoading}
                className="w-full px-5 py-4 rounded-2xl bg-[#FAF8F4] border border-[#E9DFD3] focus:border-purple-300 focus:ring-4 focus:ring-purple-500/10 transition-all outline-none disabled:opacity-60"
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
                className="absolute right-4 top-[44px] text-gray-400 hover:text-purple-600 transition-colors disabled:opacity-60"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-purple-500/20 hover:-translate-y-1 hover:shadow-xl transition-all active:scale-[0.98] disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {isLoading && !successData ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              {isSignUp ? "Sign Up" : "Login"}
            </button>
          </form>

          <div className="flex items-center gap-4 my-8">
            <div className="h-px bg-[#E9DFD3] flex-1"></div>
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">OR</span>
            <div className="h-px bg-[#E9DFD3] flex-1"></div>
          </div>

          <button 
            onClick={handleGoogleAuth}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 bg-white border border-[#E9DFD3] text-gray-700 font-bold py-4 rounded-2xl hover:border-gray-300 hover:shadow-md transition-all active:scale-[0.98] disabled:opacity-60"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <button 
            onClick={handleGuestAuth}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 bg-white border border-purple-200 text-purple-700 font-bold py-4 rounded-2xl hover:border-purple-300 hover:bg-purple-50 hover:shadow-md transition-all active:scale-[0.98] disabled:opacity-60"
          >
            <UserPlus className="w-5 h-5" />
            Continue as Guest
          </button>

          <div className="mt-8 text-center text-sm text-gray-600 font-medium">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button 
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
                setPassword("");
              }} 
              disabled={isLoading}
              className="text-purple-600 font-black hover:underline transition-all disabled:opacity-60"
            >
              {isSignUp ? "Sign In" : "Create Account"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AuthPage;