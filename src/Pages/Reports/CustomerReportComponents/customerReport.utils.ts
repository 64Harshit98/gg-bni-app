export interface Sale {
  id: string;
  partyName: string;
  partyNumber: string;
  totalAmount: number;
  dueAmount?: number;
  creditNoteAmount?: number;
  createdAt: Date;
}

export interface CustomerRow {
  id?: string;
  customerName: string;
  customerNumber: string;
  totalBills: number;
  totalSales: number;
  totalDue: number;
  sortKey?: string;
}
