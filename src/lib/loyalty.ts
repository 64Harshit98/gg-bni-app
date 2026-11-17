// Customer loyalty points.
//
// Storage (all under companies/{cid}/):
//   settings/loyalty          — LoyaltySettings (public read, member write)
//   loyaltyAccounts/{phone}   — balance per customer (members only, via the catch-all rule)
//   loyaltyLedger/{autoId}    — one row per change (members only)
//
// The balance deliberately does NOT live on customers/{phone}: that collection
// is publicly writable for the storefront checkout, so anything stored there
// could be edited by anyone.
//
// Sale and order docs carry `loyalty: SaleLoyalty` so edit / return / delete
// know exactly what to undo; the redeemed rupee value is also written as a
// paymentMethods key (LOYALTY_PAYMENT_KEY) the same way 'Credit Note' is.

import {
    collection,
    doc,
    getDoc,
    increment,
    runTransaction,
    serverTimestamp,
    type DocumentReference,
    type Firestore,
    type Transaction,
    type WriteBatch,
} from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface LoyaltySettings {
    companyId?: string;
    settingType?: 'loyalty';
    enabled: boolean;
    /** `earnPoints` points for every `earnPerAmount` rupees billed. */
    earnPoints: number;
    earnPerAmount: number;
    /** Bills below this amount earn nothing. */
    minBillForEarn: number;
    /** Lets users WITH Permissions.OverrideLoyaltyPoints change the points a bill earns. */
    allowBillOverride: boolean;
    redeemEnabled: boolean;
    /** Rupee value of one point when redeemed. */
    pointValue: number;
    /** A customer needs at least this many points before they can redeem. */
    minPointsToRedeem: number;
    /** Max share of a bill that points can pay, 1–100. */
    maxRedeemPercent: number;
    applyToOnlineOrders: boolean;
    printOnBill: boolean;
}

export const LOYALTY_SETTINGS_DOC = 'loyalty';

export const getDefaultLoyaltySettings = (companyId?: string): LoyaltySettings => ({
    ...(companyId ? { companyId } : {}),
    settingType: 'loyalty',
    enabled: false,
    earnPoints: 1,
    earnPerAmount: 100,
    minBillForEarn: 0,
    allowBillOverride: false,
    redeemEnabled: true,
    pointValue: 1,
    minPointsToRedeem: 0,
    maxRedeemPercent: 100,
    applyToOnlineOrders: true,
    printOnBill: true,
});

// ---------------------------------------------------------------------------
// Shapes stored on other docs
// ---------------------------------------------------------------------------

/** paymentMethods key for the rupee value paid with points on a POS sale. */
export const LOYALTY_PAYMENT_KEY = 'Loyalty Points';
/** paymentMethods key used by the online-order payment modal (it upper-cases method keys). */
export const LOYALTY_ORDER_PAYMENT_KEY = 'LOYALTY POINTS';

/** What a sale / order did to the customer's points. */
export interface SaleLoyalty {
    phone: string;
    earned: number;
    redeemed: number;
    redeemValue: number;
    /** Set when an authorised user changed the auto-calculated points. */
    autoEarned?: number;
    overriddenBy?: string;
}

export interface LoyaltyAccount {
    phone: string;
    name: string;
    balance: number;
    lifetimeEarned: number;
    lifetimeRedeemed: number;
}

export type LoyaltyEntryType = 'earn' | 'redeem' | 'adjust' | 'reverse';
export type LoyaltyRefType = 'sale' | 'order' | 'return' | 'delete' | 'edit' | 'manual';

export interface LoyaltyChange {
    type: LoyaltyEntryType;
    /** Signed: + adds points, − removes points. */
    points: number;
    refType: LoyaltyRefType;
    refId?: string;
    invoiceNumber?: string;
    note?: string;
    /** Extra fields copied onto the ledger row (e.g. autoEarned / overriddenBy). */
    extra?: Record<string, unknown>;
}

