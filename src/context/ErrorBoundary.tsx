import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { CustomButton } from '../Components/CustomButton';
import { Variant, PLANS } from '../enums';
import { ROUTES } from '../constants/routes.constants';
import { useAuth } from '../context/auth-context';
import dogImage from '../assets/dog-error.png';

const SmartErrorUI: React.FC<{ error?: Error }> = ({ error }) => {
  const { currentUser } = useAuth();

  const handleGoHome = () => {
    if (!currentUser) {
      window.location.href = ROUTES.LANDING || '/';
      return;
    }
    const isEnterprise = currentUser.plan === 'enterprise';
    const isCatalogueOnly =
      currentUser.plan === PLANS.CATALOGUE_PRO;

    if (isCatalogueOnly && !isEnterprise) {
      window.location.href = ROUTES.CHOME;
    } else {
      window.location.href = ROUTES.HOME;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-50 p-6 text-center font-poppins overflow-hidden">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full border border-red-100">

        {/* Dog Image Section */}
        <div className="flex justify-center mx-auto mb-4">
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
        {process.env.NODE_ENV === 'development' && error && (
          <div className="mb-6 p-3 bg-red-50 text-red-700 text-xs text-left rounded overflow-auto max-h-32">
            {error.toString()}
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

          {/* SMART ROUTING BUTTON */}
          <button
            onClick={handleGoHome}
            className="text-sm text-gray-500 hover:text-gray-800 underline block w-full mt-2"
          >
            Go to Home
          </button>
        </div>
      </div>
    </div>
  );
};

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

    const errorMessage = error?.message?.toLowerCase() || '';
    const isChunkLoadError =
      errorMessage.includes('failed to fetch dynamically imported module') ||
      errorMessage.includes('expected a javascript') ||
      errorMessage.includes('text/html');

    if (isChunkLoadError) {
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

      return <SmartErrorUI error={this.state.error} />;
    }

    return this.props.children;
  }
}

export default ErrorBoundary;