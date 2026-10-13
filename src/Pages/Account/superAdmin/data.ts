import { collection, collectionGroup, getDocs } from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import { PLANS } from '../../../enums';
import { MAX_EXPIRY_YEARS_AHEAD } from '../superAdminExpiryGuard';

// Shared data + helpers for the super-admin pages. Company and payment data
// is cached for a short time so moving between pages (and the sidebar badges)
// doesn't refetch every company on each click.

export const DAY_MS = 24 * 60 * 60 * 1000;

// Mirrors PLAN_PRICING in functions/lib/index.js (yearly, pre-GST).
export const PLAN_PRICE_YEARLY: Record<string, number> = {
  [PLANS.POS_BASIC]: 999,
  [PLANS.POS_PRO]: 2999,
  [PLANS.CATALOGUE_PRO]: 4999,
  [PLANS.ENTERPRISE]: 7999,
};

export const PLAN_META: Record<string, { label: string; color: string }> = {
  [PLANS.POS_BASIC]: { label: 'POS_BASIC', color: 'bg-blue-300' },
  [PLANS.POS_PRO]: { label: 'POS_PRO', color: 'bg-blue-600' },
  [PLANS.CATALOGUE_PRO]: { label: 'CATALOGUE_PRO', color: 'bg-violet-500' },
  [PLANS.CALC_CATALOG]: { label: 'CALC_CATALOG', color: 'bg-teal-500' },
  [PLANS.ENTERPRISE]: { label: 'ENTERPRISE', color: 'bg-gray-900' },
};

