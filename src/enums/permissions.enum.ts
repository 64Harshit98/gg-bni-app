export enum Permissions {
    // Dashboard & Reporting
    ViewDashboard = 'ViewDashboard',
    ViewAttendance = 'ViewAttendance',
    ViewSalescard = 'ViewSalescard',
    ViewTopSoldItems = 'ViewTopSoldItems',
    ViewTopSalesperson = 'ViewTopSalesperson',
    ViewSalesbarchart = 'ViewSalesbarchart',
    ViewItemReport = 'ViewItemReport',
    ViewSalesReport = 'ViewSalesReport',
    ViewPurchaseReport = 'ViewPurchaseReport',
    ViewPNLReport = 'ViewPNLReport',
    Viewrestockcard = 'Viewrestockcard',
    ViewTransactions = 'ViewTransactions',
    // Core Actions
    CreateSales = 'CreateSales',
    CreateSalesReturn = 'CreateSalesReturn',
    CreatePurchase = 'CreatePurchase',
    CreatePurchaseReturn = 'CreatePurchaseReturn',
    PrintQR = 'PrintQR',
    // Inventory & User Management
    ManageItemGroup = 'ManageItemGroup',
    ManageItems = 'ManageItems',
    ManageUsers = 'ManageUsers',
    ManageEditProfile = 'ManageEditProfile',
    CreateUsers = 'CreateUsers',
    // General Access
    SetPermissions = 'SetPermissions',
    ViewCatalogue = 'ViewCatalogue',
}