export interface LoyaltyActor {
    uid?: string;
    name?: string;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** The loyalty key for a customer: the last 10 digits of their phone, or '' if there aren't 10. */
export const normalizeLoyaltyPhone = (raw: string | undefined | null): string => {
    const digits = String(raw ?? '').replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : '';
};

const num = (v: unknown, fallback = 0): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
};

/** Points a bill of `amount` rupees earns under `settings`. Always a whole number ≥ 0. */
export const calcEarnPoints = (amount: number, settings: LoyaltySettings | null | undefined): number => {
    if (!settings?.enabled) return 0;
    const amt = num(amount);
    const per = num(settings.earnPerAmount);
    const pts = num(settings.earnPoints);
    if (amt <= 0 || per <= 0 || pts <= 0) return 0;
    if (amt < num(settings.minBillForEarn)) return 0;
    // Small epsilon so ₹300.00 / 100 doesn't floor to 2 through float error.
    return Math.max(0, Math.floor((amt / per) * pts + 1e-9));
};

/** Rupee value of `points`, rounded to paise. */
export const pointsToRupees = (points: number, settings: LoyaltySettings | null | undefined): number => {
    const value = num(points) * num(settings?.pointValue, 1);
    return Math.round(value * 100) / 100;
};

/**
 * Whole points that cover at most `rupees` (the cashier typed an amount instead
 * of points). Rounds down, so ₹124 at ₹3 a point is 41 pts (₹123), never more
 * than was asked for.
 */
export const rupeesToPoints = (rupees: number, settings: LoyaltySettings | null | undefined): number => {
    const value = num(settings?.pointValue, 1);
    if (value <= 0 || num(rupees) <= 0) return 0;
    return Math.max(0, Math.floor(num(rupees) / value + 1e-9));
};

/**
 * Most points a customer may redeem on a bill: limited by their balance,
 * the max-% cap and the bill itself. Returns 0 when they're below the minimum.
 */
export const calcMaxRedeemPoints = (
    balance: number,
    billTotal: number,
    settings: LoyaltySettings | null | undefined,
): number => {
    if (!settings?.enabled || !settings.redeemEnabled) return 0;
    const bal = Math.floor(num(balance));
    const value = num(settings.pointValue, 1);
    if (bal <= 0 || value <= 0 || num(billTotal) <= 0) return 0;
    if (bal < num(settings.minPointsToRedeem)) return 0;
    const pct = Math.min(100, Math.max(0, num(settings.maxRedeemPercent, 100)));
    const capRupees = (num(billTotal) * pct) / 100;
    const capPoints = Math.floor(capRupees / value + 1e-9);
    return Math.max(0, Math.min(bal, capPoints));
};

/** Earned points to take back when `returnedValue` of a bill worth `originalTotal` is returned. */
export const calcReturnReversal = (earned: number, returnedValue: number, originalTotal: number): number => {
    const e = Math.max(0, Math.floor(num(earned)));
    const total = num(originalTotal);
    const back = num(returnedValue);
    if (e <= 0 || total <= 0 || back <= 0) return 0;
    if (back >= total) return e;
    return Math.min(e, Math.round((e * back) / total));
};

// ---------------------------------------------------------------------------
// Firestore helpers
// ---------------------------------------------------------------------------

export const loyaltyAccountRef = (db: Firestore, companyId: string, phone: string) =>
    doc(db, 'companies', companyId, 'loyaltyAccounts', phone);

export const loyaltyLedgerCol = (db: Firestore, companyId: string) =>
    collection(db, 'companies', companyId, 'loyaltyLedger');

export interface LoyaltyAccountState extends LoyaltyAccount {
    ref: DocumentReference;
    exists: boolean;
}

const toAccount = (phone: string, data: Record<string, unknown> | undefined): LoyaltyAccount => ({
    phone,
    name: String(data?.name ?? ''),
    balance: num(data?.balance),
    lifetimeEarned: num(data?.lifetimeEarned),
    lifetimeRedeemed: num(data?.lifetimeRedeemed),
});

