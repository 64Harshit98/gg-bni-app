export enum Permissions {

    // Dashboard
    ViewDashboard = 'ViewDashboard',
    ViewHidebutton = 'ViewHidebutton',
    ViewFilter = 'ViewFilter',
    ViewSalescard = 'ViewSalescard',
    ViewSalesbarchart = 'ViewSalesbarchart',
    ViewPaymentmethods = 'ViewPaymentmethods',
    ViewTopSoldItems = 'ViewTopSoldItems',
    ViewTopSalesperson = 'ViewTopSalesperson',
    ViewTopCustomers = 'ViewTopCustomers',
    ViewAttendance = 'ViewAttendance',
    Viewrestockcard = 'Viewrestockcard',
    ViewCatalogue = 'ViewCatalogue',
    // Transactions
    ViewTransactions = 'ViewTransactions',
    ViewPurchaseTransactions = 'ViewPurchaseTransactions',
    ViewFilterbutton = 'ViewFilterbutton',
    ViewEditReturn = 'ViewEditReturn',
    // Reports
    ViewReports = 'ViewReports',
    ViewItemReport = 'ViewItemReport',
    ViewSalesReport = 'ViewSalesReport',
    ViewPurchaseReport = 'ViewPurchaseReport',
    ViewPNLReport = 'ViewPNLReport',
    ViewDownloadPDF = 'ViewDownloadPDF',
    // Settings
    ChangeViewtype = 'ChangeViewtype',
    SalesmanwiseBilling = 'SalesmanwiseBilling',
    RoundingOff = 'RoundingOff',
    ItemwiseDiscount = 'ItemwiseDiscount',
    LockDiscountPrice = 'Lockdiscountprice',
    AllownegativeStock = 'AllownegativeStock',
    AllowDueBilling = 'AllowDueBilling',
    // Core Actions
    CreateSales = 'CreateSales',
    CreateSalesReturn = 'CreateSalesReturn',
    CreatePurchase = 'CreatePurchase',
    PurchaseTaxtype = 'PurchaseTaxtype',
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
}
