import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw, Home, LayoutDashboard } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    // Don't show error boundary for benign cancel/abort errors
    if (
      error?.message?.includes("cancel") ||
      error?.name === "AbortError" ||
      error?.message?.includes("aborted")
    ) {
      console.warn("[ErrorBoundary] Suppressed benign error:", error.message);
      return { hasError: false, error: null };
    }
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    // Log but don't crash for cancel errors
    if (
      error?.message?.includes("cancel") ||
      error?.name === "AbortError"
    ) {
      this.setState({ hasError: false, error: null });
      return;
    }
    console.error("[ErrorBoundary]", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background text-foreground">
          <div className="flex flex-col items-center w-full max-w-lg p-8">
            <AlertTriangle
              size={48}
              className="text-amber-500 mb-6 flex-shrink-0"
            />

            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground text-center mb-6">
              An unexpected error occurred. This has been logged. You can return to Dashboard without re-entering the failed page.
            </p>

            {this.state.error?.message && (
              <div className="p-3 w-full rounded-lg bg-muted/50 border border-border overflow-auto mb-6">
                <p className="text-sm text-muted-foreground font-mono">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={() => {
                  window.location.href = "/dashboard";
                }}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg",
                  "bg-primary text-primary-foreground",
                  "hover:opacity-90 cursor-pointer"
                )}
              >
                <LayoutDashboard size={16} />
                Dashboard
              </button>
              <button
                onClick={() => {
                  window.location.href = "/";
                }}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg",
                  "bg-muted text-foreground",
                  "hover:bg-muted/80 cursor-pointer"
                )}
              >
                <Home size={16} />
                Home
              </button>
              <button
                onClick={() => window.location.reload()}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg border border-border",
                  "bg-background text-foreground",
                  "hover:bg-muted cursor-pointer"
                )}
              >
                <RotateCcw size={16} />
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
