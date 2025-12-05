// src/Pages/ShopSetupPage.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ROUTES } from '../../constants/routes.constants';
import { CustomButton } from '../../Components/CustomButton';
import { FloatingLabelInput } from '../../Components/ui/FloatingLabelInput';
import { Stepper } from '../../Components/Stepper';
import { FloatingLabelSelect } from '../../Components/FloatingLabelSelect';
import { Variant, ROLES } from '../../enums';
import { FiUser, FiTrash2, FiPlus } from 'react-icons/fi';

const LOCAL_STORAGE_KEY = 'sellar_onboarding_data';

// --- Options ---
const taxTypeOptions = [
  { value: 'exclusive', label: 'Tax Exclusive (Sale Price + GST)' },
  { value: 'inclusive', label: 'Tax Inclusive (Sale Price includes GST)' },
];

const roleOptions = [
  { value: ROLES.SALESMAN, label: 'Salesman' },
  { value: ROLES.MANAGER, label: 'Manager' },
];

const ShopSetupPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // --- States: Sales Settings ---
  // We initialize with defaults, then useEffect will overwrite them from LS or Route
  const [gstScheme, setGstScheme] = useState('NA');
  const [taxType, setTaxType] = useState('exclusive');
  const [enableItemWiseDiscount, setEnableItemWiseDiscount] = useState(true);
  const [allowDueBilling, setAllowDueBilling] = useState(true);
  const [requireCustomerName, setRequireCustomerName] = useState(true);
  const [requireCustomerMobile, setRequireCustomerMobile] = useState(false);

  // --- States: Staff (Local Only) ---
  const [staffList, setStaffList] = useState<any[]>([]);
  const [userFullName, setUserFullName] = useState('');
  const [userPhoneNumber, setUserPhoneNumber] = useState('');
  const [userRole, setUserRole] = useState<ROLES>(ROLES.SALESMAN);
  const [userError, setUserError] = useState<string | null>(null);

  // --- 1. Load Data on Mount ---
  useEffect(() => {
    const routeData = location.state || {};
    const savedDataString = localStorage.getItem(LOCAL_STORAGE_KEY);
    const savedData = savedDataString ? JSON.parse(savedDataString) : {};

    // Merge: Route Data takes priority for fresh navigation, Saved Data fills gaps
    const mergedData = { ...savedData, ...routeData };

    // If we still don't have businessName, it means the user skipped Step 1/2 completely
    // But we allow loading from LS just in case of refresh
    if (!mergedData.businessName) {
      // navigate(ROUTES.BUSINESS_INFO); // Uncomment to strict enforce
    }

    // Restore Settings
    if (mergedData.gstType) setGstScheme(mergedData.gstType);

    // If settings were saved previously in LS, restore them
    if (mergedData.salesSettings) {
      setTaxType(mergedData.salesSettings.taxType || 'exclusive');
      setEnableItemWiseDiscount(mergedData.salesSettings.enableItemWiseDiscount ?? true);
      setAllowDueBilling(mergedData.salesSettings.allowDueBilling ?? true);
      setRequireCustomerName(mergedData.salesSettings.requireCustomerName ?? true);
      setRequireCustomerMobile(mergedData.salesSettings.requireCustomerMobile ?? false);
    }

    // Restore Staff List
    if (mergedData.initialStaff && Array.isArray(mergedData.initialStaff)) {
      setStaffList(mergedData.initialStaff);
    }

    // Save merged state back to ensure consistency
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mergedData));
  }, []);

  // --- 2. Save Data on Change ---
  useEffect(() => {
    const saveData = () => {
      const currentSaved = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}');

      const salesSettings = {
        gstScheme,
        taxType: gstScheme === 'Regular' ? taxType : 'exclusive',
        enableItemWiseDiscount,
        allowDueBilling,
        requireCustomerName,
        requireCustomerMobile,
      };

      const updatedData = {
        ...currentSaved,
        salesSettings,
        initialStaff: staffList
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedData));
    };
    saveData();
  }, [gstScheme, taxType, enableItemWiseDiscount, allowDueBilling, requireCustomerName, requireCustomerMobile, staffList]);


  // --- Handlers ---
  const handleAddStaffLocal = () => {
    setUserError(null);
    if (!userFullName.trim() || !userPhoneNumber.trim()) {
      setUserError('Please enter Name and Phone Number.');
      return;
    }
    const newStaff = {
      fullName: userFullName,
      phoneNumber: userPhoneNumber,
      role: userRole,
      email: `${userPhoneNumber.trim()}@staff.temp`,
      password: 'Welcome@123'
    };
    setStaffList([...staffList, newStaff]);
    setUserFullName('');
    setUserPhoneNumber('');
    setUserRole(ROLES.SALESMAN);
  };

  const handleRemoveStaff = (index: number) => {
    const updatedList = [...staffList];
    updatedList.splice(index, 1);
    setStaffList(updatedList);
  };

  const getCombinedData = () => {
    return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}');
  };

  const handleNext = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // Data is already saved by useEffect
    const allData = getCombinedData();
    navigate(ROUTES.SHOP_SETUP2, {
      state: allData,
    });
  };

  // --- Stepper Click Handler ---
  const handleStepClick = (targetStep: number) => {
    const currentData = getCombinedData();

    if (targetStep === 1) {
      navigate(ROUTES.SIGNUP, { state: currentData });
    } else if (targetStep === 2) {
      navigate(ROUTES.BUSINESS_INFO, { state: currentData });
    } else if (targetStep === 3) {
      return; // Already here
    } else if (targetStep === 4) {
      handleNext(); // Move forward logic
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-100">

      <div className="sticky top-0 z-40 bg-gray-100 pt-4 pb-2 px-4 shadow-sm">
        <Stepper
          totalSteps={4}
          currentStep={3}
          onStepClick={handleStepClick}
        />
      </div>

      <div className="flex-grow px-4 pb-24 overflow-y-auto">
        <h1 className="text-4xl font-bold mb-4 mt-4">Shop Setup</h1>

        <div className="flex flex-col space-y-4">

          {/* --- Card 1: Sales Settings --- */}
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 space-y-6 pt-6 pb-6">
            <h2 className="text-lg font-semibold text-gray-800 border-b pb-2">Sales & Tax</h2>

            <FloatingLabelInput
              id="gstSchemeDisplay"
              label="GST Scheme"
              value={gstScheme === 'NA' ? 'Not Registered / NA' : gstScheme.toUpperCase()}
              disabled
            />

            {gstScheme === 'Regular' && (
              <FloatingLabelSelect
                id="taxType"
                label="Tax Calculation"
                value={taxType}
                onChange={(e) => setTaxType(e.target.value)}
                options={taxTypeOptions}
              />
            )}

            <div className="space-y-3 pt-2">
              <CheckboxRow id="itemDiscount" label="Enable Item-wise Discount" checked={enableItemWiseDiscount} onChange={setEnableItemWiseDiscount} />
              <CheckboxRow id="creditSale" label="Allow Due Billing (Credit)" checked={allowDueBilling} onChange={setAllowDueBilling} />
              <div className="border-t pt-2 mt-2">
                <CheckboxRow id="reqCustomerName" label="Require Customer Name" checked={requireCustomerName} onChange={setRequireCustomerName} />
                <CheckboxRow id="reqCustomerMobile" label="Require Customer Mobile" checked={requireCustomerMobile} onChange={setRequireCustomerMobile} />
              </div>
            </div>
          </div>

          {/* --- Card 2: Add Staff --- */}
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 space-y-2 pt-6 pb-6">
            <h2 className="text-lg font-semibold text-gray-800 border-b pb-2">Add Staff (Optional)</h2>
            <div className="text-sm text-gray-600 space-y-1">
              <p>These users will be created when you finish setup.</p>
              <p>User Login: <span className="font-bold bg-gray-100 px-1">PhoneNo@sellar.in</span></p>
              <p>Default Password: <span className="font-bold bg-gray-100 px-1">Welcome@123</span></p>
            </div>

            <div className="space-y-4">
              <div className='grid grid-cols-2 gap-2'>
                <FloatingLabelInput id="userFullName" label="Full Name" value={userFullName} onChange={(e) => setUserFullName(e.target.value)} />
                <FloatingLabelInput id="userPhone" label="Phone Number" value={userPhoneNumber} onChange={(e) => setUserPhoneNumber(e.target.value)} type="tel" />
              </div>
              <FloatingLabelSelect id="userRole" label="Role" value={userRole} onChange={(e) => setUserRole(e.target.value as ROLES)} options={roleOptions} />

              {userError && <p className="text-sm text-red-600 bg-red-50 p-2 rounded text-center">{userError}</p>}

              <CustomButton type="button" variant={Variant.Outline} onClick={handleAddStaffLocal} className="w-full flex items-center justify-center gap-2">
                <FiPlus /> Add to List
              </CustomButton>
            </div>

            {/* List Display */}
            {staffList.length > 0 && (
              <div className="mt-4 space-y-2 bg-gray-50 p-3 rounded-lg">
                <h4 className="font-medium text-sm text-gray-700">Staff to be added:</h4>
                {staffList.map((staff, index) => (
                  <div key={index} className="flex justify-between items-center bg-white p-2 rounded border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-2">
                      <div className="bg-blue-100 p-2 rounded-full text-blue-600"><FiUser /></div>
                      <div>
                        <p className="text-sm font-semibold">{staff.fullName}</p>
                        <p className="text-xs text-gray-500">{staff.role}</p>
                      </div>
                    </div>
                    <button onClick={() => handleRemoveStaff(index)} className="text-red-500 hover:text-red-700 p-2"><FiTrash2 /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fixed Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 z-50 shadow-lg">
        <div className="max-w-md mx-auto">
          <CustomButton type="button" variant={Variant.Filled} onClick={() => handleNext()} className="w-full">
            Next Step
          </CustomButton>
        </div>
      </div>

    </div>
  );
};

const CheckboxRow = ({ id, label, checked, onChange }: any) => (
  <div className="flex items-center h-6 cursor-pointer">
    <input id={id} type="checkbox" className="h-4 w-4 mr-2 rounded text-sky-500 cursor-pointer" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <label htmlFor={id} className="text-gray-600 font-medium text-sm cursor-pointer">{label}</label>
  </div>
);

export default ShopSetupPage;