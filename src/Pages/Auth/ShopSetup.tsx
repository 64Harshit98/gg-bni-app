import React, { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { ROUTES } from '../../constants/routes.constants';
import { CustomButton } from '../../Components/CustomButton';
import { FloatingLabelInput } from '../../Components/ui/FloatingLabelInput';
import { Stepper } from '../../Components/Stepper';
import { FloatingLabelSelect } from '../../Components/FloatingLabelSelect';
import { Variant, ROLES } from '../../enums';
import { FiUser, FiTrash2, FiPlus } from 'react-icons/fi';

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
  const previousData = location.state;

  // --- Redirect if skipped Step 2 ---
  if (!previousData?.businessName) {
    return <Navigate to={ROUTES.BUSINESS_INFO} replace />;
  }

  // --- States: Sales Settings ---
  const gstScheme = previousData?.gstType || 'NA';
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

  // --- Handler 1: Add Staff to Local List ---
  const handleAddStaffLocal = () => {
    setUserError(null);

    if (!userFullName.trim() || !userPhoneNumber.trim()) {
      setUserError('Please enter Name and Phone Number.');
      return;
    }

    // Create staff object
    const newStaff = {
      fullName: userFullName,
      phoneNumber: userPhoneNumber,
      role: userRole,
      // We generate a placeholder here; the actual email is generated in Final Setup
      email: `${userPhoneNumber.trim()}@staff.temp`,
      password: 'Welcome@123'
    };

    setStaffList([...staffList, newStaff]);

    // Reset fields
    setUserFullName('');
    setUserPhoneNumber('');
    setUserRole(ROLES.SALESMAN);
  };

  // --- Handler 2: Remove Staff ---
  const handleRemoveStaff = (index: number) => {
    const updatedList = [...staffList];
    updatedList.splice(index, 1);
    setStaffList(updatedList);
  };

  // --- Handler 3: Next Step ---
  const handleNext = () => {
    const salesSettings = {
      gstScheme,
      taxType: gstScheme === 'Regular' ? taxType : 'exclusive',
      enableItemWiseDiscount,
      allowDueBilling,
      requireCustomerName,
      requireCustomerMobile,
    };

    // Combine previous data + current settings + staff list
    const combinedData = {
      ...previousData,
      salesSettings,
      initialStaff: staffList // Optional: Can be empty array
    };

    // CORRECTED: Go to Final Setup, NOT Login
    navigate(ROUTES.SHOP_SETUP2, {
      state: combinedData,
    });
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 p-4 mb-10">
      <div className="sticky top-0 z-50 bg-gray-100 pb-4 mb-4">
        <Stepper totalSteps={4} currentStep={3} />
      </div>
      <h1 className="text-4xl font-bold mb-6">Shop Setup</h1>

      <div className="flex flex-col space-y-4 flex-grow">

        {/* --- Card 1: Sales Settings --- */}
        <div className="bg-gray-100 p-6 rounded-lg shadow-sm border border-gray-200 space-y-6">
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
        <div className="bg-gary-100 p-4 rounded-lg shadow-sm border border-gray-200 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800 border-b pb-2">Add Staff (Optional)</h2>
          <p className="text-sm text-gray-600">These users will be created when you finish setup.</p>
          <p className="text-sm text-gray-600">The user mail is PhoneNo@sellar.in </p>
          <p className="text-sm text-gray-600">Preset password is Welcome@123</p>


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

        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gray-100 border-t border-gray-200 z-50">
          <div className="max-w-md mx-auto space-y-4">
            <CustomButton
              type="button"
              variant={Variant.Filled}
              onClick={() => handleNext()}
            >
              Next Step
            </CustomButton>
          </div>
        </div>
      </div>
    </div>
  );
};

const CheckboxRow = ({ id, label, checked, onChange }: any) => (
  <div className="flex items-center h-6">
    <input id={id} type="checkbox" className="h-4 w-4 mr-2 rounded text-blue-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <label htmlFor={id} className="text-gray-900 font-medium text-sm">{label}</label>
  </div>
);

export default ShopSetupPage;