import type { SalesItem as OriginalSalesItem } from '../../../constants/models';

export interface SalesItem extends OriginalSalesItem {
    isEditable: boolean;
    customPrice?: number | string;
    taxableAmount?: number;
    taxAmount?: number;
    taxRate?: number;
    taxType?: 'inclusive' | 'exclusive' | 'none';
    purchasePrice: number;
    tax: number;
    itemGroupId: string;
    salesPrice: number;
    stock: number;
    amount: number;
    barcode: string;
    restockQuantity: number;
    productId: string;
    unit?: string;
    unitMultiplier?: number;
    packetSize?: number | undefined;
    isCustomAmount?: boolean;
    isStagedCalcItem?: boolean;
}

export interface CalcKey {
    label: string;
    value: string;
    type: 'number' | 'operator' | 'function';
    icon?: React.ElementType;
    colClass?: string;
}