// 1. Define all possible permissions as an enum

export enum Permissions {
    // Dashboard & Reporting
    ViewDashboard = 'ViewDashboard',
    ViewItemReport = 'ViewItemReport',
    ViewSalesReport = 'ViewSalesReport',
    ViewPurchaseReport = 'ViewPurchaseReport',
    ViewPNLReport = 'ViewPNLReport',
    // Core Actions
    CreateSales = 'CreateSales',
    CreateSalesReturn = 'CreateSalesReturn',
    CreatePurchase = 'CreatePurchase',
    CreatePurchaseReturn = 'CreatePurchaseReturn',
    ManagePayments = 'ManagePayments',

    // Inventory & User Management
    ManageItemGroup = 'ManageItemGroup',
    ManageItems = 'ManageItems',
    ManageUsers = 'ManageUsers',
    ManageEditProfile = 'ManageEditProfile',
    CreateUsers = 'CreateUsers',

    // General Access
    ViewTransactions = 'ViewTransactions',
    SetPermissions = 'SetPermissions',
}
