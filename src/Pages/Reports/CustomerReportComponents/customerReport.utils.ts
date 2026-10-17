import { isWalkIn, type SaleRecord } from '../SalesReportComponents/salesReport.utils';
import type { NewCustomerRecord, OpeningBalanceRecord } from './customerReportCache';

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

/* ---------- CUSTOMER REPORT (new design) ---------- */

export interface DueEntry {
  label: string;
  amount: number;
  date: number;
  isOpeningBalance: boolean;
}

export interface CustomerBill {
  id: string;
  invoiceNumber: string;
  date: number;
  amount: number;
  due: number;
}

export interface CustomerSummaryRow {
  key: string;
  /** Real customer name, or '' when the bills carry only a phone number. */
  name: string;
  phone: string;
  bills: number;
  sales: number;
  due: number;
  dueEntries: DueEntry[];
  /** Some of the due is an opening balance. */
  hasOpeningDue: boolean;
  lastVisit: number;
  creditNote: number;
  recentBills: CustomerBill[];
}

export const phoneDigits = (value?: string) => {
  const digits = (value || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
};

const hasRealName = (name?: string) =>
  !isWalkIn({ partyName: name || '' } as SaleRecord);

export const customerKey = (name?: string, number?: string) => {
  const digits = phoneDigits(number);
  if (digits) return `p:${digits}`;
  if (hasRealName(name)) return `n:${(name || '').trim().toLowerCase()}`;
  return 'walkin';
};

export const displayCustomerName = (row: Pick<CustomerSummaryRow, 'name' | 'phone'>) =>
  row.name || (row.phone ? 'No name' : 'Walk-in');

// Due left on a bill — `paymentMethods.due` is the field payments keep current.
export const saleDue = (sale: SaleRecord) => {
  const pm = (sale.paymentMethods || {}) as Record<string, unknown>;
  if (pm.due !== undefined) return Math.max(0, Number(pm.due) || 0);
  if (sale.dueAmount) return Math.max(0, sale.dueAmount);
  return Object.entries(pm).reduce(
    (sum, [k, v]) => (k.toLowerCase().includes('due') ? sum + (Number(v) || 0) : sum),
    0,
  );
};

export const buildCustomerRows = ({
  sales,
  openingBalances,
  newCustomers,
  credits,
}: {
  sales: SaleRecord[];
  openingBalances: OpeningBalanceRecord[];
  newCustomers: NewCustomerRecord[];
  credits: { name: string; number: string; creditBalance: number }[];
}): CustomerSummaryRow[] => {
  const map = new Map<string, CustomerSummaryRow>();

  const rowFor = (name: string, number: string) => {
    const key = customerKey(name, number);
    let row = map.get(key);
    if (!row) {
      row = {
        key,
        name: '',
        phone: phoneDigits(number),
        bills: 0,
        sales: 0,
        due: 0,
        dueEntries: [],
        hasOpeningDue: false,
        lastVisit: 0,
        creditNote: 0,
        recentBills: [],
      };
      map.set(key, row);
    }
    // Any entry that carries a real name names the whole row.
    if (!row.name && hasRealName(name)) row.name = name.trim();
    return row;
  };

  // Customers added in the range stay listed even with no bills.
  newCustomers.forEach((c) => {
    if (!c.name && !phoneDigits(c.number)) return;
    const row = rowFor(c.name, c.number);
    row.lastVisit = Math.max(row.lastVisit, c.createdAt);
  });

  sales.forEach((sale) => {
    const row = rowFor(sale.partyName, sale.partyNumber || '');
    const due = saleDue(sale);
    row.bills += 1;
    row.sales += sale.totalAmount;
    row.lastVisit = Math.max(row.lastVisit, sale.createdAt);
    row.recentBills.push({
      id: sale.id,
      invoiceNumber: sale.invoiceNumber,
      date: sale.createdAt,
      amount: sale.totalAmount,
      due,
    });
    if (due > 0) {
      row.due += due;
      row.dueEntries.push({ label: sale.invoiceNumber, amount: due, date: sale.createdAt, isOpeningBalance: false });
    }
  });

  openingBalances
    .filter((ob) => ob.balanceType === 'due' && ob.dueAmount > 0)
    .forEach((ob) => {
      const row = rowFor(ob.partyName, ob.partyNumber);
      row.due += ob.dueAmount;
      row.hasOpeningDue = true;
      row.lastVisit = Math.max(row.lastVisit, ob.createdAt);
      row.dueEntries.push({ label: 'Opening Due', amount: ob.dueAmount, date: ob.createdAt, isOpeningBalance: true });
    });

  const creditByKey = new Map<string, number>();
  credits.forEach((c) => {
    const digits = phoneDigits(c.number);
    if (digits) creditByKey.set(`p:${digits}`, c.creditBalance);
    if (c.name) creditByKey.set(`n:${c.name.toLowerCase()}`, c.creditBalance);
  });

  return [...map.values()].map((row) => ({
    ...row,
    creditNote:
      creditByKey.get(row.phone ? `p:${row.phone}` : '') ??
      creditByKey.get(row.name ? `n:${row.name.toLowerCase()}` : '') ??
      0,
    recentBills: row.recentBills.sort((a, b) => b.date - a.date),
  }));
};
