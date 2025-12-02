import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { ROUTES } from '../../constants/routes.constants';
import { CustomButton } from '../../Components/CustomButton';
import { Stepper } from '../../Components/Stepper';
import { FloatingLabelSelect } from '../../Components/FloatingLabelSelect';
import { Variant, ROLES } from '../../enums';
import { FiLayout, FiCheckCircle, FiDownload } from 'react-icons/fi';
import { Spinner } from '../../constants/Spinner';
import * as XLSX from 'xlsx';

// --- Imports from your Auth Library ---
// Ensure inviteUser matches the arguments: (name, phone, email, password, role)
import { registerUserWithDetails, inviteUser } from '../../lib/AuthOperations';

const viewTypeOptions = [
  { value: 'list', label: 'List View (Compact)' },
  { value: 'card', label: 'Card View (Visual)' },
];

const FinalSetupPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const previousData = location.state || {};

  const [salesViewType, setSalesViewType] = useState('list');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Creating Account...');
  const [error, setError] = useState<string | null>(null);

  // --- 1. GUARD: Prevent Crash on Refresh ---
  // If we don't have the Owner's basic data, send them back to SignUp
  useEffect(() => {
    if (!previousData.email || !previousData.password || !previousData.businessName) {
      console.warn("Session data lost. Redirecting to start.");
    }
  }, [previousData]);

  if (!previousData.email || !previousData.password) {
    return <Navigate to={ROUTES.SIGNUP} replace />;
  }

  // --- Excel Helper ---
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

  // --- MAIN SETUP HANDLER ---
  const handleFinishSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    setStatusMessage('Creating Owner Account...');

    try {
      // 1. Separate Staff list from Owner/Business Data
      const {
        fullName, email, phoneNumber, password, // Owner credentials
        initialStaff, // The list of staff from Step 3
        ...businessDetails
      } = previousData;

      // 2. Prepare Business Data
      const finalBusinessData = {
        ...businessDetails,
        salesSettings: {
          ...(businessDetails.salesSettings || {}),
          salesViewType: salesViewType,
        },
        createdAt: new Date(),
      };

      // 3. REGISTER OWNER & COMPANY FIRST
      // This creates the company in the DB.
      await registerUserWithDetails(
        fullName,
        phoneNumber,
        email,
        password,
        ROLES.OWNER,
        finalBusinessData
      );

      // 4. ADD STAFF MEMBERS (If any)
      if (initialStaff && initialStaff.length > 0) {
        setStatusMessage(`Adding ${initialStaff.length} Team Members...`);

        for (const staff of initialStaff) {
          try {
            // --- AUTO-GENERATE CREDENTIALS HERE ---
            // User inputs: Name, Phone, Role.
            // We generate: Email, Password.

            const generatedEmail = `${staff.phoneNumber}@sellar.in`; // Dummy email
            const defaultPassword = 'Welcome@123'; // Default password

            console.log(`Inviting staff: ${staff.fullName} (${staff.role})`);

            // Call API
            await inviteUser(
              staff.fullName,
              staff.phoneNumber,
              generatedEmail,  // Generated
              defaultPassword, // Generated
              staff.role
            );
          } catch (staffErr) {
            // Log error but don't stop the whole process
            console.error(`Failed to add staff ${staff.fullName}:`, staffErr);
          }
        }
      }

      // 5. Success
      setStatusMessage('Setup Complete!');
      navigate(ROUTES.HOME);

    } catch (err: any) {
      console.error('Final setup failed:', err);
      // Show a readable error message
      setError(err.message || 'Setup failed. Please check your internet and try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 p-4">
      <div className="sticky top-0 z-50 bg-gray-100 pb-4 mb-4">
        <Stepper totalSteps={4} currentStep={4} />
      </div>
      <h1 className="text-4xl font-bold mb-2">Final Touches</h1>
      <p className="text-gray-500 mb-6">Configuring your dashboard...</p>

      <form onSubmit={handleFinishSetup} className="flex flex-col flex-grow">

        {/* View Preference */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4 flex items-center gap-2">
            <FiLayout /> Dashboard Preference
          </h2>
          <FloatingLabelSelect
            id="itemViewType"
            label="Default Item View"
            value={salesViewType}
            onChange={(e) => setSalesViewType(e.target.value)}
            options={viewTypeOptions}
            required
          />
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

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm text-center mb-4 border border-red-200 font-medium animate-pulse">
            Error: {error}
          </div>
        )}

        {/* Submit Button */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gray-100 border-t border-gray-200 z-50">
          <div className="max-w-md mx-auto space-y-4">
            <CustomButton type="submit" variant={Variant.Filled} disabled={isSubmitting} className="h-12 text-lg">
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