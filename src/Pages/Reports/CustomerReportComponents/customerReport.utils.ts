export interface Sale {
  id: string;
  partyName: string;
  totalAmount: number;
  dueAmount?: number;
  createdAt: Date;
  partyNumber: string;
}

export interface CustomerRow {
  id: string;
  customerName: string;
  totalBills: number;
  totalSales: number;
  totalDue: number;
  customerNumber: string;
}
