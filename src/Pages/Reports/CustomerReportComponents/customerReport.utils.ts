export interface Sale {
  id: string;
  partyName: string;
  partyNumber: string;
  totalAmount: number;
  dueAmount?: number;
  createdAt: Date;
  returnHistory?: any[];
  creditNoteRemaining?: number;
  paymentMethods?: { [key: string]: number; };
}

export interface CustomerRow {
  id?: string;
  customerName: string;
  customerNumber: string;
  totalBills: number;
  totalSales: number;
  totalDue: number;
  sortKey?: string;
  creditNoteAmount: number;
}
