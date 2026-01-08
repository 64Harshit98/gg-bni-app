import { Component, type ErrorInfo, type ReactNode } from 'react';
import { CustomButton } from '../Components/CustomButton';
import { Variant } from '../enums';
import dogImage from '../assets/dog-error.png';

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
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-50 p-6 text-center font-poppins overflow-hidden">
          <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full border border-red-100">

            {/* Dog Image Section */}
            <div className="flex justify-center mx-auto mb-4">
              {/* Ensure image_3.png exists in your public folder */}
              <img
                src={dogImage}
                alt="Sad Dog"
                className="w-60 h-24 object-contain"
              />
            </div>

            <h2 className="text-2xl font-bold text-gray-800 mb-2">Oops!</h2>

            <p className="text-gray-500 mb-6 text-sm flex flex-col items-center gap-2">
              <span>I crashed !!</span>
            </p>

            {/* Optional: Show error message in dev mode */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mb-6 p-3 bg-red-50 text-red-700 text-xs text-left rounded overflow-auto max-h-32">
                {this.state.error.toString()}
              </div>
            )}

            <div className="space-y-3">
              <CustomButton
                variant={Variant.Filled}
                onClick={() => window.location.reload()}
                className="w-full justify-center"
              >
                Reload Page
              </CustomButton>

              {/* Using window.location.href since we can't use useNavigate hook in Class Component */}
              <button
                onClick={() => window.location.href = '/'}
                className="text-sm text-gray-500 hover:text-gray-800 underline block w-full mt-2"
              >
                Go to Home
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