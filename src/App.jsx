import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { AuthProvider } from "./contexts/AuthProvider";
import { useAuth } from "./hooks/useAuth";
import { PlanProvider } from "./contexts/PlanProvider";

import AuthPage from "./pages/AuthPage";
import SetupPage from "./pages/SetupPage";
import Dashboard from "./pages/Dashboard";
import AIPlanner from "./pages/AIPlanner";
import TaskBoard from "./pages/TaskBoard";
import Insights from "./pages/Insights";
import MainLayout from "./components/layout/MainLayout";

const ProtectedRoute = ({ children, requireAuth, requireProfile }) => {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-[#F6F1EA] flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
      </div>
    );
  }

  const profileReady = profile?.profileCompleted ?? false;

  if (requireAuth && !user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!requireAuth && user && profileReady) return <Navigate to="/" replace />;
  if (!requireAuth && user && !profileReady) return <Navigate to="/setup" replace />;
  if (requireAuth && requireProfile && !profileReady) return <Navigate to="/setup" replace />;
  if (requireAuth && requireProfile === false && profileReady) return <Navigate to="/" replace />;

  return children;
};

function App() {
  return (
    <AuthProvider>
      <PlanProvider>
        <Router>
          <Routes>
            <Route 
              path="/login" 
              element={<ProtectedRoute requireAuth={false}><AuthPage /></ProtectedRoute>} 
            />
            
            <Route 
              path="/setup" 
              element={<ProtectedRoute requireAuth={true} requireProfile={false}><SetupPage /></ProtectedRoute>} 
            />
            
            <Route 
              element={<ProtectedRoute requireAuth={true} requireProfile={true}><MainLayout /></ProtectedRoute>}
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/planner" element={<AIPlanner />} />
              <Route path="/tasks" element={<TaskBoard />} />
              <Route path="/taskboard" element={<Navigate to="/tasks" replace />} />
              <Route path="/insights" element={<Insights />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </PlanProvider>
    </AuthProvider>
  );
}

export default App;