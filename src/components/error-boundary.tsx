import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { reportError } from "../lib/error-reporting";

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info);
    reportLovableError(error, {
      boundary: "react_error_boundary",
      componentStack: info.componentStack,
    });
    void reportError({
      error,
      source: "react_boundary",
      severity: "error",
      context: { componentStack: info.componentStack },
    });
    this.props.onError?.(error, info);
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
      return (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 p-6 text-center">
          <h2 className="text-lg font-semibold text-foreground">یوه تېروتنه رامنځته شوه</h2>
          <p className="text-sm text-muted-foreground">{this.state.error.message}</p>
          <button
            onClick={this.reset}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            بیا هڅه
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
