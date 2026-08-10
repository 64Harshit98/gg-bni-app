import React, { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import { getDefaultShopHoursSettings, type ShopHoursSettings } from '../hooks/useShopHours';
import { Spinner } from '../../constants/Spinner';

// ---------------------------------------------------------------------------
// Toggle Switch
// ---------------------------------------------------------------------------
interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  activeColor?: string;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ checked, onChange, activeColor = 'bg-blue-600' }) => (
  <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="sr-only"
    />
    <div
      className={`w-11 h-6 rounded-full transition-colors duration-200 ${checked ? activeColor : 'bg-gray-300'
        }`}
    >
      <div
        className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'
          }`}
      />
    </div>
  </label>
);

// ---------------------------------------------------------------------------
// Status Pill
// ---------------------------------------------------------------------------
const StatusPill: React.FC<{ enabled: boolean }> = ({ enabled }) => (
  <span
    className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-sm ${enabled
        ? 'bg-green-100 text-green-700'
        : 'bg-gray-100 text-gray-500'
      }`}
  >
    <span className={`w-1.5 h-1.5 rounded-sm ${enabled ? 'bg-green-500' : 'bg-gray-400'}`} />
    {enabled ? 'Active' : 'Disabled'}
  </span>
);

// ---------------------------------------------------------------------------
// Success Banner
// ---------------------------------------------------------------------------
const SuccessBanner: React.FC = () => (
  <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-sm px-3.5 py-2.5 mb-3">
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
    Settings saved successfully.
  </div>
);

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
interface ShopHoursSettingPageProps {
  theme?: 'blue' | 'orange';
}


const ShopHoursSettingPage: React.FC<ShopHoursSettingPageProps> = ({ theme = 'blue' }) => {
  const { currentUser } = useAuth();
  const accent = theme === 'orange'
    ? 'bg-[#F97316] hover:bg-orange-600 focus:ring-orange-400'
    : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500';
  const focusRing = theme === 'orange' ? 'focus:ring-[#F97316]' : 'focus:ring-blue-500';
  const toggleColor = theme === 'orange' ? 'bg-[#F97316]' : 'bg-blue-600';
  const [settings, setSettings] = useState<ShopHoursSettings>(getDefaultShopHoursSettings());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!currentUser?.companyId) return;
      try {
        const ref = doc(db, 'companies', currentUser.companyId, 'settings', 'shop-hours');
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setSettings(snap.data() as ShopHoursSettings);
        }
      } catch (err) {
        console.error('Failed to load shop-hours settings', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [currentUser?.companyId]);

  const handleSave = async () => {
    if (!currentUser?.companyId) return;
    setSaving(true);
    setSaved(false);
    try {
      const ref = doc(db, 'companies', currentUser.companyId, 'settings', 'shop-hours');
      await setDoc(ref, settings, { merge: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save shop-hours settings', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-40">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-6">

      {/* subtitle only — title is in modal header */}
      <div className="mb-4">
        <p className="text-sm text-gray-500">Control when your team can access the system</p>
      </div>

      {/* Toggle + Time Inputs Card */}
      <div className="bg-white border border-gray-200 rounded-sm p-5 mb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900 mb-0.5">Enable shop hours lock</p>
            <p className="text-sm text-gray-500 leading-relaxed">
              When enabled, salespeople and managers can only log in during these hours.
            </p>
          </div>
          <ToggleSwitch
            checked={settings.enabled}
            onChange={(checked) => setSettings((s) => ({ ...s, enabled: checked }))}
            activeColor={toggleColor}
          />
        </div>

        <hr className="border-t border-gray-100 my-4" />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">
              Opening time
            </label>
            <input
              type="time"
              value={settings.openTime}
              onChange={(e) => setSettings((s) => ({ ...s, openTime: e.target.value }))}
              disabled={!settings.enabled}
              className={`w-full text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-sm px-3 py-2 outline-none focus:ring-1 disabled:opacity-40 disabled:cursor-not-allowed transition ${focusRing}`}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">
              Closing time
            </label>
            <input
              type="time"
              value={settings.closeTime}
              onChange={(e) => setSettings((s) => ({ ...s, closeTime: e.target.value }))}
              disabled={!settings.enabled}
              className="w-full text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-sm px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition"
            />
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3 leading-relaxed">
          A reminder will pop up at closing time, and again every 15 minutes if snoozed. If no action is taken, the shop will lock automatically after 1 hour.
        </p>
      </div>

      {/* Status Card */}
      <div className="bg-white border border-gray-200 rounded-sm px-5 py-3 mb-3 flex items-center justify-between">
        <span className="text-sm text-gray-500">Current status</span>
        <StatusPill enabled={settings.enabled} />
      </div>

      {/* Success Banner */}
      {saved && <SuccessBanner />}

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className={`w-full h-11 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-sm flex items-center justify-center gap-2 transition ${accent}`}
      >
        {saving ? <Spinner /> : 'Save settings'}
      </button>
    </div>
  );
};

export default ShopHoursSettingPage;