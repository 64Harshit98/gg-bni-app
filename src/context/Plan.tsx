import { Permissions, PLANS } from '../enums';

const PRO_EXCLUDED_PERMISSIONS: Permissions[] = [
    Permissions.ViewCatalogue
];

export const normalizePlan = (rawPlan: string | undefined | null): PLANS => {
    if (!rawPlan) return PLANS.POS_BASIC;

    const normalized = rawPlan.toLowerCase().trim();

    // 1. DIRECT MAPPING FOR LEGACY STRINGS
    if (normalized === 'basic') return PLANS.POS_BASIC;
    if (normalized === 'pro') return PLANS.POS_PRO;

    // Fix for your Enterprise issue:
    // If DB says "enterprise" but Enum says "pos_enterprise" or similar
    if (normalized === 'enterprise') return PLANS.ENTERPRISE;

    // 2. CHECK AGAINST ENUM VALUES
    const planValues = Object.values(PLANS) as string[];
    if (planValues.includes(normalized)) {
        return normalized as PLANS;
    }

    return PLANS.POS_BASIC;
};

export const PACK_LIMITS: Record<PLANS, Permissions[]> = {
    [PLANS.POS_BASIC]: [
        Permissions.ViewDashboard,
        Permissions.ViewSalescard,
        Permissions.ManageEditProfile,
        Permissions.CreateSales,
        Permissions.ViewTransactions,
        Permissions.ViewHidebutton,
        Permissions.ViewFilter,
        Permissions.ViewSalesbarchart,
        Permissions.ViewPaymentmethods,
        Permissions.ViewReports,
        Permissions.ViewSalesReport,
        Permissions.CreateUsers,
        Permissions.ManageUsers
    ],
    [PLANS.CALC_CATALOG]: [
        Permissions.ViewDashboard,
        Permissions.ViewSalescard,
        Permissions.ManageEditProfile,
        Permissions.CreateSales,
        Permissions.ViewTransactions,
        Permissions.ViewHidebutton,
        Permissions.ViewFilter,
        Permissions.ViewSalesbarchart,
        Permissions.ViewPaymentmethods,
        Permissions.ViewReports,
        Permissions.ViewSalesReport,
        Permissions.CreateUsers,
        Permissions.ViewCatalogue
    ],
    [PLANS.POS_PRO]: Object.values(Permissions).filter(
        (p) => !PRO_EXCLUDED_PERMISSIONS.includes(p)
    ),
    [PLANS.CATALOGUE_PRO]: [],
    [PLANS.ENTERPRISE]: Object.values(Permissions)
};

export const getPackPermissions = (packName: string): Permissions[] => {
    const validPlan = normalizePlan(packName);
    return PACK_LIMITS[validPlan];
};
