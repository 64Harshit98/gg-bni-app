import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ROUTES } from '../../constants/routes.constants';
import { CustomButton } from '../../Components/CustomButton';
import { FloatingLabelInput } from '../../Components/ui/FloatingLabelInput';
import { Stepper } from '../../Components/Stepper';
import { FloatingLabelSelect } from '../../Components/FloatingLabelSelect';
import { InfoTooltip } from '../../Components/InfoToolTip'; // <--- IMPORT TOOLTIP
import { Variant, ROLES } from '../../enums';
import { FiUser, FiTrash2, FiPlus } from 'react-icons/fi';
import { saveLeadProgress } from '../../lib/Lead';
import { db } from '../../lib/Firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '../../context/auth-context';
import {
  getDefaultCatalogueSalesSettings,
  type CatalogueSalesSettings
} from '../Settings/CatalogueSalesSetting';

const LOCAL_STORAGE_KEY = 'sellar_onboarding_data';

const taxTypeOptions = [
  { value: 'exclusive', label: 'Tax Exclusive (Price + GST)' },
  { value: 'inclusive', label: 'Tax Inclusive (Price includes GST)' },
];

const roleOptions = [
  { value: ROLES.SALESMAN, label: 'Salesman' },
  { value: ROLES.MANAGER, label: 'Manager' },
];