/** One-off read outside a transaction (drawer / payment modal display). */
export const fetchLoyaltyAccount = async (
    db: Firestore,
    companyId: string,
    phone: string,
): Promise<LoyaltyAccount | null> => {
    const key = normalizeLoyaltyPhone(phone);
    if (!companyId || !key) return null;
    const snap = await getDoc(loyaltyAccountRef(db, companyId, key));
    return snap.exists() ? toAccount(key, snap.data()) : toAccount(key, undefined);
};

/**
 * Read the account inside a transaction. Firestore needs every read before
 * the first write, so call this up front and pass the result to
 * writeLoyaltyInTxn later.
 */
export const readLoyaltyInTxn = async (
    txn: Transaction,
    db: Firestore,
    companyId: string,
    phone: string,
): Promise<LoyaltyAccountState> => {
    const ref = loyaltyAccountRef(db, companyId, phone);
    const snap = await txn.get(ref);
    return { ...toAccount(phone, snap.exists() ? snap.data() : undefined), ref, exists: snap.exists() };
};

export class LoyaltyBalanceError extends Error {
    constructor(public available: number, public requested: number) {
        super(`Not enough loyalty points. Available: ${available}, needed: ${requested}.`);
        this.name = 'LoyaltyBalanceError';
    }
}

const ledgerRow = (
    account: { phone: string; name: string },
    change: LoyaltyChange,
    points: number,
    balanceAfter: number,
    actor: LoyaltyActor | undefined,
    note: string | undefined,
) => {
    const row: Record<string, unknown> = {
        phone: account.phone,
        name: account.name,
        type: change.type,
        points,
        balanceAfter,
        refType: change.refType,
        refId: change.refId ?? '',
        invoiceNumber: change.invoiceNumber ?? '',
        note: note ?? '',
        createdBy: actor?.uid ?? '',
        createdByName: actor?.name ?? '',
        createdAt: serverTimestamp(),
        ...(change.extra ?? {}),
    };
    Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);
    return row;
};

/**
 * Apply changes (in order) to an account read with readLoyaltyInTxn.
 * - 'redeem' and 'adjust' that would push the balance below 0 throw LoyaltyBalanceError,
 *   which aborts the whole transaction (the bill isn't saved either).
 * - 'reverse' is clamped at 0; the ledger note records how much couldn't be taken back.
 * Zero-point changes are skipped. Returns the final balance.
 */
export const writeLoyaltyInTxn = (
    txn: Transaction,
    db: Firestore,
    companyId: string,
    account: LoyaltyAccountState,
    changes: LoyaltyChange[],
    opts: { name?: string; actor?: LoyaltyActor } = {},
): number => {
    const name = (opts.name || account.name || '').trim();
    let balance = account.balance;
    let earned = 0;
    let redeemed = 0;
    let wrote = false;

    for (const change of changes) {
        let pts = Math.trunc(num(change.points));
        if (pts === 0) continue;
        let note = change.note;

        if (balance + pts < 0) {
            if (change.type === 'reverse') {
                const clamped = -balance;
                note = [note, `${Math.abs(pts - clamped)} pts could not be taken back (balance was ${balance})`]
                    .filter(Boolean)
                    .join(' · ');
                pts = clamped;
                if (pts === 0) {
                    // Nothing left to take: still log it so the history explains itself.
                    txn.set(doc(loyaltyLedgerCol(db, companyId)), ledgerRow({ phone: account.phone, name }, change, 0, balance, opts.actor, note));
                    continue;
                }
            } else {
                throw new LoyaltyBalanceError(balance, Math.abs(pts));
            }
        }

        balance += pts;
        if (change.type === 'earn' || (change.type === 'adjust' && pts > 0)) earned += pts;
        if (change.type === 'redeem') redeemed += -pts;
        // A reversal of an earn lowers lifetimeEarned; a refund of a redeem lowers lifetimeRedeemed.
        if (change.type === 'reverse') {
            if (change.extra?.reverses === 'redeem') redeemed -= pts;
            else earned += pts;
        }

        txn.set(doc(loyaltyLedgerCol(db, companyId)), ledgerRow({ phone: account.phone, name }, change, pts, balance, opts.actor, note));
        wrote = true;
    }

    if (wrote) {
        txn.set(
            account.ref,
            {
                phone: account.phone,
                name: name || account.name,
                balance,
                lifetimeEarned: Math.max(0, account.lifetimeEarned + earned),
                lifetimeRedeemed: Math.max(0, account.lifetimeRedeemed + redeemed),
                updatedAt: serverTimestamp(),
                ...(account.exists ? {} : { createdAt: serverTimestamp() }),
            },
            { merge: true },
        );
    }
    return balance;
};