// ─── Generic helpers ──────────────────────────────────────
export const toDate = (v: any): Date | null => {
  if (!v) return null;
  const d = v.toDate ? v.toDate() : new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

export const fmtDate = (d: Date | null | undefined) =>
  d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const fmtShortDate = (d: Date | null | undefined) =>
  d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—';

export const fmtDateTime = (d: Date | null | undefined) =>
  d ? d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

export const fmtMoney = (n: number) =>
  `₹${Math.round(n).toLocaleString('en-IN')}`;

export const daysUntil = (d: Date | null) => (d ? Math.ceil((d.getTime() - Date.now()) / DAY_MS) : null);

// "12 min", "3 hrs", "2 days"
export const ageText = (from: Date | null) => {
  if (!from) return '—';
  const ms = Date.now() - from.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${Math.max(min, 1)} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'}`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
};

export const planLabel = (pack: string) =>
  (PLAN_META[pack]?.label || pack || 'none').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

export const last10 = (phone?: string | null) => (phone || '').replace(/\D/g, '').slice(-10);

// wa.me needs a country code; assume India for bare 10-digit numbers.
export const waLink = (phone: string, text?: string) => {
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
};

export const csvEscape = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const downloadCsv = (filename: string, header: string[], rows: unknown[][]) => {
  const body = [header, ...rows].map(r => r.map(csvEscape).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([body], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// Calendar months, clamped to month end (31 Jan + 1M → 28/29 Feb).
export const addMonths = (base: Date, months: number) => {
  const d = new Date(base);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  d.setHours(23, 59, 59, 0);
  return d;
};

// Extensions start from today if the plan has already lapsed — same as the payment webhook.
export const extensionBase = (expiry: Date | null) => {
  const now = new Date();
  return expiry && expiry > now ? expiry : now;
};

// ─── Date ranges (Today / 7D / 30D / 90D / Custom) ───────
export type RangeKey = 'today' | '7d' | '30d' | '90d' | 'year' | 'all' | 'custom';

export interface DateRange { start: number; end: number }

export const rangeFor = (key: RangeKey, custom?: { from: string; to: string }): DateRange => {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  switch (key) {
    case 'today': break;
    case '7d': start.setDate(start.getDate() - 6); break;
    case '30d': start.setDate(start.getDate() - 29); break;
    case '90d': start.setDate(start.getDate() - 89); break;
    case 'year': start.setMonth(0, 1); break;
    case 'all': return { start: 0, end: end.getTime() };
    case 'custom': {
      const s = custom?.from ? new Date(custom.from) : new Date(0);
      const e = custom?.to ? new Date(custom.to) : new Date();
      s.setHours(0, 0, 0, 0);
      e.setHours(23, 59, 59, 999);
      return { start: s.getTime(), end: e.getTime() };
    }
  }
  return { start: start.getTime(), end: end.getTime() };
};

// The equally long window immediately before `r` — for "vs previous".
export const previousRange = (r: DateRange): DateRange => {
  const len = r.end - r.start;
  return { start: r.start - len - 1, end: r.start - 1 };
};

export const inRange = (d: Date | null, r: DateRange) => !!d && d.getTime() >= r.start && d.getTime() <= r.end;

// ─── Companies ────────────────────────────────────────────
export interface AdminCompany {
  id: string;
  name: string;
  ownerUid: string | null;
  ownerName: string;
  email: string;
  phone: string;
  pack: string;
  validity: 'active' | 'inactive';
  isTrial: boolean;
  isTestAccount: boolean;
  expiry: Date | null;
  createdAt: Date | null;
  referrerId: string | null;
  referralCode: string | null;
  referralType: string | null;
  referralCredits: number;
  lastRenewalReminderAt: Date | null;
}

export type CompanyStatus = 'active' | 'expiring' | 'expired' | 'check_date';

export const companyStatus = (c: AdminCompany): CompanyStatus => {
  const days = daysUntil(c.expiry);
  if (days === null || days < 0) return 'expired';
  if (days > 365 * MAX_EXPIRY_YEARS_AHEAD) return 'check_date';
  if (days <= 7) return 'expiring';
  return 'active';
};

export const COMPANY_STATUS_META: Record<CompanyStatus, { label: string; cls: string }> = {
  active: { label: 'ACTIVE', cls: 'bg-green-100 text-green-700' },
  expiring: { label: 'EXPIRING', cls: 'bg-amber-100 text-amber-700' },
  expired: { label: 'EXPIRED', cls: 'bg-red-100 text-red-700' },
  check_date: { label: 'CHECK DATE', cls: 'bg-purple-100 text-purple-700' },
};

export const looksLikeTest = (c: AdminCompany) => !c.isTestAccount && /\btest/i.test(c.name);

// A company counts as paying when it's past its trial and its plan is live.
export const isPaying = (c: AdminCompany) => !c.isTrial && companyStatus(c) !== 'expired';

// ─── Payments ─────────────────────────────────────────────
export interface PaidOrder {
  id: string;
  companyId: string;
  planId: string;
  baseAmount: number;
  discountAmount: number;
  taxAmount: number;
  finalAmount: number;
  couponCode: string | null;
  paidAt: Date | null;
}

// ─── Cached loaders ───────────────────────────────────────
const CACHE_MS = 60_000;
const cache: Record<string, { at: number; promise: Promise<any> }> = {};

const cached = <T,>(key: string, load: () => Promise<T>, force = false): Promise<T> => {
  const hit = cache[key];
  if (!force && hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
  const promise = load().catch(err => { delete cache[key]; throw err; });
  cache[key] = { at: Date.now(), promise };
  return promise;
};

export const invalidateAdminCache = (key?: 'companies' | 'orders') => {
  if (key) delete cache[key];
  else Object.keys(cache).forEach(k => delete cache[k]);
};

export const loadCompanies = (force = false) => cached<AdminCompany[]>('companies', async () => {
  const map = new Map<string, AdminCompany>();
  const snap = await getDocs(collection(db, 'companies'));
  snap.forEach(d => {
    const data = d.data();
    const ref = data.referralDetails || {};
    map.set(d.id, {
      id: d.id,
      name: data.name || 'Unknown Company',
      ownerUid: data.ownerUID || null,
      ownerName: '',
      email: '',
      phone: data.ownerPhoneNumber || '',
      pack: data.pack || '',
      validity: data.validity || 'inactive',
      isTrial: !!data.isTrial,
      isTestAccount: !!data.isTestAccount,
      expiry: toDate(data.expiryDate),
      createdAt: toDate(data.createdAt),
      referrerId: ref.referrerId || null,
      referralCode: ref.code || null,
      referralType: ref.type || ref.referrerType || null,
      referralCredits: data.referralCredits || 0,
      lastRenewalReminderAt: toDate(data.lastRenewalReminderAt),
    });
  });

  // Owner contact details live on the owner's user doc.
  const users = await getDocs(collectionGroup(db, 'users'));
  users.forEach(u => {
    const data = u.data();
    if (data.role !== 'Owner' && data.role !== 'owner') return;
    const compId = data.companyId || u.ref.parent.parent?.id;
    const c = compId ? map.get(compId) : undefined;
    if (!c) return;
    if (data.name) c.ownerName = data.name;
    if (data.email) c.email = data.email;
    if (data.phoneNumber) c.phone = data.phoneNumber;
  });

  return Array.from(map.values());
}, force);

export const loadPaidOrders = (force = false) => cached<PaidOrder[]>('orders', async () => {
  const snap = await getDocs(collection(db, 'paymentOrders'));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as any))
    .filter(o => o.status === 'paid')
    .map(o => ({
      id: o.id,
      companyId: o.companyId || o.targetDocId,
      planId: o.planId || '',
      baseAmount: Number(o.baseAmount) || 0,
      discountAmount: Number(o.discountAmount) || 0,
      taxAmount: Number(o.taxAmount) || 0,
      finalAmount: Number(o.finalAmount) || 0,
      couponCode: o.couponCode || null,
      paidAt: toDate(o.paidAt) || toDate(o.createdAt),
    }));
}, force);

// Estimated MRR: each paying company's most recent paid order, net of
// discount and before GST, spread over 12 months. Falls back to list price
// for paying companies with no order on record (e.g. manually activated).
export const estimateMrr = (companies: AdminCompany[], orders: PaidOrder[]) => {
  const lastOrder = new Map<string, PaidOrder>();
  orders.forEach(o => {
    const prev = lastOrder.get(o.companyId);
    if (!prev || (o.paidAt?.getTime() ?? 0) > (prev.paidAt?.getTime() ?? 0)) lastOrder.set(o.companyId, o);
  });
  let fromOrders = 0;
  let fromListPrice = 0;
  companies.filter(c => !c.isTestAccount && isPaying(c)).forEach(c => {
    const o = lastOrder.get(c.id);
    if (o) fromOrders += (o.baseAmount - o.discountAmount) / 12;
    else fromListPrice += (PLAN_PRICE_YEARLY[c.pack] || 0) / 12;
  });
  return { total: fromOrders + fromListPrice, fromOrders, fromListPrice };
};

// ─── App registration leads ───────────────────────────────
// Signup writes leads/{email} at two points: after the account form
// (currentStep "Step 2: Business Info") and after business details
// ("Completed"), which also starts the free trial. Paid is inferred from the
// company the lead became.
export type LeadStage = 'details' | 'trial' | 'trial_ended' | 'paid';

export const LEAD_STAGE_META: Record<LeadStage, { label: string; step: number }> = {
  details: { label: 'Business details', step: 1 },
  trial: { label: 'On trial', step: 2 },
  trial_ended: { label: 'Trial ended', step: 2 },
  paid: { label: 'Paid', step: 3 },
};

export type LeadSalesStatus = 'new' | 'contacted' | 'follow_up' | 'issue' | 'converted' | 'not_interested';

export const LEAD_SALES_META: Record<LeadSalesStatus, { label: string; cls: string }> = {
  new: { label: 'NEW', cls: 'bg-blue-50 text-blue-700' },
  contacted: { label: 'CONTACTED', cls: 'bg-violet-100 text-violet-700' },
  follow_up: { label: 'FOLLOW-UP', cls: 'bg-amber-100 text-amber-800' },
  issue: { label: 'ISSUE', cls: 'bg-red-100 text-red-700' },
  converted: { label: 'CONVERTED', cls: 'bg-green-100 text-green-700' },
  not_interested: { label: 'NOT INTERESTED', cls: 'bg-gray-200 text-gray-700' },
};

// Older rows used "Pending" / "Interested" / "Not interested" / "Issue".
export const normalizeLeadSales = (s?: string): LeadSalesStatus => {
  switch ((s || '').toLowerCase()) {
    case 'contacted': return 'contacted';
    case 'follow_up': case 'interested': return 'follow_up';
    case 'issue': return 'issue';
    case 'converted': return 'converted';
    case 'not_interested': case 'not interested': return 'not_interested';
    default: return 'new';
  }
};

export interface AdminLead {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  stage: LeadStage;
  sales: LeadSalesStatus;
  assignedTo: string;
  followUpAt: Date | null;
  lastUpdated: Date | null;
  convertedAt: Date | null;
  source: string;
  company: AdminCompany | null;
}

export const buildLeads = (raw: any[], companies: AdminCompany[]): AdminLead[] => {
  const byUid = new Map<string, AdminCompany>();
  const byEmail = new Map<string, AdminCompany>();
  const byPhone = new Map<string, AdminCompany>();
  companies.forEach(c => {
    if (c.ownerUid) byUid.set(c.ownerUid, c);
    if (c.email) byEmail.set(c.email.toLowerCase(), c);
    if (last10(c.phone)) byPhone.set(last10(c.phone), c);
  });

  return raw.map(l => {
    const email = (l.email || l.id || '').toLowerCase();
    const phone = l.phoneNumber || l.phone || '';
    const company = (l.userId && byUid.get(l.userId)) || byEmail.get(email) || (last10(phone) && byPhone.get(last10(phone))) || null;
    const completed = String(l.currentStep || '').toLowerCase() === 'completed' || !!company;

    let stage: LeadStage = 'details';
    if (completed) {
      if (company && !company.isTrial) stage = 'paid';
      else if (company && companyStatus(company) === 'expired') stage = 'trial_ended';
      else stage = 'trial';
    }

    let sales = normalizeLeadSales(l.salesStatus);
    if (stage === 'paid') sales = 'converted';

    return {
      id: l.id,
      fullName: l.fullName || '',
      email: l.email || l.id,
      phone,
      stage,
      sales,
      assignedTo: l.assignedTo || '',
      followUpAt: toDate(l.followUpAt),
      lastUpdated: toDate(l.lastUpdated),
      convertedAt: toDate(l.convertedAt),
      source: l.source || 'app',
      company,
    };
  });
};

// ─── Coupons ──────────────────────────────────────────────
export interface AdminCoupon {
  code: string;
  discountType: 'percent' | 'flat';
  discountValue: number;
  applicablePlans: string[] | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  minAmount: number;
  isActive: boolean;
  validFrom: Date | null;
  validTill: Date | null;
  createdAt: Date | null;
  createdBy: string | null;
}

export const toCoupon = (d: any): AdminCoupon => ({
  code: d.code,
  discountType: d.discountType === 'flat' ? 'flat' : 'percent',
  discountValue: Number(d.discountValue) || 0,
  applicablePlans: Array.isArray(d.applicablePlans) && d.applicablePlans.length ? d.applicablePlans : null,
  maxRedemptions: typeof d.maxRedemptions === 'number' ? d.maxRedemptions : null,
  redemptionCount: d.redemptionCount || 0,
  minAmount: Number(d.minAmount) || 0,
  isActive: d.isActive !== false,
  validFrom: toDate(d.validFrom),
  validTill: toDate(d.validTill),
  createdAt: toDate(d.createdAt),
  createdBy: d.createdBy || null,
});

// Discount as a share of a plan's list price. The server caps any discount
// at price − ₹1, so "100%" really means the plan sells for ₹1.
export const couponShare = (c: AdminCoupon, planId: string) => {
  const price = PLAN_PRICE_YEARLY[planId];
  if (!price) return 0;
  const off = c.discountType === 'percent' ? (price * c.discountValue) / 100 : c.discountValue;
  return Math.min(off, price - 1) / price;
};

export const couponMaxShare = (c: AdminCoupon) =>
  Math.max(0, ...(c.applicablePlans || Object.keys(PLAN_PRICE_YEARLY)).map(p => couponShare(c, p)));

export const couponExpired = (c: AdminCoupon) => !!c.validTill && c.validTill.getTime() < Date.now();

// Near-free, unlimited and never-ending: anyone who finds the code gets
// Sellar almost free, forever.
export const couponHighRisk = (c: AdminCoupon) =>
  c.isActive && !couponExpired(c) && couponMaxShare(c) >= 0.9 && c.maxRedemptions === null && !c.validTill;

// ─── Support tickets ──────────────────────────────────────
export type TicketStatus = 'open' | 'in_progress' | 'waiting' | 'solved';

// Legacy statuses: received → open, problem → in progress.
export const normalizeTicketStatus = (s?: string): TicketStatus => {
  if (s === 'solved') return 'solved';
  if (s === 'in_progress' || s === 'problem') return 'in_progress';
  if (s === 'waiting') return 'waiting';
  return 'open';
};

export const TICKET_STATUS_META: Record<TicketStatus, { label: string; cls: string }> = {
  open: { label: 'OPEN', cls: 'bg-red-100 text-red-700' },
  in_progress: { label: 'IN PROGRESS', cls: 'bg-blue-100 text-blue-700' },
  waiting: { label: 'WAITING ON CUSTOMER', cls: 'bg-amber-100 text-amber-800' },
  solved: { label: 'SOLVED', cls: 'bg-green-100 text-green-700' },
};

export type TicketPriority = 'high' | 'medium' | 'low';

export const PRIORITY_META: Record<TicketPriority, { label: string; cls: string }> = {
  high: { label: 'HIGH', cls: 'bg-red-100 text-red-700' },
  medium: { label: 'MEDIUM', cls: 'bg-amber-100 text-amber-800' },
  low: { label: 'LOW', cls: 'bg-gray-200 text-gray-700' },
};

export interface TicketMessage {
  kind: 'customer' | 'reply' | 'note';
  channel?: 'whatsapp' | 'email';
  text: string;
  at: Date | null;
  by?: string;
}

export interface AdminTicket {
  id: string;
  number: string;          // display number, assigned by creation date
  customerRef: string;     // what the customer was told (often a duplicate TKT-0001)
  fullName: string;
  email: string;
  phone: string;
  subject: string;
  description: string;
  category: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignedTo: string;
  createdAt: Date | null;
  firstRepliedAt: Date | null;
  solvedAt: Date | null;
  messages: TicketMessage[];
}

const clean = (v?: string) => (v && v !== 'N/A' ? v : '');

export const ticketHasContact = (t: AdminTicket) => !!(t.email || t.phone);

// The app used to save every ticket as TKT-0001, so numbers are reassigned
// here by creation order. Stable as long as tickets aren't deleted.
export const buildTickets = (docs: { id: string; data: any }[]): AdminTicket[] => {
  const sorted = [...docs].sort((a, b) =>
    (toDate(a.data.createdAt)?.getTime() ?? 0) - (toDate(b.data.createdAt)?.getTime() ?? 0));
  return sorted.map(({ id, data }, i) => ({
    id,
    number: `TKT-${String(i + 1).padStart(4, '0')}`,
    customerRef: data.referenceNumber || '',
    fullName: data.fullName && data.fullName !== 'Unknown' ? data.fullName : '',
    email: clean(data.email),
    phone: clean(data.phone),
    subject: data.subject || '(no subject)',
    description: data.description || '',
    category: data.category || '',
    status: normalizeTicketStatus(data.status),
    priority: (['high', 'medium', 'low'].includes(data.priority) ? data.priority : 'medium') as TicketPriority,
    assignedTo: data.assignedTo || '',
    createdAt: toDate(data.createdAt),
    firstRepliedAt: toDate(data.firstRepliedAt),
    solvedAt: toDate(data.solvedAt),
    messages: (Array.isArray(data.messages) ? data.messages : []).map((m: any) => ({ ...m, at: toDate(m.at) })),
  }));
};

export const loadTicketSummary = () => cached<{ open: number }>('tickets', async () => {
  const snap = await getDocs(collection(db, 'support_tickets'));
  return { open: snap.docs.filter(d => normalizeTicketStatus(d.data().status) !== 'solved').length };
});
