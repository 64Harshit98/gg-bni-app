import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  increment,
  runTransaction,
  serverTimestamp,
   Timestamp,
} from 'firebase/firestore';
import {
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  AlertCircle,
  Warehouse,
  User,
  Phone,
  FileText,
  Calendar,
  CreditCard,
  Wallet,
  Banknote,
  Building2,
  Clock,
} from 'lucide-react';
import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import { useRestaurantData } from '../../context/RestaurantDataContext';
import { useGodowns, SHOP_ID } from '../hooks/useStockTransfer';
import {
  KITCHEN_ID,
  KITCHEN_NAME,
  type RawMaterial,
} from '../../lib/restaurant/types';
import {
  costPerPurchaseUnit,
  defaultPurchaseUnitName,
  round3,
  round6,
  toBase,
  unitsOf,
} from '../../lib/restaurant/units';
import {
  avgCostWithout,
  nextAvgCost,
  queueMovement,
  rawMaterialRef,
} from '../../lib/restaurant/stockApi';
import {
  getFinancialYear,
  peekNextPurchaseNumber,
} from '../../UseComponents/InvoiceCounter';
import { clearPurchaseReportCache } from '../Reports/PurchaseReportComponents/purchaseReportCache';
import { getPartyDocId } from '../../constants/customerSource';
import { searchParties, type PartyHit } from '../../lib/partySearch';
import { ROUTES } from '../../constants/routes.constants';
import BackButton from '../../Components/BackButton';
import {
  RpQuickCreateModal,
  type RpQuickCreatedMaterial,
} from './components/RpQuickCreateModal';
import { RpRawMaterialSelect } from './components/RpRawMaterialSelect';
import type { PurchaseDocumentData, PurchaseItem } from '../Master/Purchase/purchase.types';

export interface RawMaterialPurchaseLineItem extends PurchaseItem {
  rawMaterialId: string;
  baseQty: number;
  /** Rupees per ONE base unit (lets edit / return / delete undo this line's effect on avgCost). */
  unitCost?: number;
  locationId: string;
  locationName: string;
  amount: number;
}

export interface RawMaterialPurchaseDoc extends Omit<PurchaseDocumentData, 'items'> {
  id?: string;
  isRawMaterialPurchase: true;
  items: RawMaterialPurchaseLineItem[];
  dueAmount?: number;
  receiveLocationId?: string;
  receiveLocationName?: string;
}

interface FormLine {
  rowId: string;
  rawMaterialId: string;
  quantity: string;
  unit: string;
  rate: string;
  gstPct: string;
}

interface LocationEditState {
  purchaseId?: string;
  purchaseToEdit?: (Partial<RawMaterialPurchaseDoc> & { id?: string }) | string;
  invoiceToEdit?: (Partial<RawMaterialPurchaseDoc> & { id?: string }) | string;
  prefillParty?: { name?: string; number?: string };
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const getTodayStr = (): string => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const toDateInputStr = (val: unknown): string => {
  if (!val) return getTodayStr();
  let d: Date | null = null;
  if (val instanceof Timestamp) {
    d = val.toDate();
  } else if (val instanceof Date) {
    d = val;
  } else if (typeof val === 'number') {
    d = new Date(val);
  } else if (typeof val === 'object' && val !== null && 'seconds' in val) {
    d = new Date((val as { seconds: number }).seconds * 1000);
  } else if (typeof val === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
    const parsed = new Date(val);
    if (!Number.isNaN(parsed.getTime())) d = parsed;
  }
  if (!d || Number.isNaN(d.getTime())) return getTodayStr();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const combineDateWithCurrentTime = (dateStr: string): Date => {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const d = new Date();
    d.setFullYear(year, month, day);
    return d;
  }
  return new Date();
};

const toRegistryKey = (invoiceNo: string) => encodeURIComponent(invoiceNo.trim());

const createBlankLine = (): FormLine => ({
  rowId: crypto.randomUUID(),
  rawMaterialId: '',
  quantity: '1',
  unit: '',
  rate: '',
  gstPct: '0',
});

const sanitizeForFirestore = <T,>(value: T): T => {
  if (Array.isArray(value)) {
    return value
      .filter((v) => v !== undefined)
      .map((v) => sanitizeForFirestore(v)) as unknown as T;
  }
  if (
    value !== null &&
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, sanitizeForFirestore(v)]),
    ) as T;
  }
  return value;
};

const INPUT_CLS =
  'h-9 w-full rounded-sm border border-[#dfe6fb] bg-white px-2.5 text-xs font-medium text-[#0f172b] placeholder:text-[#5b6b86] focus:border-[#155dfc] focus:outline-none focus:ring-2 focus:ring-[#155dfc]/20';