/**
 * Batch variant for flows built on writeBatch (returns, deletes). Uses
 * increment(), so it can't check or clamp the balance — only use it for
 * reversals and refunds, never for spending points.
 */
export const writeLoyaltyInBatch = (
    batch: WriteBatch,
    db: Firestore,
    companyId: string,
    phone: string,
    changes: LoyaltyChange[],
    opts: { name?: string; actor?: LoyaltyActor } = {},
): void => {
    const key = normalizeLoyaltyPhone(phone);
    if (!key) return;
    let delta = 0;
    let earned = 0;
    let redeemed = 0;
    for (const change of changes) {
        const pts = Math.trunc(num(change.points));
        if (pts === 0) continue;
        delta += pts;
        if (change.type === 'reverse' && change.extra?.reverses === 'redeem') redeemed += pts * -1;
        else if (change.type === 'reverse' || change.type === 'earn') earned += pts;
        batch.set(
            doc(loyaltyLedgerCol(db, companyId)),
            // balanceAfter is unknown with increment(); null marks it as such.
            { ...ledgerRow({ phone: key, name: opts.name ?? '' }, change, pts, 0, opts.actor, change.note), balanceAfter: null },
        );
    }
    if (delta === 0 && earned === 0 && redeemed === 0) return;
    batch.set(
        loyaltyAccountRef(db, companyId, key),
        {
            phone: key,
            ...(opts.name ? { name: opts.name } : {}),
            balance: increment(delta),
            ...(earned !== 0 ? { lifetimeEarned: increment(earned) } : {}),
            ...(redeemed !== 0 ? { lifetimeRedeemed: increment(redeemed) } : {}),
            updatedAt: serverTimestamp(),
        },
        { merge: true },
    );
};

/**
 * The loyalty block to print on a bill, or null when it shouldn't print
 * (setting off, or the bill didn't touch points). Uses the balance saved with
 * a fresh bill; for reprints it reads the customer's current balance.
 */
export const loyaltyForPrint = async (
    db: Firestore,
    companyId: string,
    bill: LoyaltyDocLike,
    settings: LoyaltySettings | null | undefined,
): Promise<{ earned: number; redeemed: number; redeemValue: number; balance: number | null; rule: string } | null> => {
    if (!settings?.enabled || !settings.printOnBill) return null;
    const l = readSaleLoyalty(bill);
    if (!l || (l.earned <= 0 && l.redeemed <= 0)) return null;
    const savedBalance = (bill?.loyalty as { balance?: unknown } | null | undefined)?.balance;
    let balance: number | null = typeof savedBalance === 'number' ? savedBalance : null;
    if (balance === null) {
        try {
            balance = (await fetchLoyaltyAccount(db, companyId, l.phone))?.balance ?? null;
        } catch {
            balance = null;
        }
    }
    return { earned: l.earned, redeemed: l.redeemed, redeemValue: l.redeemValue, balance, rule: loyaltyRuleText(settings) };
};

/**
 * The shop's loyalty rule in words for printed bills, e.g. "Rs.100 = 1 pt, 1 pt = Rs.1".
 * Uses "Rs." because the PDF fonts have no ₹ glyph.
 */
export const loyaltyRuleText = (settings: LoyaltySettings | null | undefined): string => {
    if (!settings) return '';
    const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
    const pts = (v: number) => `${n(v)} ${v === 1 ? 'pt' : 'pts'}`;
    const parts: string[] = [];
    const per = num(settings.earnPerAmount);
    const earn = num(settings.earnPoints);
    if (per > 0 && earn > 0) parts.push(`Rs.${n(per)} = ${pts(earn)}`);
    const value = num(settings.pointValue);
    if (settings.redeemEnabled && value > 0) parts.push(`1 pt = Rs.${n(value)}`);
    return parts.join(', ');
};

