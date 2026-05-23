import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import NewCase from "./pages/NewCase";
import CaseDetail from "./pages/CaseDetail";
import EvidenceUpload from "./pages/EvidenceUpload";
import Resources from "./pages/Resources";
import SafetyResources from "./pages/SafetyResources";
import NotFound from "./pages/NotFound";
import { type ReactNode } from "react";
import { Loader2 } from "lucide-react";

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Redirect to="/dashboard" />;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      <Route path="/login">
        <PublicOnlyRoute>
          <Login />
        </PublicOnlyRoute>
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/cases/new">
        <ProtectedRoute>
          <NewCase />
        </ProtectedRoute>
      </Route>
      <Route path="/cases/:id/upload">
        <ProtectedRoute>
          <EvidenceUpload />
        </ProtectedRoute>
      </Route>
      <Route path="/cases/:id">
        <ProtectedRoute>
          <CaseDetail />
        </ProtectedRoute>
      </Route>
      <Route path="/resources">
        <ProtectedRoute>
          <Resources />
        </ProtectedRoute>
      </Route>
      <Route path="/safety">
        <ProtectedRoute>
          <SafetyResources />
        </ProtectedRoute>
      </Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
