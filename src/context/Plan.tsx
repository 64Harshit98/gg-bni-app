// src/config/subscriptionPlans.ts
import { Permissions } from '../enums';
import { PLANS} from '../enums';
// 2. The Limits (What each pack allows)
export const PACK_LIMITS: Record<PLANS, Permissions[]> = {
    [PLANS.BASIC]: [
        Permissions.ViewDashboard,
        Permissions.ViewSalescard,
        Permissions.ManageEditProfile,
        Permissions.ManageItems,
        Permissions.CreateSales,
    ],
    [PLANS.PRO]: [
        Permissions.ViewDashboard,
        Permissions.ViewAttendance,
        Permissions.ViewSalescard,
        Permissions.ViewTopSoldItems,
        Permissions.ViewTopSalesperson,
        Permissions.ViewSalesbarchart,
        Permissions.ViewItemReport,
        Permissions.ViewSalesReport,
        Permissions.ViewPurchaseReport,
        Permissions.ViewPNLReport,
        Permissions.Viewrestockcard,
        Permissions.ViewTransactions,
        Permissions.CreateSales,
        Permissions.CreateSalesReturn,
        Permissions.CreatePurchase,
        Permissions.CreatePurchaseReturn,
        Permissions.PrintQR,
        Permissions.ManageItemGroup,
        Permissions.ManageItems,
        Permissions.ManageUsers,
        Permissions.ManageEditProfile,
        Permissions.CreateUsers,
        Permissions.SetPermissions,
    ],
    [PLANS.ENTERPRISE]: Object.values(Permissions) // All Access
};

// 3. Helper to get allowed permissions based on pack
export const getPackPermissions = (packName: string): Permissions[] => {
    // Default to FREE if pack is unknown
    const pack = Object.values(PLANS).includes(packName as PLANS) 
        ? (packName as PLANS) 
        : PLANS.PRO;
    
    return PACK_LIMITS[pack];
};