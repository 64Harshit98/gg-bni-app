import { useEffect, useState } from 'react';

import { useAuth } from '../../context/auth-context';
import { getDefaultShopHoursSettings, type ShopHoursSettings } from '../hooks/useShopHours';
import { fetchShopHoursSettings, saveShopHoursSettings } from '../../services/settings/shopHoursSetting.service';
import { Spinner } from '../../Components/ui/spinner';
import { Button } from '../../Components/ui/button';
import { Input } from '../../Components/ui/input';
import { Label } from '../../Components/ui/label';
import { Badge } from '../../Components/ui/badge';
import { toast } from '../../lib/toast';
import { SettingsToggleRow } from './components/SettingsToggleRow';

interface ShopHoursSettingPageProps {
  /**
   * Retained for prop-shape/backward compatibility only (callers in
   * CatalogueMasters.tsx / Masters.tsx pass `theme="orange"` / omit it) —
   * the shared design system now supplies all colors, so it no longer
   * changes styling here. Mirrors the same pattern used for `theme` in
   * `Pages/Master/ItemGroup.tsx`.
   */
  theme?: 'blue' | 'orange';
}

const ShopHoursSettingPage = ({ theme }: ShopHoursSettingPageProps) => {
  void theme;
  const { currentUser } = useAuth();
  const [settings, setSettings] = useState<ShopHoursSettings>(getDefaultShopHoursSettings());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!currentUser?.companyId) {
        setLoading(false);
        return;
      }
      try {
        const data = await fetchShopHoursSettings(currentUser.companyId);
        if (data) setSettings(data);
      } catch {
        toast.error('Failed to load shop hours settings.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [currentUser?.companyId]);

  const handleSave = async () => {
    if (!currentUser?.companyId) return;
    setSaving(true);
    try {
      await saveShopHoursSettings(currentUser.companyId, settings);
      toast.success('Shop hours saved.');
    } catch {
      toast.error('Failed to save shop hours settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <p className="mb-4 text-sm text-muted-foreground">Control when your team can access the system</p>

      {/* Toggle + Time Inputs Card */}
      <div className="mb-3 space-y-4 rounded-2xl border border-border bg-card p-5">
        <SettingsToggleRow
          id="shop-hours-enabled"
          label="Enable shop hours lock"
          description="When enabled, salespeople and managers can only log in during these hours."
          checked={settings.enabled}
          onChange={(checked) => setSettings((s) => ({ ...s, enabled: checked }))}
        />

        <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
          <div>
            <Label htmlFor="open-time" className="mb-1.5 block text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Opening time
            </Label>
            <Input
              id="open-time"
              type="time"
              value={settings.openTime}
              onChange={(e) => setSettings((s) => ({ ...s, openTime: e.target.value }))}
              disabled={!settings.enabled}
            />
          </div>
          <div>
            <Label htmlFor="close-time" className="mb-1.5 block text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Closing time
            </Label>
            <Input
              id="close-time"
              type="time"
              value={settings.closeTime}
              onChange={(e) => setSettings((s) => ({ ...s, closeTime: e.target.value }))}
              disabled={!settings.enabled}
            />
          </div>
        </div>
      </div>

      {/* Status Card */}
      <div className="mb-3 flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-3">
        <span className="text-sm text-muted-foreground">Current status</span>
        <Badge variant={settings.enabled ? 'success' : 'secondary'}>
          {settings.enabled ? 'Active' : 'Disabled'}
        </Badge>
      </div>

      {/* Save Button */}
      <Button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="h-11 w-full gap-2 bg-gradient-brand text-white shadow-md shadow-primary/25 hover:opacity-90"
      >
        {saving ? <Spinner size="sm" /> : null}
        Save settings
      </Button>
    </div>
  );
};

export default ShopHoursSettingPage;