const CatalogueRegistration3: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSalesLoading, setIsSalesLoading] = useState(true);
  const [salesSettings, setSalesSettings] = useState<CatalogueSalesSettings | null>(null);
  const [gstScheme, setGstScheme] = useState('NA');
  const [taxType, setTaxType] = useState('exclusive');
  const [enableItemWiseDiscount, setEnableItemWiseDiscount] = useState(true);
  const [allowDueBilling, setAllowDueBilling] = useState(true);
  const [requireCustomerName, setRequireCustomerName] = useState(true);
  const [requireCustomerMobile, setRequireCustomerMobile] = useState(false);

  const [staffList, setStaffList] = useState<any[]>([]);
  const [userFullName, setUserFullName] = useState('');
  const [userPhoneNumber, setUserPhoneNumber] = useState('');
  const [userRole, setUserRole] = useState<ROLES>(ROLES.SALESMAN);
  const [userError, setUserError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const routeData = location.state || {};
    const savedDataString = localStorage.getItem(LOCAL_STORAGE_KEY);
    const savedData = savedDataString ? JSON.parse(savedDataString) : {};
    const mergedData = { ...savedData, ...routeData };

    if (mergedData.gstType) setGstScheme(mergedData.gstType);

    if (mergedData.salesSettings) {
      setTaxType(mergedData.salesSettings.taxType || 'exclusive');
      setEnableItemWiseDiscount(mergedData.salesSettings.enableItemWiseDiscount ?? true);
      setAllowDueBilling(mergedData.salesSettings.allowDueBilling ?? true);
      setRequireCustomerName(mergedData.salesSettings.requireCustomerName ?? true);
      setRequireCustomerMobile(mergedData.salesSettings.requireCustomerMobile ?? false);
    }
    if (mergedData.initialStaff && Array.isArray(mergedData.initialStaff)) {
      setStaffList(mergedData.initialStaff);
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mergedData));
  }, []);

  useEffect(() => {
    if (!currentUser?.companyId) return;

    const fetchSalesSettings = async () => {
      setIsSalesLoading(true);
      const companyId = currentUser.companyId;

      try {
        const ref = doc(
          db,
          'companies',
          companyId,
          'settings',
          'catalogue-sales-settings'
        );

        const snap = await getDoc(ref);
        const defaults = getDefaultCatalogueSalesSettings(companyId);

        if (snap.exists()) {
          setSalesSettings({
            ...defaults,
            ...snap.data(),
          } as CatalogueSalesSettings);
        } else {
          setSalesSettings(defaults);
        }
      } catch (err) {
        console.error('Failed to load sales settings', err);
      } finally {
        setIsSalesLoading(false);
      }
    };

    fetchSalesSettings();
  }, [currentUser?.companyId]);

  useEffect(() => {
    const saveData = () => {
      const currentSaved = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}');
      const updatedData = {
        ...currentSaved,
        salesSettings: {
          gstScheme,
          taxType: gstScheme === 'Regular' ? taxType : 'exclusive',
          enableItemWiseDiscount,
          allowDueBilling,
          requireCustomerName,
          requireCustomerMobile,
        },
        initialStaff: staffList
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedData));
    };
    saveData();
  }, [gstScheme, taxType, enableItemWiseDiscount, allowDueBilling, requireCustomerName, requireCustomerMobile, staffList]);

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

  const getCombinedData = () => JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}');

  const handleNext = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    const allData = getCombinedData();
    try {
      await saveLeadProgress(allData.email, {
        salesSettings: {
          gstScheme,
          taxType: gstScheme === 'Regular' ? taxType : 'exclusive',
          enableItemWiseDiscount,
          allowDueBilling
        },
        staffCount: staffList.length,
        currentStep: 'Step 4: Final Review',
        status: 'Onboarding'
      });
      //  save catalogue sales settings
      if (currentUser?.companyId && salesSettings) {
        const ref = doc(
          db,
          'companies',
          currentUser.companyId,
          'settings',
          'catalogue-sales-settings'
        );

        await setDoc(ref, salesSettings, { merge: true });
      }

    } catch (err) {

    } finally {
      setIsSaving(false);
    }
  };

  const handleStepClick = (targetStep: number) => {
    if (targetStep === 3) return;
    navigate(`${ROUTES.CHOME}/${ROUTES.CATA_COMINGSOON}`);
  };

  const handleSalesCheckbox = (
    field: keyof CatalogueSalesSettings,
    checked: boolean
  ) => {
    if (!salesSettings) return;
    setSalesSettings({ ...salesSettings, [field]: checked });
  };

  const handleSalesChange = (
    field: keyof CatalogueSalesSettings,
    value: any
  ) => {
    if (!salesSettings) return;
    setSalesSettings({ ...salesSettings, [field]: value });
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-100">
      <div className="flex-shrink-0 bg-gray-100 pt-4 pb-2 px-4 shadow-sm z-40">
        <Stepper totalSteps={4} currentStep={3} onStepClick={handleStepClick} />
      </div>

      <div className="flex-grow px-4 pb-32 overflow-y-auto scrollbar-hide">
        <h1 className="text-4xl font-bold mb-4 mt-4">Shop Setup</h1>

        <div className="flex flex-col space-y-4">
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 space-y-6 pt-6 pb-6">
            <div className="flex items-center justify-between border-b pb-2">
              <h2 className="text-lg font-semibold text-gray-800">Sales & Tax</h2>
            </div>

            <div className="flex items-center">
              <div className="flex-grow">
                <FloatingLabelInput
                  id="gstSchemeDisplay"
                  label="GST Scheme"
                  value={gstScheme === 'NA' ? 'Not Registered / NA' : gstScheme.toUpperCase()}
                  disabled
                />
              </div>
              <InfoTooltip text="Based on your selection in the previous step. Regular dealers can file tax invoices." />
            </div>

            {gstScheme === 'Regular' && (
              <div className="flex items-center">
                <div className="flex-grow">
                  <FloatingLabelSelect
                    id="taxType"
                    label="Tax Calculation"
                    value={taxType}
                    onChange={(e) => setTaxType(e.target.value)}
                    options={taxTypeOptions}
                  />
                </div>
                <InfoTooltip text="Exclusive adds tax ON TOP of your price. Inclusive means the price ALREADY contains tax." />
              </div>
            )}

            {/* 🔥 Catalogue Sales Settings */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 space-y-4">
              <h2 className="text-lg font-semibold text-gray-800">
                Catalogue Sales Settings
              </h2>

              {isSalesLoading || !salesSettings ? (
                <p className="text-sm text-gray-500">Loading sales settings...</p>
              ) : (
                <>
                  {/* Visibility */}
                  <div className="space-y-2">
                    <p className="font-medium text-sm text-gray-700">Visibility</p>

                    <CheckboxRow
                      id="showOutOfStockItems"
                      label="Show Out of Stock Items"
                      checked={salesSettings.showOutOfStockItems}
                      onChange={(v: boolean) =>
                        handleSalesCheckbox('showOutOfStockItems', v)
                      }
                    />

                    <CheckboxRow
                      id="disableOutOfStockAddToCart"
                      label="Disable Add to Cart when Out of Stock"
                      checked={salesSettings.disableOutOfStockAddToCart}
                      onChange={(v: boolean) =>
                        handleSalesCheckbox('disableOutOfStockAddToCart', v)
                      }
                    />
                  </div>

                  {/* Pricing */}
                  <div className="space-y-2 pt-2 border-t">
                    <p className="font-medium text-sm text-gray-700">
                      Pricing Display
                    </p>

                    <FloatingLabelSelect
                      id="priceDisplayMode"
                      label="Price Display Mode"
                      value={salesSettings.priceDisplayMode}
                      onChange={(e) =>
                        handleSalesChange('priceDisplayMode', e.target.value)
                      }
                      options={[
                        { value: 'mrp', label: 'Show MRP Only' },
                        { value: 'salePrice', label: 'Show Sale Price Only' },
                        { value: 'both', label: 'Show Both' },
                      ]}
                    />

                    <CheckboxRow
                      id="showDiscountBadge"
                      label="Show Discount Badge"
                      checked={salesSettings.showDiscountBadge}
                      onChange={(v: boolean) =>
                        handleSalesCheckbox('showDiscountBadge', v)
                      }
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Staff Section */}
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 space-y-2 pt-6 pb-6">
            <div className="flex items-center border-b pb-2">
              <h2 className="text-lg font-semibold text-gray-800">Add Staff (Optional)</h2>
              <InfoTooltip text="Create accounts for your employees. Salesmen can only bill, Managers can edit stock." />
            </div>
            <div className="text-sm text-gray-600 space-y-1">
              <p>User Login: <span className="font-bold bg-gray-100 px-1">PhoneNo@sellar.in</span></p>
              <p>Default Password: <span className="font-bold bg-gray-100 px-1">Welcome@123</span></p>
            </div>

            <div className="space-y-4 pt-2">
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

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 z-50 shadow-lg">
        <div className="max-w-md mx-auto">
          <CustomButton type="button" variant={Variant.Filled} onClick={() => handleNext()} disabled={isSaving} className="w-full">
            {isSaving ? 'Saving...' : 'Next Step'}
          </CustomButton>
        </div>
      </div>
    </div>
  );
};

// Updated CheckboxRow to accept tooltip
const CheckboxRow = ({ id, label, checked, onChange, tooltip }: any) => (
  <div className="flex items-center h-6 cursor-pointer group">
    <input id={id} type="checkbox" className="h-4 w-4 mr-2 rounded text-sky-500 cursor-pointer" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <label htmlFor={id} className="text-gray-600 font-medium text-sm cursor-pointer flex-grow">{label}</label>
    {tooltip && <InfoTooltip text={tooltip} />}
  </div>
);

export default CatalogueRegistration3;