import { Component, type ErrorInfo, type ReactNode } from 'react';
import CrashScreen, { isChunkLoadError } from '../Components/CrashScreen';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);

    if (isChunkLoadError(error)) {
      window.location.reload();
    }
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Rendered outside AuthProvider, so CrashScreen reads auth only if it's there.
      return <CrashScreen error={this.state.error} />;
    }

    return this.props.children;
  }
}

export default ErrorBoundary;