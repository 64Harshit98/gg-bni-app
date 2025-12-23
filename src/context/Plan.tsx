// src/config/subscriptionPlans.ts
import { Permissions, PLANS } from '../enums';

// 1. Define what is NOT allowed in Pro (The Excluded List)
const PRO_EXCLUDED_PERMISSIONS: Permissions[] = [
    Permissions.ViewCatalogue      // Example: Only Enterprise can delete company
    // Example: Only Enterprise can manage other admins
    // Add any other permissions you want to restrict from Pro here
];

// 2. The Limits
export const PACK_LIMITS: Record<PLANS, Permissions[]> = {

    // BASIC: Keep using the "Whitelist" approach (Define exactly what they CAN do)
    [PLANS.BASIC]: [
        Permissions.ViewDashboard,
        Permissions.ViewSalescard,
        Permissions.ManageEditProfile,
        Permissions.ManageItems,
        Permissions.CreateSales,
    ],

    // PRO: Use "Blacklist" approach (All Permissions MINUS the excluded ones)
    [PLANS.PRO]: Object.values(Permissions).filter(
        (permission) => !PRO_EXCLUDED_PERMISSIONS.includes(permission)
    ),

    // ENTERPRISE: All Permissions
    [PLANS.ENTERPRISE]: Object.values(Permissions)
};

// 3. Helper to get allowed permissions based on pack
export const getPackPermissions = (packName: string): Permissions[] => {
    // Default to PRO if pack is unknown (as per your previous logic)
    const pack = Object.values(PLANS).includes(packName as PLANS)
        ? (packName as PLANS)
        : PLANS.PRO;

    return PACK_LIMITS[pack];
};