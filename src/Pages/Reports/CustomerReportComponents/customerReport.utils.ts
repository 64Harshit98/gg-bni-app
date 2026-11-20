import { isWalkIn, type SaleRecord } from '../SalesReportComponents/salesReport.utils';
import type { CustomerRemark, NewCustomerRecord, OpeningBalanceRecord } from './customerReportCache';
import { customerBelongsTo } from '../../../constants/customerSource';
import { groupPhones, resolvePhone, type AliasMap } from './customerAliases';

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
  /** Main (primary) number. Merged customer me primary hi row ki key hai. */
  phone: string;
  /** Primary + uske saare merged numbers. Merge nahi hai to sirf [phone]. */
  phones: string[];
  bills: number;
  sales: number;
  due: number;
  dueEntries: DueEntry[];
  /** Some of the due is an opening balance. */
  hasOpeningDue: boolean;
  lastVisit: number;
  creditNote: number;
  recentBills: CustomerBill[];
  /** Personal remark from the payment drawer, '' when there is none. */
  remark: string;
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
  remarks = [],
  aliases = {},
}: {
  sales: SaleRecord[];
  openingBalances: OpeningBalanceRecord[];
  newCustomers: NewCustomerRecord[];
  credits: { name: string; number: string; creditBalance: number }[];
    remarks?: CustomerRemark[];
  aliases?: AliasMap;
}): CustomerSummaryRow[] => {
  const map = new Map<string, CustomerSummaryRow>();

    const rowFor = (name: string, number: string) => {
    const phone = resolvePhone(aliases, phoneDigits(number));
    const key = customerKey(name, phone);
    let row = map.get(key);
    if (!row) {
      row = {
        key,
        name: '',
        phone,
        phones: phone ? groupPhones(aliases, phone) : [],
        bills: 0,
        sales: 0,
        due: 0,
        dueEntries: [],
        hasOpeningDue: false,
        lastVisit: 0,
        creditNote: 0,
        recentBills: [],
        remark: '',
      };
      map.set(key, row);
    }
    // Any entry that carries a real name names the whole row.
    if (!row.name && hasRealName(name)) row.name = name.trim();
    return row;
  };

  // Customers added in the range stay listed even with no bills — POS customers only
  // (catalogue customers live in the same collection).
  newCustomers.forEach((c) => {
    if (!c.name && !phoneDigits(c.number)) return;
    if (!customerBelongsTo('pos', c)) return;
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
    .filter((ob) => ob.balanceType === 'due' && ob.dueAmount > 0 && ob.source !== 'catalogue' && ob.partyType !== 'Supplier')
    .forEach((ob) => {
      const row = rowFor(ob.partyName, ob.partyNumber);
      row.due += ob.dueAmount;
      row.hasOpeningDue = true;
      row.lastVisit = Math.max(row.lastVisit, ob.createdAt);
      row.dueEntries.push({ label: 'Opening Due', amount: ob.dueAmount, date: ob.createdAt, isOpeningBalance: true });
    });

    const creditByKey = new Map<string, number>();
  credits.forEach((c) => {
    const digits = resolvePhone(aliases, phoneDigits(c.number));
    // Merged numbers ka credit add hota hai (overwrite nahi)
    if (digits) creditByKey.set(`p:${digits}`, (creditByKey.get(`p:${digits}`) || 0) + c.creditBalance);
    if (c.name) creditByKey.set(`n:${c.name.toLowerCase()}`, c.creditBalance);
  });

  // Same key as the row, so a remark never reaches another customer who merely
  // shares the name: a name only matches for customers without a phone.
  // Merged numbers ke remarks " · " se judte hain, primary ka remark pehle.
  const remarkByKey = new Map<string, string>();
  [...remarks]
    .sort((a, b) => {
      const aPrimary = phoneDigits(a.number) === resolvePhone(aliases, phoneDigits(a.number)) ? 0 : 1;
      const bPrimary = phoneDigits(b.number) === resolvePhone(aliases, phoneDigits(b.number)) ? 0 : 1;
      return aPrimary - bPrimary;
    })
    .forEach((r) => {
      if (!r.remark) return;
      const key = customerKey(r.name, resolvePhone(aliases, phoneDigits(r.number)));
      const prev = remarkByKey.get(key);
      if (!prev) remarkByKey.set(key, r.remark);
      else if (!prev.includes(r.remark)) remarkByKey.set(key, `${prev} · ${r.remark}`);
    });

  return [...map.values()].map((row) => ({
    ...row,
    remark: remarkByKey.get(row.key) || '',
    creditNote:
      creditByKey.get(row.phone ? `p:${row.phone}` : '') ??
      creditByKey.get(row.name ? `n:${row.name.toLowerCase()}` : '') ??
      0,
    recentBills: row.recentBills.sort((a, b) => b.date - a.date),
  }));
};