/** Anything that may carry a `loyalty` block: a sale / order doc, a Journal invoice, a print payload. */
export type LoyaltyDocLike = { loyalty?: unknown; partyNumber?: unknown } | null | undefined;

/** Reads `loyalty` off a sale / order doc, tolerating missing or partial data. */
export const readSaleLoyalty = (data: LoyaltyDocLike): SaleLoyalty | null => {
    const l = data?.loyalty as Record<string, unknown> | null | undefined;
    if (!l || typeof l !== 'object') return null;
    const phone = normalizeLoyaltyPhone(String(l.phone ?? data?.partyNumber ?? ''));
    if (!phone) return null;
    return {
        phone,
        earned: Math.max(0, Math.trunc(num(l.earned))),
        redeemed: Math.max(0, Math.trunc(num(l.redeemed))),
        redeemValue: Math.max(0, num(l.redeemValue)),
        ...(l.autoEarned != null ? { autoEarned: num(l.autoEarned) } : {}),
        ...(l.overriddenBy ? { overriddenBy: String(l.overriddenBy) } : {}),
    };
};

export interface LoyaltyPlanStep {
    phone: string;
    changes: LoyaltyChange[];
}

/**
 * What to write when a bill is saved, given what it did before (`prev`, null
 * for a new bill) and what it should do now (`next`, null when the bill no
 * longer has a loyalty customer).
 *
 * Same customer → only the difference is applied. Within a step, additions
 * come before deductions, so a bill that both gives points back and spends
 * them never trips the "not enough points" check part-way through.
 * Different customer → the old customer's effect is undone in full and the
 * new one is applied in full.
 */
export const planLoyaltyForSave = (
    prev: SaleLoyalty | null,
    next: SaleLoyalty | null,
    ref: { refType: LoyaltyRefType; refId?: string; invoiceNumber?: string },
): LoyaltyPlanStep[] => {
    const base = { refType: ref.refType, refId: ref.refId, invoiceNumber: ref.invoiceNumber };
    const overrideExtra = (l: SaleLoyalty) =>
        l.overriddenBy ? { autoEarned: l.autoEarned ?? null, overriddenBy: l.overriddenBy } : undefined;
    const isEdit = ref.refType === 'edit';

    const applyFull = (l: SaleLoyalty): LoyaltyChange[] => [
        {
            ...base,
            type: 'earn',
            points: l.earned,
            note: isEdit ? 'Bill edited' : '',
            extra: overrideExtra(l),
        },
        {
            ...base,
            type: 'redeem',
            points: -l.redeemed,
            note: `Paid ₹${l.redeemValue.toFixed(2)} with points`,
        },
    ];

    const undoFull = (l: SaleLoyalty): LoyaltyChange[] => [
        { ...base, type: 'reverse', points: l.redeemed, note: 'Bill edited: points used given back', extra: { reverses: 'redeem' } },
        { ...base, type: 'reverse', points: -l.earned, note: 'Bill edited: earned points taken back', extra: { reverses: 'earn' } },
    ];

    if (!prev && !next) return [];

    if (prev && next && prev.phone === next.phone) {
        const redeemDelta = next.redeemed - prev.redeemed;
        const earnDelta = next.earned - prev.earned;
        const changes: LoyaltyChange[] = [];
        if (redeemDelta < 0) changes.push({ ...base, type: 'reverse', points: -redeemDelta, note: 'Bill edited: fewer points used', extra: { reverses: 'redeem' } });
        if (earnDelta > 0) changes.push({ ...base, type: 'earn', points: earnDelta, note: 'Bill edited', extra: overrideExtra(next) });
        if (redeemDelta > 0) changes.push({ ...base, type: 'redeem', points: -redeemDelta, note: 'Bill edited: more points used' });
        if (earnDelta < 0) changes.push({ ...base, type: 'reverse', points: earnDelta, note: 'Bill edited', extra: { reverses: 'earn' } });
        return changes.length ? [{ phone: next.phone, changes }] : [];
    }

    const steps: LoyaltyPlanStep[] = [];
    if (prev) steps.push({ phone: prev.phone, changes: undoFull(prev) });
    if (next) steps.push({ phone: next.phone, changes: applyFull(next) });
    return steps.filter((s) => s.changes.some((c) => c.points !== 0));
};

