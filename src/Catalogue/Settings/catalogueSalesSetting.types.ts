/**
 * Shared types/defaults for the Catalogue Sales Settings page. Split out of
 * `CatalogueSalesSetting.tsx` so the settings shape can be imported (by
 * `AuthContext`, `SettingsContext`, product/shop pages, and the service
 * layer) without pulling in the page component itself.
 */
export interface CatalogueSalesSettings {
  companyId: string;
  settingType: 'catalogueSales';
  allowNegativeInventory: boolean;
  enableOutOfStockNotification: boolean;
  priceDisplayMode: 'mrp' | 'salePrice' | 'both';
  showDiscountBadge: boolean;
  defaultCartQuantity: number;
  allowQuantityDecreaseToZero: boolean;
  enableLeadPopup: boolean;
  minimumOrderValue: number;
  voucherPrefix?: string;
  currentVoucherNumber?: number;
  copyVoucherAfterSaving?: boolean;
  gstScheme?: 'regular' | 'composition' | 'none';
  taxType?: 'inclusive' | 'exclusive';
  lockTaxToggle?: boolean;
  enableRounding?: boolean;
  roundingInterval?: number;
  enforceExactMRP?: boolean;
  hidePrice?: boolean;
  cartInsertionOrder?: 'top' | 'bottom';
  requireApproval: boolean;
  enableItemWiseDiscount?: boolean;
  enableDiscount2?: boolean;
  hideOutOfStock?: boolean;
  enableTransportDetails?: boolean;
}

export const getDefaultCatalogueSalesSettings = (companyId: string): CatalogueSalesSettings => ({
  companyId,
  settingType: 'catalogueSales',
  allowNegativeInventory: true,
  enableOutOfStockNotification: false,
  priceDisplayMode: 'both',
  showDiscountBadge: true,
  defaultCartQuantity: 1,
  allowQuantityDecreaseToZero: false,
  enableLeadPopup: false,
  minimumOrderValue: 0,
  voucherPrefix: 'ORD-',
  currentVoucherNumber: 1,
  copyVoucherAfterSaving: false,
  gstScheme: 'none',
  taxType: 'inclusive',
  lockTaxToggle: false,
  enableRounding: true,
  roundingInterval: 1,
  enforceExactMRP: false,
  hidePrice: false,
  cartInsertionOrder: 'top',
  requireApproval: false,
  enableItemWiseDiscount: false,
  enableDiscount2: false,
  hideOutOfStock: false,
  enableTransportDetails: false,
});
