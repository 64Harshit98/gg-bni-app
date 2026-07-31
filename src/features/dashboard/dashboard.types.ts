export interface SmartMetric {
  name: string;
  amount: number;
  quantity: number;
}

export interface DashboardData {
  totalSales: number;
  totalOrders: number;
  percentageChange: number;
  salesByDate: {
    name: string;
    sales: number;
    previousSales: number;
    count: number;
    qty?: number;
    quantity?: number;
    bills?: number;
    Bills?: number;
  }[];
  paymentMethods: SmartMetric[];
  topItems: SmartMetric[];
  topCustomers: SmartMetric[];
  topSalesmen: SmartMetric[];
  lastUpdated: number;
  cacheStart?: string;
  cacheEnd?: string;
}
