// src/Pages/FinalSetupPage.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { ROUTES } from '../../constants/routes.constants';
import { CustomButton } from '../../Components/CustomButton';
import { Stepper } from '../../Components/Stepper';
import { Variant, ROLES } from '../../enums';
import { FiLayout, FiCheckCircle, FiDownload, FiCheck } from 'react-icons/fi';
import { Spinner } from '../../constants/Spinner';
import * as XLSX from 'xlsx';
import { registerUserWithDetails, inviteUser } from '../../lib/AuthOperations';

const FinalSetupPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const previousData = location.state || {};

  const [salesViewType, setSalesViewType] = useState<'list' | 'card'>('list');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Creating Account...');
  const [error, setError] = useState<string | null>(null);

  // --- 1. GUARD ---
  useEffect(() => {
    if (!previousData.email || !previousData.password || !previousData.businessName) {
      console.warn("Session data lost. Redirecting to start.");
    }
  }, [previousData]);

  if (!previousData.email || !previousData.password) {
    return <Navigate to={ROUTES.SIGNUP} replace />;
  }

  // --- 2. Stepper Click Handler ---
  const handleStepClick = (targetStep: number) => {
    // If the user clicks a previous step, save current state and navigate back
    if (targetStep < 4) {
        const currentDataWithState = {
            ...previousData,
            salesSettings: {
                ...(previousData.salesSettings || {}),
                salesViewType: salesViewType // Preserve selection
            }
        };

        if (targetStep === 1) navigate(ROUTES.SIGNUP, { state: currentDataWithState });
        if (targetStep === 2) navigate(ROUTES.BUSINESS_INFO, { state: currentDataWithState });
        if (targetStep === 3) navigate(ROUTES.SHOP_SETUP, { state: currentDataWithState });
    }
  };

  const handleDownloadSample = () => {
    try {
      const sampleData = [{ name: 'Sample Item', mrp: 100, purchasePrice: 80, Stock: 10 }];
      const ws = XLSX.utils.json_to_sheet(sampleData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Items');
      XLSX.writeFile(wb, 'Inventory_Sample.xlsx');
    } catch (err) {
      console.error(err);
    }
  };

  const handleFinishSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    setStatusMessage('Creating Owner Account...');

    try {
      const {
        fullName, email, phoneNumber, password,
        initialStaff,
        ...businessDetails
      } = previousData;

      const finalBusinessData = {
        ...businessDetails,
        salesSettings: {
          ...(businessDetails.salesSettings || {}),
          salesViewType: salesViewType,
        },
        createdAt: new Date(),
      };

      await registerUserWithDetails(
        fullName, phoneNumber, email, password, ROLES.OWNER, finalBusinessData
      );

      if (initialStaff && initialStaff.length > 0) {
        setStatusMessage(`Adding ${initialStaff.length} Team Members...`);
        for (const staff of initialStaff) {
          try {
            const generatedEmail = `${staff.phoneNumber}@sellar.in`;
            const defaultPassword = 'Welcome@123';
            await inviteUser(staff.fullName, staff.phoneNumber, generatedEmail, defaultPassword, staff.role);
          } catch (staffErr) {
            console.error(`Failed to add staff ${staff.fullName}:`, staffErr);
          }
        }
      }

      setStatusMessage('Setup Complete!');
      navigate(ROUTES.HOME);

    } catch (err: any) {
      console.error('Final setup failed:', err);
      setError(err.message || 'Setup failed. Please check your internet and try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 p-4">
      <div className="sticky top-0 z-50 bg-gray-100 pb-4 mb-4">
        <Stepper 
            totalSteps={4} 
            currentStep={4} 
            onStepClick={handleStepClick} // <--- Added this back
        />
      </div>
      <h1 className="text-4xl font-bold mb-2">Final Touches</h1>
      <p className="text-gray-500 mb-4">Configuring your dashboard...</p>

      <form onSubmit={handleFinishSetup} className="flex flex-col flex-grow">

        {/* --- VIEW PREFERENCE SELECTOR --- */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4 flex items-center gap-2">
            <FiLayout /> Items View (while Billing)
          </h2>
          
          <div className="grid grid-cols-2 gap-4">
            
            {/* Option 1: List View */}
            <div 
              onClick={() => setSalesViewType('list')}
              className={`cursor-pointer relative rounded-xl border-2 p-4 flex flex-col items-center gap-3 transition-all duration-200
                ${salesViewType === 'list' 
                  ? 'border-blue-600 bg-blue-50 shadow-md' 
                  : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}
            >
              {salesViewType === 'list' && (
                <div className="absolute top-2 right-2 bg-blue-600 text-white rounded-full p-0.5">
                  <FiCheck size={12} />
                </div>
              )}
              {/* Visual: List Lines */}
              <div className="w-full h-20 bg-white border border-gray-200 rounded p-2 flex flex-col gap-2 justify-center shadow-inner">
                <div className="h-2 w-3/4 bg-gray-300 rounded"></div>
                <div className="h-2 w-full bg-gray-200 rounded"></div>
                <div className="h-2 w-5/6 bg-gray-200 rounded"></div>
                <div className="h-2 w-full bg-gray-200 rounded"></div>
              </div>
              <div className="text-center">
                <p className="font-bold text-gray-800">List View</p>
                <p className="text-xs text-gray-500">Compact & Fast</p>
              </div>
            </div>

            {/* Option 2: Card View */}
            <div 
              onClick={() => setSalesViewType('card')}
              className={`cursor-pointer relative rounded-xl border-2 p-4 flex flex-col items-center gap-3 transition-all duration-200
                ${salesViewType === 'card' 
                  ? 'border-blue-600 bg-blue-50 shadow-md' 
                  : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}
            >
              {salesViewType === 'card' && (
                <div className="absolute top-2 right-2 bg-blue-600 text-white rounded-full p-0.5">
                  <FiCheck size={12} />
                </div>
              )}
              {/* Visual: Grid Boxes */}
              <div className="w-full h-20 bg-white border border-gray-200 rounded p-2 grid grid-cols-3 gap-2 shadow-inner">
                 <div className="bg-gray-200 rounded aspect-square"></div>
                 <div className="bg-gray-200 rounded aspect-square"></div>
                 <div className="bg-gray-200 rounded aspect-square"></div>
                 <div className="bg-gray-200 rounded aspect-square"></div>
                 <div className="bg-gray-200 rounded aspect-square"></div>
                 <div className="bg-gray-200 rounded aspect-square"></div>
              </div>
              <div className="text-center">
                <p className="font-bold text-gray-800">Card View</p>
                <p className="text-xs text-gray-500">Visual & Touch Friendly</p>
              </div>
            </div>

          </div>
        </div>

        {/* Bulk Import */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4 flex items-center gap-2">
            <FiDownload /> Bulk Import
          </h2>
          <p className="text-sm text-gray-600 mb-4">Have existing inventory? Download the template now.</p>
          <CustomButton type="button" variant={Variant.Outline} onClick={handleDownloadSample} className="w-full flex items-center justify-center gap-2">
            <FiDownload /> Download Sample Excel
          </CustomButton>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm text-center mb-4 border border-red-200 font-medium animate-pulse">
            Error: {error}
          </div>
        )}

        {/* Submit Button */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gray-100 border-t border-gray-200 z-50">
          <div className="max-w-md mx-auto space-y-4">
            <CustomButton type="submit" variant={Variant.Filled} disabled={isSubmitting} className="h-12 text-lg w-full">
              {isSubmitting ? (
                <div className="flex items-center justify-center gap-2">
                  <Spinner />
                  <span>{statusMessage}</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <span>Complete Setup</span>
                  <FiCheckCircle />
                </div>
              )}
            </CustomButton>
          </div>
        </div>
      </form>
    </div>
  );
};

export default FinalSetupPage;