const RestaurantPurchase: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const companyId = currentUser?.companyId || '';

  const { rawMaterials, categories, loading: restaurantLoading } = useRestaurantData();
  const { godowns } = useGodowns(companyId || undefined);

  // Optimistic newly created raw materials before snapshot catches up
  const [localCreated, setLocalCreated] = useState<RawMaterial[]>([]);
  const allRawMaterials = useMemo(() => {
    const map = new Map<string, RawMaterial>();
    rawMaterials.forEach((r) => map.set(r.id, r));
    localCreated.forEach((r) => {
      if (!map.has(r.id)) map.set(r.id, r);
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [rawMaterials, localCreated]);

  const allRawMaterialMap = useMemo(
    () => new Map(allRawMaterials.map((r) => [r.id, r])),
    [allRawMaterials],
  );

  // Resolve edit state from location.state
  const locState = (location.state as LocationEditState | null) || null;
  const resolvedEditTarget = useMemo(() => {
    if (!locState) return { id: undefined, docData: null };
    if (typeof locState.purchaseToEdit === 'string') {
      return { id: locState.purchaseToEdit, docData: null };
    }
    if (locState.purchaseToEdit && typeof locState.purchaseToEdit === 'object') {
      return { id: locState.purchaseToEdit.id, docData: locState.purchaseToEdit };
    }
    if (typeof locState.invoiceToEdit === 'string') {
      return { id: locState.invoiceToEdit, docData: null };
    }
    if (locState.invoiceToEdit && typeof locState.invoiceToEdit === 'object') {
      return { id: locState.invoiceToEdit.id, docData: locState.invoiceToEdit };
    }
    if (locState.purchaseId) {
      return { id: locState.purchaseId, docData: null };
    }
    return { id: undefined, docData: null };
  }, [locState]);

  const editPurchaseId = resolvedEditTarget.id;
  const isEditMode = Boolean(editPurchaseId);

  // Header state
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState<string>(getTodayStr);
  const [supplierName, setSupplierName] = useState(locState?.prefillParty?.name || '');
  const [supplierMobile, setSupplierMobile] = useState(locState?.prefillParty?.number || '');
  const [receiveLocationId, setReceiveLocationId] = useState<string>(KITCHEN_ID);

  // Supplier autocomplete
  const [supplierHits, setSupplierHits] = useState<PartyHit[]>([]);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const supplierBoxRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lines state
  const [lines, setLines] = useState<FormLine[]>(() => [createBlankLine()]);

  // Totals & Payment state
  const [discountInput, setDiscountInput] = useState('0');
  const [autoRoundOff, setAutoRoundOff] = useState(true);
  const [paidCash, setPaidCash] = useState('');
  const [paidUpi, setPaidUpi] = useState('');
  const [paidCard, setPaidCard] = useState('');
  const [paidBank, setPaidBank] = useState('');
  const [paymentTouched, setPaymentTouched] = useState(false);

  // Quick-create modal state
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreatePrefill, setQuickCreatePrefill] = useState('');
  const [quickCreateTargetRowId, setQuickCreateTargetRowId] = useState<string | null>(null);

  // UI feedback state
  const [saving, setSaving] = useState(false);
  const [loadingEditDoc, setLoadingEditDoc] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Active locations list (Kitchen + active godowns)
  const locationOptions = useMemo(() => {
    const activeGodowns = godowns
      .filter((g) => g.isActive !== false)
      .map((g) => ({ id: g.id, name: g.name }));
    return [{ id: KITCHEN_ID, name: KITCHEN_NAME }, ...activeGodowns];
  }, [godowns]);

  const selectedLocationName = useMemo(() => {
    if (receiveLocationId === KITCHEN_ID || receiveLocationId === SHOP_ID) return KITCHEN_NAME;
    return locationOptions.find((l) => l.id === receiveLocationId)?.name || KITCHEN_NAME;
  }, [receiveLocationId, locationOptions]);

  // Suggest next purchase invoice number when not in edit mode
  useEffect(() => {
    if (isEditMode || !companyId) return;
    let cancelled = false;
    peekNextPurchaseNumber(companyId)
      .then((num) => {
        if (!cancelled) setInvoiceNumber((prev) => prev || num);
      })
      .catch((err) => console.error('Failed to peek purchase number:', err));
    return () => {
      cancelled = true;
    };
  }, [companyId, isEditMode]);

  // Hydrate edit mode data
  const hydrateFromDoc = useCallback((data: Partial<RawMaterialPurchaseDoc>) => {
    if (data.invoiceNumber) setInvoiceNumber(data.invoiceNumber);
    if (data.createdAt) setInvoiceDate(toDateInputStr(data.createdAt));
    setSupplierName(data.partyName || '');
    setSupplierMobile(data.partyNumber || '');

    const rawItems = Array.isArray(data.items) ? data.items : [];
    const firstLoc = rawItems[0]?.locationId || data.receiveLocationId || KITCHEN_ID;
    setReceiveLocationId(firstLoc);

    if (rawItems.length > 0) {
      setLines(
        rawItems.map((it) => ({
          rowId: crypto.randomUUID(),
          rawMaterialId: it.rawMaterialId || it.productId || it.id || '',
          quantity: String(Number(it.quantity) || 1),
          unit: it.unit || '',
          rate: String(Number(it.purchasePrice) || 0),
          gstPct: String(Number(it.taxRate) || 0),
        })),
      );
    }

    const disc = Number(data.manualDiscount ?? data.totalDiscount ?? 0) || 0;
    setDiscountInput(disc > 0 ? String(disc) : '0');
    setAutoRoundOff(data.roundingOff !== undefined ? Number(data.roundingOff) !== 0 : true);

    const pm = data.paymentMethods || {};
    const cashVal = Number(pm.cash || 0);
    const upiVal = Number(pm.upi || 0);
    const cardVal = Number(pm.card || 0);
    const bankVal = Number(pm.bank || pm.bankTransfer || pm['Bank Transfer'] || 0);
    setPaidCash(cashVal > 0 ? String(cashVal) : '');
    setPaidUpi(upiVal > 0 ? String(upiVal) : '');
    setPaidCard(cardVal > 0 ? String(cardVal) : '');
    setPaidBank(bankVal > 0 ? String(bankVal) : '');
    setPaymentTouched(true);
  }, []);

  useEffect(() => {
    if (!isEditMode || !editPurchaseId || !companyId) return;
    let cancelled = false;

    if (resolvedEditTarget.docData) {
      hydrateFromDoc(resolvedEditTarget.docData);
    }

    setLoadingEditDoc(true);
    getDoc(doc(db, 'companies', companyId, 'purchases', editPurchaseId))
      .then((snap) => {
        if (cancelled) return;
        if (!snap.exists()) {
          setErrorMsg('Purchase bill not found.');
          return;
        }
        hydrateFromDoc({ id: snap.id, ...(snap.data() as Partial<RawMaterialPurchaseDoc>) });
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to load purchase for edit:', err);
          setErrorMsg('Failed to load purchase bill for editing.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingEditDoc(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isEditMode, editPurchaseId, companyId, resolvedEditTarget.docData, hydrateFromDoc]);

  // Close supplier suggestions on click outside
  useEffect(() => {
    if (!showSupplierDropdown) return;
    const handleOutside = (e: MouseEvent) => {
      if (supplierBoxRef.current && !supplierBoxRef.current.contains(e.target as Node)) {
        setShowSupplierDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showSupplierDropdown]);

  const triggerSupplierSearch = (term: string, field: 'name' | 'number') => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!companyId || term.trim().length < 2) {
      setSupplierHits([]);
      setShowSupplierDropdown(false);
      return;
    }
    searchTimerRef.current = setTimeout(async () => {
      try {
        const hits = await searchParties(companyId, 'suppliers', term, field, 6);
        setSupplierHits(hits);
        setShowSupplierDropdown(hits.length > 0);
      } catch (err) {
        console.error('Supplier search error:', err);
      }
    }, 300);
  };

  // Computed line breakdowns
  const computedLines = useMemo(() => {
    return lines.map((line) => {
      const rm = allRawMaterialMap.get(line.rawMaterialId);
      const qty = Math.max(0, Number(line.quantity) || 0);
      const rate = Math.max(0, Number(line.rate) || 0);
      const gstPct = Math.max(0, Number(line.gstPct) || 0);
      const unitName = line.unit || (rm ? defaultPurchaseUnitName(rm) : '');
      const taxableAmount = round2(qty * rate);
      const taxAmount = round2((taxableAmount * gstPct) / 100);
      const amount = round2(taxableAmount + taxAmount);

      const unitList = rm ? unitsOf(rm) : [];
      const pickedUnitDef = unitList.find(
        (u) => u.name.toLowerCase() === unitName.trim().toLowerCase(),
      );
      const factor = pickedUnitDef && pickedUnitDef.factor > 0 ? pickedUnitDef.factor : 1;
      const baseQty = rm ? toBase(rm, qty, unitName) : round3(qty);
      const avgHint = rm ? costPerPurchaseUnit(rm) : null;
      const avgInSelectedUnit = rm ? round3((rm.avgCost || 0) * factor) : 0;

      return {
        ...line,
        rm,
        qty,
        rate,
        gstPct,
        unitName,
        unitList,
        factor,
        baseQty,
        taxableAmount,
        taxAmount,
        amount,
        avgHint,
        avgInSelectedUnit,
      };
    });
  }, [lines, allRawMaterialMap]);

  // Bill totals
  const subtotal = useMemo(
    () => round2(computedLines.reduce((s, l) => s + l.taxableAmount, 0)),
    [computedLines],
  );
  const totalTax = useMemo(
    () => round2(computedLines.reduce((s, l) => s + l.taxAmount, 0)),
    [computedLines],
  );
  const discount = useMemo(
    () => Math.max(0, round2(Number(discountInput) || 0)),
    [discountInput],
  );
  const rawTotalBeforeRound = useMemo(
    () => Math.max(0, round2(subtotal + totalTax - discount)),
    [subtotal, totalTax, discount],
  );
  const roundOff = useMemo(() => {
    if (!autoRoundOff) return 0;
    return round2(Math.round(rawTotalBeforeRound) - rawTotalBeforeRound);
  }, [autoRoundOff, rawTotalBeforeRound]);
  const grandTotal = useMemo(
    () => Math.max(0, round2(rawTotalBeforeRound + roundOff)),
    [rawTotalBeforeRound, roundOff],
  );

  // Default cash to grandTotal until the user edits payment fields
  useEffect(() => {
    if (!paymentTouched && !isEditMode) {
      setPaidCash(grandTotal > 0 ? String(grandTotal) : '');
    }
  }, [grandTotal, paymentTouched, isEditMode]);

  const cashAmt = Math.max(0, round2(Number(paidCash) || 0));
  const upiAmt = Math.max(0, round2(Number(paidUpi) || 0));
  const cardAmt = Math.max(0, round2(Number(paidCard) || 0));
  const bankAmt = Math.max(0, round2(Number(paidBank) || 0));
  const totalPaid = round2(cashAmt + upiAmt + cardAmt + bankAmt);
  const dueAmount = Math.max(0, round2(grandTotal - totalPaid));
  const overpaidAmount = totalPaid > grandTotal + 0.01 ? round2(totalPaid - grandTotal) : 0;

  // Line handlers
  const handleSelectRawMaterial = (rowId: string, rm: RawMaterial) => {
    const defUnit = defaultPurchaseUnitName(rm);
    const { cost } = costPerPurchaseUnit(rm);
    setLines((prev) =>
      prev.map((l) =>
        l.rowId === rowId
          ? {
              ...l,
              rawMaterialId: rm.id,
              unit: defUnit,
              rate: l.rate ? l.rate : cost > 0 ? String(cost) : '',
            }
          : l,
      ),
    );
  };

  const handleUnitChange = (rowId: string, newUnit: string) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.rowId !== rowId) return l;
        const rm = allRawMaterialMap.get(l.rawMaterialId);
        if (!rm) return { ...l, unit: newUnit };
        const oldDef = unitsOf(rm).find(
          (u) => u.name.toLowerCase() === l.unit.trim().toLowerCase(),
        );
        const newDef = unitsOf(rm).find(
          (u) => u.name.toLowerCase() === newUnit.trim().toLowerCase(),
        );
        const currentRate = Number(l.rate) || 0;
        let nextRate = l.rate;
        if (currentRate > 0 && oldDef && newDef && oldDef.factor > 0) {
          const perBase = currentRate / oldDef.factor;
          nextRate = String(round3(perBase * newDef.factor));
        }
        return { ...l, unit: newUnit, rate: nextRate };
      }),
    );
  };

  const handleLineField = (
    rowId: string,
    field: 'quantity' | 'rate' | 'gstPct',
    value: string,
  ) => {
    setLines((prev) =>
      prev.map((l) => (l.rowId === rowId ? { ...l, [field]: value } : l)),
    );
  };

  const handleAddRow = () => {
    setLines((prev) => [...prev, createBlankLine()]);
  };

  const handleRemoveRow = (rowId: string) => {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.rowId !== rowId) : [createBlankLine()]));
  };

  const openQuickCreateForRow = (rowId: string | null, prefill = '') => {
    setQuickCreateTargetRowId(rowId);
    setQuickCreatePrefill(prefill);
    setQuickCreateOpen(true);
  };

  const handleQuickCreated = (created: RpQuickCreatedMaterial) => {
    const newRm: RawMaterial = {
      id: created.id,
      name: created.name,
      category: created.category,
      baseUnit: created.baseUnit,
      purchaseUnit: created.purchaseUnit,
      stock: 0,
      godownStock: {},
      avgCost: 0,
      active: true,
    };
    setLocalCreated((prev) => [...prev, newRm]);
    const defUnit = defaultPurchaseUnitName(newRm);

    if (quickCreateTargetRowId) {
      setLines((prev) =>
        prev.map((l) =>
          l.rowId === quickCreateTargetRowId
            ? { ...l, rawMaterialId: newRm.id, unit: defUnit }
            : l,
        ),
      );
    } else {
      // Find first empty row or append a new row
      setLines((prev) => {
        const emptyIdx = prev.findIndex((l) => !l.rawMaterialId);
        if (emptyIdx >= 0) {
          return prev.map((l, idx) =>
            idx === emptyIdx ? { ...l, rawMaterialId: newRm.id, unit: defUnit } : l,
          );
        }
        return [
          ...prev,
          {
            rowId: crypto.randomUUID(),
            rawMaterialId: newRm.id,
            quantity: '1',
            unit: defUnit,
            rate: '',
            gstPct: '0',
          },
        ];
      });
    }
  };

  const fillRemainingInto = (mode: 'cash' | 'upi' | 'card' | 'bank') => {
    setPaymentTouched(true);
    const others =
      (mode === 'cash' ? 0 : cashAmt) +
      (mode === 'upi' ? 0 : upiAmt) +
      (mode === 'card' ? 0 : cardAmt) +
      (mode === 'bank' ? 0 : bankAmt);
    const rem = Math.max(0, round2(grandTotal - others));
    const str = rem > 0 ? String(rem) : '';
    if (mode === 'cash') setPaidCash(str);
    if (mode === 'upi') setPaidUpi(str);
    if (mode === 'card') setPaidCard(str);
    if (mode === 'bank') setPaidBank(str);
  };

  const setAllToDue = () => {
    setPaymentTouched(true);
    setPaidCash('');
    setPaidUpi('');
    setPaidCard('');
    setPaidBank('');
  };

  const resetForm = async () => {
    setLines([createBlankLine()]);
    setSupplierName('');
    setSupplierMobile('');
    setDiscountInput('0');
    setAutoRoundOff(true);
    setPaidCash('');
    setPaidUpi('');
    setPaidCard('');
    setPaidBank('');
    setPaymentTouched(false);
    setInvoiceDate(getTodayStr());
    if (companyId) {
      try {
        const nextNo = await peekNextPurchaseNumber(companyId);
        setInvoiceNumber(nextNo);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleSavePurchase = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!companyId || !currentUser?.uid) {
      setErrorMsg('User session or company ID is missing.');
      return;
    }

    const activeLines = computedLines.filter((l) => l.rawMaterialId);
    if (activeLines.length === 0) {
      setErrorMsg('Please select at least one raw material.');
      return;
    }

    for (let i = 0; i < activeLines.length; i++) {
      const l = activeLines[i];
      if (!l.rm) {
        setErrorMsg(`Row #${i + 1}: Selected raw material was not found.`);
        return;
      }
      if (l.qty <= 0) {
        setErrorMsg(`Row #${i + 1} (${l.rm.name}): Quantity must be greater than 0.`);
        return;
      }
      if (l.rate < 0) {
        setErrorMsg(`Row #${i + 1} (${l.rm.name}): Rate cannot be negative.`);
        return;
      }
    }

    if (!invoiceNumber.trim()) {
      setErrorMsg('Invoice number is required.');
      return;
    }

    if (overpaidAmount > 0) {
      setErrorMsg(
        `Total paid (₹${totalPaid.toFixed(2)}) exceeds Grand Total (₹${grandTotal.toFixed(2)}). Please adjust payment amounts.`,
      );
      return;
    }

    const cleanSupplierName = supplierName.trim();
    const cleanSupplierMobile = supplierMobile.trim();

    if (dueAmount > 0 && (!cleanSupplierName || !cleanSupplierMobile)) {
      setErrorMsg('Supplier name and mobile number are required when there is a Due balance.');
      return;
    }

    setSaving(true);
    try {
      const invoiceDateObj = combineDateWithCurrentTime(invoiceDate);
      const invoiceDateMs = invoiceDateObj.getTime();
      const typedInvoiceNo = invoiceNumber.trim();
      const partyDocId = getPartyDocId(cleanSupplierName, cleanSupplierMobile);

      let savedInvoiceNo = typedInvoiceNo;

      await runTransaction(db, async (tx) => {
        // =====================================================================
        // 1. ALL READS FIRST
        // =====================================================================
        const purchaseRef =
          isEditMode && editPurchaseId
            ? doc(db, 'companies', companyId, 'purchases', editPurchaseId)
            : doc(collection(db, 'companies', companyId, 'purchases'));

        const existingPurchaseSnap =
          isEditMode && editPurchaseId ? await tx.get(purchaseRef) : null;
        if (isEditMode && (!existingPurchaseSnap || !existingPurchaseSnap.exists())) {
          throw new Error('The purchase bill being edited no longer exists.');
        }

        const oldPurchaseData = existingPurchaseSnap?.exists()
          ? (existingPurchaseSnap.data() as Partial<RawMaterialPurchaseDoc>)
          : null;

        const counterRef = doc(db, 'companies', companyId, 'counters', 'purchaseCounter');
        const settingsRef = doc(db, 'companies', companyId, 'settings', 'purchase-settings');

        let suggestedNumber = '';
        let nextCounterVal = 1;
        const currentFY = getFinancialYear();

        if (!isEditMode) {
          const [counterSnap, settingsSnap] = await Promise.all([
            tx.get(counterRef),
            tx.get(settingsRef),
          ]);
          const prefix = settingsSnap.exists()
            ? (settingsSnap.data().voucherPrefix as string) || 'INV'
            : 'INV';
          if (counterSnap.exists()) {
            const cData = counterSnap.data();
            nextCounterVal =
              cData.financialYear === currentFY ? Number(cData.currentNumber) || 1 : 1;
          }
          suggestedNumber = `${prefix}-${nextCounterVal}`;
          savedInvoiceNo = typedInvoiceNo || suggestedNumber;
        } else {
          savedInvoiceNo = typedInvoiceNo;
        }

        const needRegistryCheck =
          !isEditMode || savedInvoiceNo !== (oldPurchaseData?.invoiceNumber || '');
        const registryRef = doc(
          db,
          'companies',
          companyId,
          'purchaseInvoiceRegistry',
          toRegistryKey(savedInvoiceNo),
        );
        if (needRegistryCheck) {
          const registrySnap = await tx.get(registryRef);
          if (registrySnap.exists()) {
            throw new Error(`INVOICE_NUMBER_TAKEN:${savedInvoiceNo}`);
          }
        }

        // Collect all raw material IDs from old lines (if editing) + new lines
        const oldLines = Array.isArray(oldPurchaseData?.items) ? oldPurchaseData.items : [];
        const rmIds = new Set<string>();
        oldLines.forEach((ol) => {
          const id = ol.rawMaterialId || ol.productId || ol.id;
          if (id) rmIds.add(id);
        });
        activeLines.forEach((nl) => rmIds.add(nl.rawMaterialId));

        const rmSnaps = new Map<string, RawMaterial>();
        await Promise.all(
          [...rmIds].map(async (id) => {
            const s = await tx.get(rawMaterialRef(companyId, id));
            if (s.exists()) {
              rmSnaps.set(id, { id, ...(s.data() as Omit<RawMaterial, 'id'>) });
            }
          }),
        );

        // Ensure all new line raw materials exist in Firestore
        activeLines.forEach((nl) => {
          if (!rmSnaps.has(nl.rawMaterialId)) {
            throw new Error(
              `Raw material "${nl.rm?.name || nl.rawMaterialId}" no longer exists in inventory.`,
            );
          }
        });

        // Read supplier doc(s) before writes
        const supplierRef = partyDocId
          ? doc(db, 'companies', companyId, 'suppliers', partyDocId)
          : null;
        const supplierSnap = supplierRef ? await tx.get(supplierRef) : null;

        const oldPartyDocId = oldPurchaseData
          ? getPartyDocId(oldPurchaseData.partyName, oldPurchaseData.partyNumber)
          : '';
        const oldSupplierRef =
          isEditMode && oldPartyDocId && oldPartyDocId !== partyDocId
            ? doc(db, 'companies', companyId, 'suppliers', oldPartyDocId)
            : null;
        const oldSupplierSnap = oldSupplierRef ? await tx.get(oldSupplierRef) : null;

        // =====================================================================
        // 2. ALL WRITES AFTER READS
        // =====================================================================
        const runningRms = new Map<string, RawMaterial>();
        rmSnaps.forEach((rm, id) => {
          runningRms.set(id, {
            ...rm,
            godownStock: { ...(rm.godownStock || {}) },
          });
        });

        // 2a. If edit mode, reverse old movements first
        if (isEditMode && oldLines.length > 0) {
          // Reversal rows carry the OLD bill date, so the Stock Summary of that period nets to zero
          const oldCreated = oldPurchaseData?.createdAt as unknown;
          const oldDateMs =
            (oldCreated && typeof (oldCreated as { toMillis?: () => number }).toMillis === 'function'
              ? (oldCreated as { toMillis: () => number }).toMillis()
              : oldCreated instanceof Date
                ? oldCreated.getTime()
                : Number(oldCreated)) || invoiceDateMs;
          oldLines.forEach((oldLine) => {
            const oldRmId = oldLine.rawMaterialId || oldLine.productId || oldLine.id;
            if (!oldRmId || !runningRms.has(oldRmId)) return;
            const rm = runningRms.get(oldRmId)!;
            const oldBaseQty =
              Number(oldLine.baseQty) > 0
                ? round3(Number(oldLine.baseQty))
                : toBase(rm, Number(oldLine.quantity) || 0, oldLine.unit);
            if (oldBaseQty <= 0) return;

            const oldLocId = oldLine.locationId || KITCHEN_ID;
            const oldLocName =
              oldLine.locationName ||
              (oldLocId === KITCHEN_ID ? KITCHEN_NAME : 'Godown');

            // Take the old receipt's cost back out of the average before the new lines go in
            const oldUnitCost =
              Number((oldLine as { unitCost?: number }).unitCost) ||
              round6(((Number(oldLine.purchasePrice) || 0) * (Number(oldLine.quantity) || 0)) / oldBaseQty);
            const revertedAvg = avgCostWithout(rm, oldBaseQty, oldUnitCost);
            rm.avgCost = revertedAvg;

            if (oldLocId === KITCHEN_ID) {
              rm.stock = round3((Number(rm.stock) || 0) - oldBaseQty);
            } else {
              rm.godownStock = {
                ...(rm.godownStock || {}),
                [oldLocId]: round3((Number(rm.godownStock?.[oldLocId]) || 0) - oldBaseQty),
              };
            }

            queueMovement(tx, companyId, {
              rawMaterialId: oldRmId,
              rawMaterialName: oldLine.name || rm.name,
              type: 'purchase',
              qty: -oldBaseQty,
              locationId: oldLocId,
              locationName: oldLocName,
              date: oldDateMs,
              refType: 'purchase',
              refId: purchaseRef.id,
              refNo: oldPurchaseData?.invoiceNumber || savedInvoiceNo,
              unitCost: oldUnitCost,
              note: 'Purchase edit reversal',
            }, revertedAvg);
          });
        }

        // 2b. Apply new lines & build purchase items array
        const formattedPurchaseItems: RawMaterialPurchaseLineItem[] = activeLines.map((line) => {
          const rm = runningRms.get(line.rawMaterialId)!;
          const unitDef = unitsOf(rm).find(
            (u) => u.name.toLowerCase() === line.unitName.trim().toLowerCase(),
          );
          const factor = unitDef && unitDef.factor > 0 ? unitDef.factor : 1;
          const baseQty = toBase(rm, line.qty, line.unitName);
          const perBaseUnitCost = round6(line.rate / factor);

          const newAvg = nextAvgCost(rm, baseQty, perBaseUnitCost);
          rm.avgCost = newAvg;
          if (receiveLocationId === KITCHEN_ID) {
            rm.stock = round3((Number(rm.stock) || 0) + baseQty);
          } else {
            rm.godownStock = {
              ...(rm.godownStock || {}),
              [receiveLocationId]: round3(
                (Number(rm.godownStock?.[receiveLocationId]) || 0) + baseQty,
              ),
            };
          }

          queueMovement(
            tx,
            companyId,
            {
              rawMaterialId: rm.id,
              rawMaterialName: rm.name,
              type: 'purchase',
              qty: baseQty,
              locationId: receiveLocationId,
              locationName: selectedLocationName,
              date: invoiceDateMs,
              refType: 'purchase',
              refId: purchaseRef.id,
              refNo: savedInvoiceNo,
              unitCost: perBaseUnitCost,
            },
            newAvg,
          );

          return {
            id: rm.id,
            productId: rm.id,
            name: rm.name,
            quantity: line.qty,
            unit: line.unitName,
            purchasePrice: line.rate,
            mrp: 0,
            taxRate: line.gstPct,
            taxAmount: line.taxAmount,
            taxableAmount: line.taxableAmount,
            amount: line.amount,
            stock: 0,
            isEditable: true,
            rawMaterialId: rm.id,
            baseQty,
            unitCost: perBaseUnitCost,
            locationId: receiveLocationId,
            locationName: selectedLocationName,
          };
        });

        // 2c. Write purchase document
        const paymentMethods: Record<string, number> = {
          cash: cashAmt,
          upi: upiAmt,
          card: cardAmt,
          bank: bankAmt,
          due: dueAmount,
        };

        const purchasePayload: RawMaterialPurchaseDoc = {
          userId: currentUser.uid,
          companyId,
          partyName: cleanSupplierName,
          partyNumber: cleanSupplierMobile,
          partyAddress: oldPurchaseData?.partyAddress || '',
          partyGstin: oldPurchaseData?.partyGstin || '',
          invoiceNumber: savedInvoiceNo,
          items: formattedPurchaseItems,
          subtotal,
          totalDiscount: discount,
          manualDiscount: discount,
          taxableAmount: subtotal,
          taxAmount: totalTax,
          gstScheme: totalTax > 0 ? 'regular' : 'none',
          taxType: 'exclusive',
          roundingOff: roundOff,
          totalAmount: grandTotal,
          dueAmount,
          paymentMethods,
          receiveLocationId,
          receiveLocationName: selectedLocationName,
          isRawMaterialPurchase: true,
          voucherName: 'Purchase',
          createdAt: invoiceDateObj,
          updatedAt: serverTimestamp(),
        };

        if (isEditMode) {
          tx.update(purchaseRef, { ...sanitizeForFirestore(purchasePayload) });
        } else {
          tx.set(purchaseRef, sanitizeForFirestore(purchasePayload));
        }

        // 2d. Registry & Counter
        if (needRegistryCheck) {
          tx.set(registryRef, {
            purchaseId: purchaseRef.id,
            createdAt: serverTimestamp(),
          });
        }

        if (!isEditMode && savedInvoiceNo === suggestedNumber) {
          tx.set(
            counterRef,
            { currentNumber: nextCounterVal + 1, financialYear: currentFY },
            { merge: false },
          );
        }

        // 2e. Supplier doc & debitBalance update
        const oldDueAmount = Number(
          oldPurchaseData?.paymentMethods?.due ?? oldPurchaseData?.dueAmount ?? 0,
        ) || 0;

        if (oldSupplierRef && oldSupplierSnap?.exists() && oldDueAmount > 0) {
          tx.set(
            oldSupplierRef,
            {
              debitBalance: increment(-oldDueAmount),
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        }

        const dueDelta =
          isEditMode && oldPartyDocId === partyDocId
            ? round2(dueAmount - oldDueAmount)
            : dueAmount;

        if (supplierRef && (dueAmount > 0 || dueDelta !== 0 || cleanSupplierName || cleanSupplierMobile)) {
          const needsCreatedAt = !supplierSnap?.exists() || !supplierSnap.data()?.createdAt;
          const supplierPatch: Record<string, unknown> = {
            name: cleanSupplierName,
            number: cleanSupplierMobile,
            phoneNumber: cleanSupplierMobile,
            companyId,
            updatedAt: serverTimestamp(),
            lastPurchaseAt: serverTimestamp(),
          };
          if (needsCreatedAt) {
            supplierPatch.createdAt = serverTimestamp();
          }
          if (dueDelta !== 0) {
            supplierPatch.debitBalance = increment(dueDelta);
          }
          tx.set(supplierRef, supplierPatch, { merge: true });
        }
      });

      await clearPurchaseReportCache(companyId);

      if (isEditMode) {
        setSuccessMsg(`Purchase #${savedInvoiceNo} updated!`);
        setTimeout(() => {
          navigate(ROUTES.JOURNAL);
        }, 1200);
      } else {
        setSuccessMsg(`Purchase #${savedInvoiceNo} saved!`);
        await resetForm();
        setTimeout(() => {
          setSuccessMsg(null);
        }, 3500);
      }
    } catch (err: unknown) {
      console.error('Error saving raw material purchase:', err);
      const rawMessage = err instanceof Error ? err.message : 'Failed to save purchase.';
      if (rawMessage.startsWith('INVOICE_NUMBER_TAKEN:')) {
        const takenNo = rawMessage.split(':')[1] || invoiceNumber;
        setErrorMsg(`Invoice number "${takenNo}" is already used. Please enter a different invoice number.`);
      } else {
        setErrorMsg(rawMessage);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#eef2ff] pb-24 font-poppins text-[#0f172b]">
      {/* Top Bar */}
      <div className="sticky top-0 z-30 border-b border-[#dfe6fb] bg-white/95 backdrop-blur px-4 py-3 shadow-xs">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <BackButton />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-[#0f172b]">
                  {isEditMode ? 'Edit Raw Material Purchase' : 'Raw Material Purchase'}
                </h1>
                <span className="rounded-sm bg-[#eef2ff] px-2 py-0.5 text-[11px] font-semibold text-[#155dfc]">
                  Restaurant Mode
                </span>
              </div>
              <p className="text-xs text-[#5b6b86]">
                Record supplier bills into Kitchen or Godown raw-material stock
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openQuickCreateForRow(null)}
              className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-[#dfe6fb] bg-[#eef2ff] px-3 text-xs font-semibold text-[#155dfc] hover:bg-[#dfe6fb]/70 transition-colors"
            >
              <Plus size={15} />
              <span className="hidden sm:inline">New Raw Material</span>
            </button>
            <button
              type="button"
              onClick={handleSavePurchase}
              disabled={saving || loadingEditDoc}
              className="inline-flex h-9 items-center gap-1.5 rounded-sm bg-[#155dfc] px-4 text-xs font-semibold text-white hover:bg-[#1447e6] disabled:opacity-50 transition-colors"
            >
              <Save size={15} />
              {saving ? 'Saving...' : isEditMode ? 'Update Purchase' : 'Save Purchase'}
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-3 sm:px-4 pt-4 space-y-4">
        {/* Alerts */}
        {errorMsg && (
          <div className="flex items-start gap-2.5 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span className="flex-1">{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="flex items-center gap-2.5 rounded-sm border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">
            <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Header Card */}
        <div className="rounded-sm border border-[#dfe6fb] bg-white p-4 shadow-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Invoice Number */}
            <div>
              <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[#5b6b86]">
                <FileText size={12} />
                Invoice No *
              </label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="e.g. INV-1"
                className={INPUT_CLS}
              />
            </div>

            {/* Date */}
            <div>
              <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[#5b6b86]">
                <Calendar size={12} />
                Invoice Date *
              </label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className={INPUT_CLS}
              />
            </div>

            {/* Supplier Name + Autocomplete */}
            <div ref={supplierBoxRef} className="relative">
              <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[#5b6b86]">
                <User size={12} />
                Supplier Name {dueAmount > 0 ? '*' : ''}
              </label>
              <input
                type="text"
                value={supplierName}
                onChange={(e) => {
                  setSupplierName(e.target.value);
                  triggerSupplierSearch(e.target.value, 'name');
                }}
                placeholder="Search or enter supplier"
                className={INPUT_CLS}
              />
              {showSupplierDropdown && supplierHits.length > 0 && (
                <div className="absolute left-0 top-full z-40 mt-1 w-full rounded-sm border border-[#dfe6fb] bg-white shadow-lg divide-y divide-[#dfe6fb]">
                  {supplierHits.map((hit) => (
                    <button
                      key={hit.id}
                      type="button"
                      onClick={() => {
                        setSupplierName(hit.name);
                        setSupplierMobile(hit.number);
                        setShowSupplierDropdown(false);
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-[#eef2ff]"
                    >
                      <span className="font-semibold text-[#0f172b] truncate">{hit.name}</span>
                      <span className="text-[11px] text-[#5b6b86] shrink-0 ml-2">{hit.number}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Supplier Mobile */}
            <div>
              <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[#5b6b86]">
                <Phone size={12} />
                Supplier Mobile {dueAmount > 0 ? '*' : ''}
              </label>
              <input
                type="tel"
                value={supplierMobile}
                onChange={(e) => {
                  setSupplierMobile(e.target.value);
                  triggerSupplierSearch(e.target.value, 'number');
                }}
                placeholder="10-digit mobile"
                className={INPUT_CLS}
              />
            </div>

            {/* Receive Into */}
            <div>
              <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[#5b6b86]">
                <Warehouse size={12} />
                Receive Into *
              </label>
              <select
                value={receiveLocationId}
                onChange={(e) => setReceiveLocationId(e.target.value)}
                className={INPUT_CLS}
              >
                {locationOptions.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Lines Card */}
        <div className="rounded-sm border border-[#dfe6fb] bg-white shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#dfe6fb] px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-[#0f172b]">Raw Material Lines</h2>
              <p className="text-[11px] text-[#5b6b86]">
                {restaurantLoading
                  ? 'Loading raw materials...'
                  : `${allRawMaterials.length} raw materials available · Receiving into ${selectedLocationName}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openQuickCreateForRow(null)}
                className="inline-flex h-8 items-center gap-1 rounded-sm border border-[#dfe6fb] bg-white px-2.5 text-xs font-medium text-[#155dfc] hover:bg-[#eef2ff]"
              >
                <Plus size={14} />
                + New raw material
              </button>
              <button
                type="button"
                onClick={handleAddRow}
                className="inline-flex h-8 items-center gap-1 rounded-sm bg-[#155dfc] px-3 text-xs font-semibold text-white hover:bg-[#1447e6]"
              >
                <Plus size={14} />
                Add Row
              </button>
            </div>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-visible">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[#dfe6fb] bg-[#f8faff] text-[11px] font-semibold uppercase tracking-wider text-[#5b6b86]">
                  <th className="py-2.5 pl-4 pr-2 w-10">#</th>
                  <th className="py-2.5 px-2 min-w-[240px]">Raw Material *</th>
                  <th className="py-2.5 px-2 w-28">Quantity *</th>
                  <th className="py-2.5 px-2 w-32">Unit *</th>
                  <th className="py-2.5 px-2 w-40">Rate / Unit (₹) *</th>
                  <th className="py-2.5 px-2 w-28">GST %</th>
                  <th className="py-2.5 px-2 w-32 text-right">Amount (₹)</th>
                  <th className="py-2.5 pl-2 pr-4 w-12 text-center">Del</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#dfe6fb]">
                {computedLines.map((line, index) => (
                  <tr key={line.rowId} className="align-top hover:bg-[#f8faff]/60">
                    <td className="py-3 pl-4 pr-2 text-xs font-semibold text-[#5b6b86]">
                      {index + 1}
                    </td>
                    <td className="py-2.5 px-2">
                      <RpRawMaterialSelect
                        rawMaterials={allRawMaterials}
                        value={line.rawMaterialId}
                        locationId={receiveLocationId}
                        onChange={(rm) => handleSelectRawMaterial(line.rowId, rm)}
                        onQuickCreate={(prefill) => openQuickCreateForRow(line.rowId, prefill)}
                      />
                    </td>
                    <td className="py-2.5 px-2">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={line.quantity}
                        onChange={(e) => handleLineField(line.rowId, 'quantity', e.target.value)}
                        placeholder="0"
                        className={INPUT_CLS}
                      />
                      {line.rm && line.baseQty > 0 && (
                        <div className="mt-0.5 text-[10px] text-[#5b6b86] tabular-nums">
                          = {line.baseQty} {line.rm.baseUnit}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-2">
                      <select
                        value={line.unitName}
                        disabled={!line.rm}
                        onChange={(e) => handleUnitChange(line.rowId, e.target.value)}
                        className={`${INPUT_CLS} disabled:bg-slate-50`}
                      >
                        {!line.rm && <option value="">Unit</option>}
                        {line.unitList.map((u) => (
                          <option key={u.name} value={u.name}>
                            {u.name} {u.factor !== 1 ? `(${u.factor} ${line.rm?.baseUnit})` : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 px-2">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={line.rate}
                        onChange={(e) => handleLineField(line.rowId, 'rate', e.target.value)}
                        placeholder="0.00"
                        className={INPUT_CLS}
                      />
                      {line.rm && line.avgHint && (
                        <div className="mt-0.5 text-[10px] text-[#5b6b86] tabular-nums">
                          Avg: ₹{line.avgHint.cost} / {line.avgHint.unit}
                          {line.unitName &&
                            line.unitName.toLowerCase() !== line.avgHint.unit.toLowerCase() &&
                            ` (₹${line.avgInSelectedUnit}/${line.unitName})`}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-2">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        value={line.gstPct}
                        onChange={(e) => handleLineField(line.rowId, 'gstPct', e.target.value)}
                        placeholder="0"
                        className={INPUT_CLS}
                      />
                      {line.taxAmount > 0 && (
                        <div className="mt-0.5 text-[10px] text-[#5b6b86] tabular-nums">
                          Tax: ₹{line.taxAmount.toFixed(2)}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-2 text-right text-xs font-semibold text-[#0f172b] tabular-nums">
                      ₹{line.amount.toFixed(2)}
                    </td>
                    <td className="py-2.5 pl-2 pr-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(line.rowId)}
                        title="Remove row"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-[#5b6b86] hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked Cards */}
          <div className="md:hidden divide-y divide-[#dfe6fb]">
            {computedLines.map((line, index) => (
              <div key={line.rowId} className="p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#5b6b86]">Item #{index + 1}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveRow(line.rowId)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-[#5b6b86] hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[#5b6b86] mb-1">
                    Raw Material *
                  </label>
                  <RpRawMaterialSelect
                    rawMaterials={allRawMaterials}
                    value={line.rawMaterialId}
                    locationId={receiveLocationId}
                    onChange={(rm) => handleSelectRawMaterial(line.rowId, rm)}
                    onQuickCreate={(prefill) => openQuickCreateForRow(line.rowId, prefill)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-medium text-[#5b6b86] mb-1">
                      Quantity *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={line.quantity}
                      onChange={(e) => handleLineField(line.rowId, 'quantity', e.target.value)}
                      className={INPUT_CLS}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#5b6b86] mb-1">
                      Unit *
                    </label>
                    <select
                      value={line.unitName}
                      disabled={!line.rm}
                      onChange={(e) => handleUnitChange(line.rowId, e.target.value)}
                      className={INPUT_CLS}
                    >
                      {!line.rm && <option value="">Unit</option>}
                      {line.unitList.map((u) => (
                        <option key={u.name} value={u.name}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-medium text-[#5b6b86] mb-1">
                      Rate / Unit (₹) *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={line.rate}
                      onChange={(e) => handleLineField(line.rowId, 'rate', e.target.value)}
                      placeholder="0.00"
                      className={INPUT_CLS}
                    />
                    {line.rm && line.avgHint && (
                      <div className="mt-0.5 text-[10px] text-[#5b6b86]">
                        Avg: ₹{line.avgHint.cost}/{line.avgHint.unit}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#5b6b86] mb-1">
                      GST % (Excl.)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={line.gstPct}
                      onChange={(e) => handleLineField(line.rowId, 'gstPct', e.target.value)}
                      className={INPUT_CLS}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 text-xs font-semibold text-[#0f172b]">
                  <span className="text-[#5b6b86]">Line Amount</span>
                  <span className="tabular-nums">₹{line.amount.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-[#dfe6fb] bg-[#f8faff] px-4 py-2.5">
            <button
              type="button"
              onClick={handleAddRow}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#155dfc] hover:underline"
            >
              <Plus size={14} />
              + Add another line
            </button>
          </div>
        </div>

        {/* Totals & Payment Split */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Payment Modes Card */}
          <div className="rounded-sm border border-[#dfe6fb] bg-white p-4 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between border-b border-[#dfe6fb] pb-2.5">
              <div>
                <h3 className="text-sm font-semibold text-[#0f172b]">Payment Modes</h3>
                <p className="text-[11px] text-[#5b6b86]">
                  Any unpaid remainder is recorded under Credit / Due
                </p>
              </div>
              <button
                type="button"
                onClick={setAllToDue}
                className="rounded-sm border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
              >
                Full Credit / Due
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Cash */}
              <div className="rounded-sm border border-[#dfe6fb] p-2.5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-[#0f172b]">
                    <Banknote size={14} className="text-emerald-600" />
                    Cash
                  </span>
                  <button
                    type="button"
                    onClick={() => fillRemainingInto('cash')}
                    className="text-[11px] font-semibold text-[#155dfc] hover:underline"
                  >
                    Fill remaining
                  </button>
                </div>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={paidCash}
                  onChange={(e) => {
                    setPaymentTouched(true);
                    setPaidCash(e.target.value);
                  }}
                  placeholder="0.00"
                  className={INPUT_CLS}
                />
              </div>

              {/* UPI */}
              <div className="rounded-sm border border-[#dfe6fb] p-2.5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-[#0f172b]">
                    <Wallet size={14} className="text-[#155dfc]" />
                    UPI
                  </span>
                  <button
                    type="button"
                    onClick={() => fillRemainingInto('upi')}
                    className="text-[11px] font-semibold text-[#155dfc] hover:underline"
                  >
                    Fill remaining
                  </button>
                </div>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={paidUpi}
                  onChange={(e) => {
                    setPaymentTouched(true);
                    setPaidUpi(e.target.value);
                  }}
                  placeholder="0.00"
                  className={INPUT_CLS}
                />
              </div>

              {/* Card */}
              <div className="rounded-sm border border-[#dfe6fb] p-2.5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-[#0f172b]">
                    <CreditCard size={14} className="text-purple-600" />
                    Card
                  </span>
                  <button
                    type="button"
                    onClick={() => fillRemainingInto('card')}
                    className="text-[11px] font-semibold text-[#155dfc] hover:underline"
                  >
                    Fill remaining
                  </button>
                </div>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={paidCard}
                  onChange={(e) => {
                    setPaymentTouched(true);
                    setPaidCard(e.target.value);
                  }}
                  placeholder="0.00"
                  className={INPUT_CLS}
                />
              </div>

              {/* Bank Transfer */}
              <div className="rounded-sm border border-[#dfe6fb] p-2.5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-[#0f172b]">
                    <Building2 size={14} className="text-slate-600" />
                    Bank Transfer
                  </span>
                  <button
                    type="button"
                    onClick={() => fillRemainingInto('bank')}
                    className="text-[11px] font-semibold text-[#155dfc] hover:underline"
                  >
                    Fill remaining
                  </button>
                </div>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={paidBank}
                  onChange={(e) => {
                    setPaymentTouched(true);
                    setPaidBank(e.target.value);
                  }}
                  placeholder="0.00"
                  className={INPUT_CLS}
                />
              </div>
            </div>

            {/* Credit / Due Remainder */}
            <div
              className={`flex items-center justify-between rounded-sm border px-3 py-2.5 ${
                dueAmount > 0
                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-[#dfe6fb] bg-[#f8faff] text-[#0f172b]'
              }`}
            >
              <div className="flex items-center gap-2">
                <Clock size={16} className={dueAmount > 0 ? 'text-amber-600' : 'text-[#5b6b86]'} />
                <div>
                  <div className="text-xs font-semibold">Credit / Due Remainder</div>
                  {dueAmount > 0 && (!supplierName.trim() || !supplierMobile.trim()) && (
                    <div className="text-[11px] text-red-600 font-medium">
                      Supplier name & mobile are required for due bills
                    </div>
                  )}
                </div>
              </div>
              <span className="text-sm font-bold tabular-nums">₹{dueAmount.toFixed(2)}</span>
            </div>
          </div>

          {/* Totals Summary Card */}
          <div className="rounded-sm border border-[#dfe6fb] bg-white p-4 shadow-xs flex flex-col justify-between space-y-3">
            <div className="space-y-2.5">
              <h3 className="text-sm font-semibold text-[#0f172b] border-b border-[#dfe6fb] pb-2.5">
                Bill Summary
              </h3>

              <div className="flex items-center justify-between text-xs">
                <span className="text-[#5b6b86]">Subtotal (Taxable)</span>
                <span className="font-semibold text-[#0f172b] tabular-nums">
                  ₹{subtotal.toFixed(2)}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-[#5b6b86]">Total GST (Tax-exclusive)</span>
                <span className="font-semibold text-[#0f172b] tabular-nums">
                  ₹{totalTax.toFixed(2)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4 text-xs">
                <span className="text-[#5b6b86]">Discount (₹)</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  className="h-8 w-28 rounded-sm border border-[#dfe6fb] bg-white px-2 text-right text-xs font-semibold text-[#0f172b] tabular-nums focus:border-[#155dfc] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between text-xs">
                <label className="inline-flex items-center gap-2 text-[#5b6b86] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRoundOff}
                    onChange={(e) => setAutoRoundOff(e.target.checked)}
                    className="h-3.5 w-3.5 rounded-sm accent-[#155dfc]"
                  />
                  Round-off
                </label>
                <span className="font-semibold text-[#0f172b] tabular-nums">
                  {roundOff >= 0 ? `+₹${roundOff.toFixed(2)}` : `-₹${Math.abs(roundOff).toFixed(2)}`}
                </span>
              </div>

              <div className="flex items-center justify-between border-t border-[#dfe6fb] pt-3 text-base font-bold text-[#0f172b]">
                <span>Grand Total</span>
                <span className="text-[#155dfc] tabular-nums">₹{grandTotal.toFixed(2)}</span>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleSavePurchase}
                disabled={saving || loadingEditDoc}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-sm bg-[#155dfc] px-4 text-sm font-semibold text-white hover:bg-[#1447e6] disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Save size={17} />
                {saving
                  ? 'Saving Purchase...'
                  : isEditMode
                    ? `Update Purchase (₹${grandTotal.toFixed(2)})`
                    : `Save Purchase (₹${grandTotal.toFixed(2)})`}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Create Raw Material Modal */}
      <RpQuickCreateModal
        isOpen={quickCreateOpen}
        companyId={companyId}
        categories={categories}
        initialName={quickCreatePrefill}
        onClose={() => setQuickCreateOpen(false)}
        onCreated={handleQuickCreated}
      />
    </div>
  );
};

export default RestaurantPurchase;
