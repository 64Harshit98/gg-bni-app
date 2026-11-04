import { Component, type ErrorInfo, type ReactNode } from 'react';
import CrashScreen from '../Components/CrashScreen';
import { isChunkLoadError, reloadOnce } from '../lib/chunkReload';

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
      reloadOnce();
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