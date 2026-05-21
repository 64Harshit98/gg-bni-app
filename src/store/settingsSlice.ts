import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { SalesSettings } from '../Pages/Settings/SalesSetting';
import type { PurchaseSettings } from '../Pages/Settings/Purchasesetting';
import type { ItemSettings } from '../Pages/Settings/ItemSetting';
import type { RootState } from './store';

export interface SettingsState {
  salesSettings: SalesSettings | null;
  purchaseSettings: PurchaseSettings | null;
  itemSettings: ItemSettings | null;
  loadingSales: boolean;
  loadingPurchase: boolean;
  loadingItem: boolean;
}

const initialState: SettingsState = {
  salesSettings: null,
  purchaseSettings: null,
  itemSettings: null,
  loadingSales: true,
  loadingPurchase: true,
  loadingItem: true,
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setSalesSettings(state, action: PayloadAction<SalesSettings>) {
      state.salesSettings = action.payload;
      state.loadingSales = false;
    },
    setPurchaseSettings(state, action: PayloadAction<PurchaseSettings>) {
      state.purchaseSettings = action.payload;
      state.loadingPurchase = false;
    },
    setItemSettings(state, action: PayloadAction<ItemSettings>) {
      state.itemSettings = action.payload;
      state.loadingItem = false;
    },
    clearSettings(state) {
      state.salesSettings = null;
      state.purchaseSettings = null;
      state.itemSettings = null;
      state.loadingSales = true;
      state.loadingPurchase = true;
      state.loadingItem = true;
    },
  },
});

export const {
  setSalesSettings,
  setPurchaseSettings,
  setItemSettings,
  clearSettings,
} = settingsSlice.actions;
export default settingsSlice.reducer;

// Selectors
export const selectSalesSettings = (state: RootState) => state.settings.salesSettings;
export const selectPurchaseSettings = (state: RootState) => state.settings.purchaseSettings;
export const selectItemSettings = (state: RootState) => state.settings.itemSettings;
export const selectIsLoadingSettings = (state: RootState) =>
  state.settings.loadingSales || state.settings.loadingPurchase || state.settings.loadingItem;
