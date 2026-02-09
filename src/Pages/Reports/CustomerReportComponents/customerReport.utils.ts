export interface Sale {
  id: string;
  partyName: string;
  totalAmount: number;
  dueAmount?: number;
  createdAt: Date;
}

export interface CustomerRow {
  customerName: string;
  totalBills: number;
  totalSales: number;
  totalDue: number;
}