/**
 * Manually add (+) or remove (−) points. Callers must gate this behind
 * Permissions.ManageLoyaltyPoints. Throws LoyaltyBalanceError if removing
 * more than the customer has. Returns the new balance.
 */
export const adjustLoyaltyPoints = async (
    db: Firestore,
    companyId: string,
    input: { phone: string; name?: string; points: number; reason: string; actor: LoyaltyActor },
): Promise<number> => {
    const phone = normalizeLoyaltyPhone(input.phone);
    if (!phone) throw new Error('A 10-digit mobile number is needed for loyalty points.');
    const points = Math.trunc(num(input.points));
    if (points === 0) throw new Error('Enter how many points to add or remove.');
    if (!input.reason.trim()) throw new Error('Please give a reason.');
    return runTransaction(db, async (txn) => {
        const account = await readLoyaltyInTxn(txn, db, companyId, phone);
        return writeLoyaltyInTxn(txn, db, companyId, account, [{
            type: 'adjust',
            points,
            refType: 'manual',
            note: input.reason.trim(),
        }], { name: input.name, actor: input.actor });
    });
};

/** Read every account a plan touches. Call before the transaction's first write. */
export const readLoyaltyPlanInTxn = async (
    txn: Transaction,
    db: Firestore,
    companyId: string,
    steps: LoyaltyPlanStep[],
): Promise<Map<string, LoyaltyAccountState>> => {
    const phones = Array.from(new Set(steps.map((s) => s.phone)));
    const accounts = await Promise.all(phones.map((p) => readLoyaltyInTxn(txn, db, companyId, p)));
    return new Map(accounts.map((a) => [a.phone, a]));
};

/** Write a plan using accounts from readLoyaltyPlanInTxn. Returns the final balance per phone. */
export const writeLoyaltyPlanInTxn = (
    txn: Transaction,
    db: Firestore,
    companyId: string,
    steps: LoyaltyPlanStep[],
    accounts: Map<string, LoyaltyAccountState>,
    opts: { names?: Record<string, string>; actor?: LoyaltyActor; ref?: { refId?: string; invoiceNumber?: string } } = {},
): Map<string, number> => {
    const balances = new Map<string, number>();
    for (const step of steps) {
        const account = accounts.get(step.phone);
        if (!account) continue;
        // refId / invoiceNumber are often only known after the bill is written — fill them in here.
        const changes = opts.ref
            ? step.changes.map((c) => ({ ...c, refId: c.refId || opts.ref!.refId, invoiceNumber: c.invoiceNumber || opts.ref!.invoiceNumber }))
            : step.changes;
        const balance = writeLoyaltyInTxn(txn, db, companyId, account, changes, { name: opts.names?.[step.phone], actor: opts.actor });
        // Later steps on the same phone must start from the updated balance.
        accounts.set(step.phone, { ...account, balance, exists: true });
        balances.set(step.phone, balance);
    }
    return balances;
};

/**
 * The changes needed to undo a whole sale/order: take back what it earned,
 * give back what it redeemed. Used on delete.
 */
export const undoSaleChanges = (
    loyalty: SaleLoyalty,
    refType: LoyaltyRefType,
    ref: { refId?: string; invoiceNumber?: string },
): LoyaltyChange[] => [
    {
        type: 'reverse',
        points: -loyalty.earned,
        refType,
        ...ref,
        note: 'Bill deleted: earned points taken back',
        extra: { reverses: 'earn' },
    },
    {
        type: 'reverse',
        points: loyalty.redeemed,
        refType,
        ...ref,
        note: 'Bill deleted: redeemed points given back',
        extra: { reverses: 'redeem' },
    },
];
