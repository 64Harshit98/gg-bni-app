import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth, useDatabase } from '../../context/auth-context';
import { ROUTES } from '../../constants/routes.constants';
import { db } from '../../lib/Firebase';
import { collection, serverTimestamp, doc, increment as firebaseIncrement, runTransaction, getDocs, query, where, getDoc, onSnapshot, } from 'firebase/firestore';
import { type PaymentCompletionData } from '../../Components/PaymentDrawer';
import { peekNextInvoiceNumber } from '../../UseComponents/InvoiceCounter';
import { Permissions, ROLES, State } from '../../enums';
import type { User } from '../../Role/permission';
import { useSalesSettings } from '../../context/SettingsContext';
import { Spinner } from '../../constants/Spinner';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../../lib/Firebase';
import { generatePdfBlob } from '../../UseComponents/pdfGenerator';
import { getFirestoreOperations } from '../../lib/ItemsFirebase';
import { botMasterService } from '../Additional/Whatsapp/WhatsappApi';
import { PLAN_ALLOWED_FEATURES } from '../Settings/SalesSetting';
import { type CartEntry } from '../../Components/CardGrid';
import type { SalesItem, CalcKey } from './SalesComponents/Salestypes';
import { applyRounding, toCurrency } from './SalesComponents/Salescalculations';
import type { Item } from '../../constants/models';
import { useSalesCart } from './SalesComponents/Usesalescart';
import { useSalesTotals } from './SalesComponents/Usesalestotals';
// ── View components ────────────────────────────────────────────────────────────
import SalesCardView from './SalesComponents/Salescardview';
import SalesListView from './SalesComponents/Saleslistview';
import SalesCalculatorView from './SalesComponents/Salescalculatorview';

// ─── tiny helpers ─────────────────────────────────────────────────────────────
const generateSafeId = () =>
    crypto.randomUUID?.() ?? 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);

const pick = (obj: any, key: string, fallback = '') => obj?.[key] || fallback;

// ─────────────────────────────────────────────────────────────────────────────
const Sales: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { currentUser, loading: authLoading, hasPermission } = useAuth();
    const dbOperations = useDatabase();
    const { salesSettings: rawSettings, loadingSettings } = useSalesSettings();

    // Enforce plan limits on view type
    const salesSettings = useMemo(() => {
        if (!rawSettings) return null;
        const activePlan = currentUser?.Subscription?.pack?.toLowerCase() || 'pos_basic';
        const allowedFeatures = PLAN_ALLOWED_FEATURES[activePlan] || PLAN_ALLOWED_FEATURES['pos_basic'];
        const validView = allowedFeatures.allowedViews?.includes(rawSettings.salesViewType || 'list')
            ? rawSettings.salesViewType
            : allowedFeatures.allowedViews[0];
        return { ...rawSettings, salesViewType: validView };
    }, [rawSettings, currentUser?.Subscription?.pack]);

    const invoiceToEdit = location.state?.invoiceData;
    const isEditMode = location.state?.isEditMode === true && !!invoiceToEdit;

    // ─── Barcode link state ───────────────────────────────────────────────────
    const [barcodeToLink, setBarcodeToLink] = useState<string | null>(null);
    const [isBarcodeLinkModalOpen, setIsBarcodeLinkModalOpen] = useState(false);
    const [isLinkingBarcode, setIsLinkingBarcode] = useState(false);

    // ─── UI state ─────────────────────────────────────────────────────────────
    const [modal, setModal] = useState<{ message: string; type: State; onConfirm?: () => void } | null>(null);
    const [savedBillData, setSavedBillData] = useState<{ id: string; number: string; invoiceData?: any } | null>(null);
    const [sendingPdf, setSendingPdf] = useState(false);
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const isInvoiceNumberManuallyEdited = useRef(false);
    const [invoiceDate, setInvoiceDate] = useState<string>(() => {
        if (location.state?.isEditMode === true && location.state?.invoiceData?.createdAt) {
            const original = new Date(location.state.invoiceData.createdAt);
            if (!isNaN(original.getTime())) {
                return `${original.getFullYear()}-${String(original.getMonth() + 1).padStart(2, '0')}-${String(original.getDate()).padStart(2, '0')}`;
            }
        }
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;});
    const [activeTaxMode, setActiveTaxMode] = useState<'inclusive' | 'exclusive' | 'exempt'>('exclusive');
    const [availableItems, setAvailableItems] = useState<Item[]>([]);
    const [pageIsLoading, setPageIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const longPressTimer = useRef<NodeJS.Timeout | null>(null);
    const [isDiscountLocked, setIsDiscountLocked] = useState(false);
    const [discountInfo, setDiscountInfo] = useState<string | null>(null);
    const [isPriceLocked, setIsPriceLocked] = useState(true);
    const [priceInfo, setPriceInfo] = useState<string | null>(null);
    const [workers, setWorkers] = useState<User[]>([]);
    const [selectedWorker, setSelectedWorker] = useState<User | null>(null);
    const [settingsDocId, setSettingsDocId] = useState<string | null>(null);
    const [listSelectedCategory] = useState('All');
    const [itemGroupMap, setItemGroupMap] = useState<Record<string, string>>({});
    const [isFooterExpanded, setIsFooterExpanded] = useState(false);
    const [calcInput, setCalcInput] = useState('');
    const [stagedCalcInput, setStagedCalcInput] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [selectedItemForEdit, setSelectedItemForEdit] = useState<Item | null>(null);
    const [isItemDrawerOpen, setIsItemDrawerOpen] = useState(false);

    // ─── Derived flags ────────────────────────────────────────────────────────
    const userRole = currentUser?.role || '';
    const isManager = userRole === ROLES.MANAGER || userRole === ROLES.OWNER;
    const hideMrp = (salesSettings as any)?.hideMrp ?? false;
    const isCardView = salesSettings?.salesViewType === 'card';
    const isCardImageView = isCardView && salesSettings?.cardViewWithPhoto !== false;
    // FIX: was hardcoded to `true` — must derive from settings
    const isCalculatorView = salesSettings?.salesViewType === 'calculator';
    const showTaxRow = activeTaxMode !== 'exempt';

    // ─── Cart hook ────────────────────────────────────────────────────────────
    const {
        items,
        setItems,
        addItemToCart,
        handleQuantityChange,
        handleDeleteItem,
        handleDiscountChange,
        handleCustomPriceChange,
        handleCustomPriceBlur,
        handleClearCart,
        discountHandlers,
        priceHandlers,
    } = useSalesCart({
        availableItems,
        salesSettings,
        isDiscountLocked,
        isPriceLocked,
        setIsDiscountLocked,
        setIsPriceLocked,
        setDiscountInfo,
        setPriceInfo,
        isEditMode,
        invoiceToEdit,
    });

    // ─── Totals hook ──────────────────────────────────────────────────────────
    const { subtotal, totalDiscount, roundOff, taxableAmount, taxAmount, finalAmount, totalQuantity } =
        useSalesTotals({ items, salesSettings, activeTaxMode });

    // ─── Effects ──────────────────────────────────────────────────────────────

    useEffect(() => {
        if (items.length === 0) setStagedCalcInput('');
    }, [items.length]);

    useEffect(() => {
        if (!loadingSettings && salesSettings) {
            setIsDiscountLocked(salesSettings.lockDiscountEntry ?? false);
            setIsPriceLocked(salesSettings.lockSalePriceEntry ?? false);
        }
    }, [loadingSettings, salesSettings?.lockDiscountEntry, salesSettings?.lockSalePriceEntry]);

    useEffect(() => {
        if (loadingSettings) return;
        if (isEditMode && invoiceToEdit?.taxType) {
            const t = invoiceToEdit.taxType;
            setActiveTaxMode(t === 'none' ? 'exempt' : (t === 'inclusive' || t === 'exclusive') ? t : 'exclusive');
        } else if (salesSettings) {
            if (salesSettings.gstScheme === 'none' || salesSettings.gstScheme === 'composition') {
                setActiveTaxMode('exempt');
            } else {
                setActiveTaxMode((salesSettings.taxType as any) || 'exclusive');
            }
        }
    }, [loadingSettings, salesSettings, isEditMode, invoiceToEdit]);

    // Data fetch + real-time invoice counter
    useEffect(() => {
        const findSettingsDocId = async () => {
            if (!currentUser?.companyId) return;
            const snap = await getDocs(
                query(collection(db, 'companies', currentUser.companyId, 'settings'), where('settingType', '==', 'sales'))
            );
            if (!snap.empty) setSettingsDocId(snap.docs[0].id);
        };
        findSettingsDocId();

        if (authLoading || !currentUser || !dbOperations || loadingSettings) {
            setPageIsLoading(authLoading || loadingSettings);
            return;
        }

        let unsubscribeCounter: () => void = () => { };
        if (!isEditMode && currentUser?.companyId) {
            const counterRef = doc(db, 'companies', currentUser.companyId, 'counters', 'invoiceCounter');
            const settingsRef = doc(db, 'companies', currentUser.companyId, 'settings', 'sales-settings');
            unsubscribeCounter = onSnapshot(counterRef, async (docSnap) => {
                if (isInvoiceNumberManuallyEdited.current) return;
                const settingsSnap = await getDoc(settingsRef);
                const prefix = settingsSnap.exists() ? (settingsSnap.data().voucherPrefix || 'INV') : 'INV';
                setInvoiceNumber(`${prefix}-${docSnap.exists() ? (docSnap.data().currentNumber || 1) : 1}`);
            });
        }

        const fetchData = async () => {
            try {
                setPageIsLoading(true);
                setError(null);
                const [fetchedItems, fetchedWorkers] = await Promise.all([
                    dbOperations.syncItems(),
                    dbOperations.getWorkers(),
                ]);
                setAvailableItems(fetchedItems);

                if (isEditMode && invoiceToEdit?.invoiceNumber) {
                    setInvoiceNumber(invoiceToEdit.invoiceNumber);
                }

                setWorkers(fetchedWorkers);

                if (currentUser?.companyId) {
                    try {
                        const groupsSnap = await getDocs(collection(db, 'companies', currentUser.companyId, 'itemGroups'));
                        const groupMap: Record<string, string> = {};
                        groupsSnap.docs.forEach(d => {
                            const data = d.data();
                            groupMap[d.id] = data.name || data.groupName || 'Unknown Group';
                        });
                        setItemGroupMap(groupMap);
                    } catch (e) { console.error(e); }
                }

                setSelectedWorker(
                    isEditMode
                        ? fetchedWorkers.find((u: User) => u.uid === invoiceToEdit?.salesmanId) || null
                        : fetchedWorkers.find((u: User) => u.uid === currentUser.uid) || null
                );
            } catch (err) {
                console.error(err);
                setError('Failed to load initial page data.');
            } finally {
                setPageIsLoading(false);
            }
        };

        fetchData();
        return () => unsubscribeCounter();
    }, [authLoading, currentUser, dbOperations, isEditMode, invoiceToEdit, loadingSettings]);

    // Persist cart draft
    useEffect(() => {
        if (!isEditMode) localStorage.setItem('sales_cart_draft', JSON.stringify(items));
    }, [items, isEditMode]);

    // ─── Memos ────────────────────────────────────────────────────────────────
    const categories = useMemo(() => {
        const groups = new Set(availableItems.map(i => i.itemGroupId || 'Others'));
        return ['All', ...Array.from(groups).sort()];
    }, [availableItems]);

    const cartEntries: CartEntry[] = useMemo(() =>
        items.map(i => ({ cartId: i.id, productId: i.productId, quantity: i.quantity, customPrice: i.customPrice })),
        [items]);

    const amountToPayNow = useMemo(() => finalAmount, [finalAmount]);

    const displayItems = useMemo(() =>
        listSelectedCategory === 'All' ? items : items.filter(i => (i.itemGroupId || 'Others') === listSelectedCategory),
        [items, listSelectedCategory]);

    // ─── Calculator keypad handlers ───────────────────────────────────────────
    const displayRef = useRef<HTMLInputElement>(null);

    const insertAtCursor = (val: string) => {
        const input = displayRef.current;
        if (!input) { setCalcInput(prev => prev + val); return; }
        const start = input.selectionStart ?? 0;
        const end = input.selectionEnd ?? 0;
        const isAtEnd = start === (input.value?.length || 0);
        setCalcInput(prev => {
            const newVal = isAtEnd ? prev + val : prev.slice(0, start) + val + prev.slice(end);
            setTimeout(() => {
                input.focus();
                const newPos = isAtEnd ? newVal.length : start + val.length;
                input.setSelectionRange(newPos, newPos);
            }, 0);
            return newVal;
        });
    };

    const deleteAtCursor = () => {
        const input = displayRef.current;
        if (!input) return;
        const start = input.selectionStart ?? 0;
        const end = input.selectionEnd ?? 0;
        const isAtEnd = start === (input.value?.length || 0);
        setCalcInput(prev => {
            if (!prev) return prev;
            let newVal: string, newPos: number;
            if (isAtEnd) { newVal = prev.slice(0, -1); newPos = newVal.length; }
            else if (start === end && start > 0) { newVal = prev.slice(0, start - 1) + prev.slice(end); newPos = start - 1; }
            else if (start !== end) { newVal = prev.slice(0, start) + prev.slice(end); newPos = start; }
            else return prev;
            setTimeout(() => { input.focus(); input.setSelectionRange(newPos, newPos); }, 0);
            return newVal;
        });
    };

    const handlePointerDown = (key: CalcKey) => {
        if (key.value === 'Backspace') {
            longPressTimer.current = setTimeout(() => {
                handleKeypadPress({ ...key, value: 'Clear' });
                longPressTimer.current = null;
            }, 1000);
        }
    };

    const handlePointerUp = (key: CalcKey) => {
        if (key.value === 'Backspace') {
            if (longPressTimer.current) {
                clearTimeout(longPressTimer.current);
                handleKeypadPress(key);
                longPressTimer.current = null;
            }
        } else {
            handleKeypadPress(key);
        }
    };

    const handlePointerLeave = (key: CalcKey) => {
        if (key.value === 'Backspace' && longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handleKeypadPress = (key: CalcKey) => {
        if (key.type === 'function') {
            if (key.value === 'Backspace') deleteAtCursor();
            else if (key.value === 'Clear') {
                if (calcInput === '') {
                    if (items.length > 0 && window.confirm('Are you sure you want to clear the entire bill?')) setItems([]);
                } else setCalcInput('');
            }
        } else {
            insertAtCursor(key.value);
        }
    };

    // Parse the calculator equation into SalesItems
    const parseFullEquation = (equation: string): { items: SalesItem[]; total: number } => {
        if (!equation.trim()) return { items: [], total: 0 };
        const segments = equation.replace(/-/g, '+-').split('+');
        const newItems: SalesItem[] = [];
        let grandTotal = 0;
        segments.forEach(segment => {
            if (!segment.trim()) return;
            let segmentValue = 0;
            if (segment.includes('%')) {
                const num = parseFloat(segment.replace('%', ''));
                if (!isNaN(num)) segmentValue = (grandTotal * num) / 100;
            } else {
                const parts = segment.split('*');
                let sub = 1, hasValid = false;
                parts.forEach(n => { const num = parseFloat(n); if (!isNaN(num)) { sub *= num; hasValid = true; } });
                if (hasValid) segmentValue = sub;
            }
            if (!isNaN(segmentValue) && segmentValue !== 0) {
                newItems.push({
                    id: generateSafeId(),
                    productId: generateSafeId(),
                    name: segment.replace('*', ' x '),
                    mrp: segmentValue,
                    salesPrice: segmentValue,
                    customPrice: segmentValue,
                    quantity: 1,
                    discount: 0,
                    isEditable: true,
                    purchasePrice: 0,
                    tax: salesSettings?.defaultTaxRate || 0,
                    itemGroupId: 'calculator',
                    stock: 0,
                    amount: segmentValue,
                    barcode: '',
                    restockQuantity: 0,
                    unit: 'Bill',
                    unitMultiplier: 1,
                    packetSize: 1,
                    isCustomAmount: true,
                });
                grandTotal += segmentValue;
            }
        });
        return { items: newItems, total: grandTotal };
    };

    const parsedData = parseFullEquation(calcInput);
    const liveTotal = finalAmount + parsedData.total;
    const liveItemCount = items.length + parsedData.items.length;

    // Physical keyboard handler for calculator view
    useEffect(() => {
        if (!isCalculatorView) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            const k = e.key;
            if (/^[0-9*.\-+]$/.test(k)) setCalcInput(prev => prev + k);
            else if (k === 'Enter' || k === '=') { e.preventDefault(); handleCheckoutClick(); }
            else if (k === 'Backspace') setCalcInput(prev => prev.slice(0, -1));
            else if (k.toLowerCase() === 'c' || k === 'Escape') {
                if (calcInput === '') {
                    if (items.length > 0 && window.confirm('Are you sure you want to clear the bill?')) setItems([]);
                } else setCalcInput('');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isCalculatorView, calcInput, items.length]);

    // ─── Checkout ─────────────────────────────────────────────────────────────
    const handleCheckoutClick = () => {
        if (calcInput.trim()) {
            const stagedItems = parsedData.items.map(i => ({ ...i, isStagedCalcItem: true }));
            setStagedCalcInput(calcInput);
            setItems(prev => {
                const order = salesSettings?.cartInsertionOrder || 'top';
                return order === 'top' ? [...stagedItems, ...prev] : [...prev, ...stagedItems];
            });
            setCalcInput('');
        }
        setTimeout(() => {
            if (items.length > 0 || parsedData.items.length > 0) setIsDrawerOpen(true);
            else setModal({ message: 'Please add at least one item.', type: State.INFO });
        }, 10);
    };

    // ─── Item edit drawer ─────────────────────────────────────────────────────
    const handleOpenEditDrawer = (item: Item) => { setSelectedItemForEdit(item); setIsItemDrawerOpen(true); };
    const handleCloseEditDrawer = () => { setIsItemDrawerOpen(false); setTimeout(() => setSelectedItemForEdit(null), 300); };
    const handleSaveSuccess = (updatedItemData: Partial<Item>) => {
    setAvailableItems(prev => prev.map(item =>
        item.id === selectedItemForEdit?.id ? { ...item, ...updatedItemData, id: item.id } as Item : item
    ));

    const updateForCart: Partial<SalesItem> = { ...updatedItemData };
    if ((updateForCart as any).Stock !== undefined) {
        updateForCart.stock = (updateForCart as any).Stock;
        delete (updateForCart as any).Stock;
    }
    Object.keys(updateForCart).forEach(key => {
        if (updateForCart[key as keyof typeof updateForCart] === undefined)
            delete updateForCart[key as keyof typeof updateForCart];
    });

    setItems(prev => prev.map(c => {
        if (c.productId !== selectedItemForEdit?.id && c.id !== selectedItemForEdit?.id) return c;

        const updated = { ...c, ...updateForCart } as SalesItem;

        // Recompute customPrice from updated salesPrice/mrp
        const newMrp = Number(updated.mrp || 0);
        const newSalesPrice = Number(updated.salesPrice || 0);
        const currentDiscount = updated.discount || 0;

        let newCustomPrice: number;
        if (newSalesPrice > 0) {
            newCustomPrice = newSalesPrice;
            // Also update discount to reflect new salesPrice vs mrp
            if (newMrp > 0) {
                updated.discount = parseFloat((((newMrp - newSalesPrice) / newMrp) * 100).toFixed(2));
            }
        } else if (newMrp > 0) {
            newCustomPrice = newMrp * (1 - currentDiscount / 100);
        } else {
            newCustomPrice = updated.customPrice as number || 0;
        }

        updated.customPrice = newCustomPrice;
        return updated;
    }));
};

    // ─── Barcode ──────────────────────────────────────────────────────────────

    const closeBarcodeLinkModal = () => {
        setIsBarcodeLinkModalOpen(false);
        setBarcodeToLink(null);
    };

    const handleLinkScannedBarcode = async (selectedItem: Item) => {
        if (!barcodeToLink || !dbOperations) return;
        if (!selectedItem.id) {
            setModal({ message: 'Selected item is invalid. Please try another item.', type: State.ERROR });
            return;
        }
        setIsLinkingBarcode(true);
        try {
            await dbOperations.updateItem(selectedItem.id, { barcode: barcodeToLink });
            const updatedItem: Item = { ...selectedItem, barcode: barcodeToLink };
            setAvailableItems(prev => {
                const exists = prev.some(item => item.id === selectedItem.id);
                if (!exists) return [...prev, updatedItem];
                return prev.map(item => item.id === selectedItem.id ? { ...item, barcode: barcodeToLink } : item);
            });
            addItemToCart(updatedItem);
            closeBarcodeLinkModal();
            setModal({ message: `Barcode linked to "${selectedItem.name}".`, type: State.SUCCESS });
        } catch (err) {
            console.error('Failed to link barcode:', err);
            setModal({ message: 'Failed to link barcode. Please try again.', type: State.ERROR });
        } finally {
            setIsLinkingBarcode(false);
        }
    };

    const handleBarcodeScanned = async (barcode: string) => {
        setIsScannerOpen(false);
        if (!dbOperations) return;
        const cleanBarcode = barcode.trim();
        try {
            let itemToAdd: Item | null | undefined = availableItems.find(item => item.barcode === cleanBarcode);
            if (!itemToAdd) itemToAdd = await dbOperations.getItemByBarcode(cleanBarcode);
            if (itemToAdd) {
                addItemToCart(itemToAdd);
                setAvailableItems(prev => prev.find(p => p.id === itemToAdd!.id) ? prev : [...prev, itemToAdd!]);
            } else {
                const hasAnyItemWithoutBarcode = availableItems.some(item => !(item.barcode || '').trim());
                if (!hasAnyItemWithoutBarcode) {
                    setModal({ message: `Item not found for barcode: "${cleanBarcode}"`, type: State.ERROR });
                    return;
                }
                setBarcodeToLink(cleanBarcode);
                setIsBarcodeLinkModalOpen(true);
            }
        } catch (e) {
            console.error(e);
            setModal({ message: 'Scan error occurred.', type: State.ERROR });
        }
    };

    // ─── Payment / save ───────────────────────────────────────────────────────
    const handleProceedToPayment = () => {
        if (items.length === 0) { setModal({ message: 'Please add at least one item.', type: State.INFO }); return; }
        if (salesSettings?.enableSalesmanSelection && !selectedWorker) {
            setModal({ message: 'Please select a salesman.', type: State.ERROR }); return;
        }
        if (!(salesSettings as any)?.allowNegativeStock) {
            const stockNeeds = new Map<string, number>();
            items.filter(i => i.isEditable).forEach(i => {
                const pid = i.productId;
                const required = (i.quantity || 1) * (i.unitMultiplier || 1);
                stockNeeds.set(pid, (stockNeeds.get(pid) || 0) + required);
            });
            const invalidItems: string[] = [];
            stockNeeds.forEach((needed, pid) => {
                const avail = availableItems.find(a => a.id === pid);
                if ((avail?.stock ?? 0) < needed) invalidItems.push(`${avail?.name} (Avail:${avail?.stock}, Need:${needed})`);
            });
            if (invalidItems.length > 0) {
                setModal({ message: `Insufficient stock: ${invalidItems.join(', ')}`, type: State.ERROR }); return;
            }
        }
        setIsDrawerOpen(true);
    };

    const getParsedInvoiceDate = () => {
        try {
            if (!invoiceDate) return new Date();
            const parts = invoiceDate.split('-');
            if (parts.length === 3) {
                const year = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1;
                const day = parseInt(parts[2], 10);
                if (isEditMode && invoiceToEdit?.createdAt) {
                    const originalDate = new Date(invoiceToEdit.createdAt);
                    if (!isNaN(originalDate.getTime())) {
                        originalDate.setFullYear(year);
                        originalDate.setMonth(month);
                        originalDate.setDate(day);
                        return originalDate;
                    }
                }
                const finalDate = new Date();
                finalDate.setFullYear(year);
                finalDate.setMonth(month);
                finalDate.setDate(day);
                return finalDate;
            }
        } catch (e) { console.error('Date parsing error', e); }
        return new Date();
    };

    const handleSavePayment = async (completionData: PaymentCompletionData) => {
        if (isSaving) return;
        setIsSaving(true);
        if (!currentUser?.companyId) { setIsSaving(false); return; }

        const companyId = currentUser.companyId;
        const salesman = salesSettings?.enableSalesmanSelection
            ? selectedWorker
            : workers.find(w => w.uid === currentUser.uid);
        const finalSalesman = salesman || { uid: currentUser.uid, name: currentUser.uid || 'Current User' };
        const finalGstScheme = salesSettings?.gstScheme || 'none';
        const finalTaxType = activeTaxMode === 'exempt' ? 'none' : activeTaxMode;
        const isTaxEnabled = salesSettings?.enableTax ?? true;
        const currentTaxRate = salesSettings?.defaultTaxRate ?? 0;
        const isRoundingEnabled = salesSettings?.enableRounding ?? true;
        const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;

        const formatItemsForDB = (itemsToFormat: SalesItem[]) =>
            itemsToFormat.map(({ isEditable, customPrice, ...item }) => {
                const currentDiscount = item.discount || 0;
                const currentQuantity = item.quantity || 1;

                let effectiveUnitPrice = 0;
                if (customPrice !== undefined && customPrice !== null && customPrice !== '') {
                    effectiveUnitPrice = parseFloat(String(customPrice));
                } else {
                    const basePrice = (item.mrp && item.mrp > 0) ? item.mrp : (item.salesPrice || 0);
                    effectiveUnitPrice = basePrice * (1 - currentDiscount / 100);
                }
                effectiveUnitPrice = toCurrency(applyRounding(effectiveUnitPrice, isRoundingEnabled, roundingInterval));

                const lineTotal = toCurrency(effectiveUnitPrice * currentQuantity);
                const itemSpecificTaxRate = (item.tax !== undefined && item.taxRate !== null) ? Number(item.tax) : currentTaxRate;

                let itemTaxableBase = 0, itemTaxAmount = 0, itemFinalPrice = 0;
                if (finalGstScheme === 'regular' && itemSpecificTaxRate > 0 && isTaxEnabled) {
                    if (finalTaxType === 'inclusive') {
                        itemFinalPrice = lineTotal;
                        itemTaxableBase = toCurrency(lineTotal / (1 + itemSpecificTaxRate / 100));
                        itemTaxAmount = toCurrency(lineTotal - itemTaxableBase);
                    } else {
                        itemTaxableBase = lineTotal;
                        itemTaxAmount = toCurrency(lineTotal * (itemSpecificTaxRate / 100));
                        itemFinalPrice = toCurrency(itemTaxableBase + itemTaxAmount);
                    }
                } else {
                    itemTaxableBase = lineTotal;
                    itemFinalPrice = lineTotal;
                }

                return {
                    ...item,
                    id: item.productId,
                    quantity: currentQuantity,
                    discount: currentDiscount,
                    effectiveUnitPrice,
                    finalPrice: itemFinalPrice,
                    unit: item.unit || '',
                    unitMultiplier: item.unitMultiplier || 1,
                    packetSize: item.packetSize || null,
                    taxableAmount: itemTaxableBase,
                    taxAmount: itemTaxAmount,
                    taxRate: isTaxEnabled ? itemSpecificTaxRate : 0,
                    taxType: finalTaxType,
                    discountPercentage: currentDiscount,
                };
            });

        const finalInvoiceTotal = finalAmount - completionData.discount + (completionData.extraExpenseAmount || 0);
        const totalInvoiceDiscount = totalDiscount + (completionData.discount || 0);

        const buildSaleData = (base: any) => ({
            items: formatItemsForDB(items),
            subtotal,
            discount: totalInvoiceDiscount,
            manualDiscount: completionData.discount || 0,
            revDiscount: completionData.revDiscount || 0,
            roundOff,
            taxableAmount,
            taxAmount,
            gstScheme: finalGstScheme,
            taxType: finalTaxType,
            totalAmount: finalInvoiceTotal,
            paymentMethods: completionData.paymentDetails,
            partyName: completionData.partyName,
            partyNumber: completionData.partyNumber,
            partyAddress: completionData.partyAddress || '',
            partyGstin: completionData.partyGST || '',
            salesmanId: finalSalesman.uid,
            salesmanName: finalSalesman.name,
            updatedAt: serverTimestamp(),
            shippingName: completionData.shippingName || '',
            shippingNumber: completionData.shippingNumber || '',
            shippingAddress: completionData.shippingAddress || '',
            shippingGST: completionData.shippingGST || '',
            extraExpenseName: completionData.extraExpenseName || '',
            extraExpenseAmount: completionData.extraExpenseAmount || 0,
            narration: completionData.narration || '',
            ...base,
        });

        try {
            if (isEditMode && invoiceToEdit?.id) {
                await runTransaction(db, async (transaction) => {
                    const invoiceRef = doc(db, 'companies', companyId, 'sales', invoiceToEdit.id);
                    transaction.update(invoiceRef, buildSaleData({ createdAt: getParsedInvoiceDate() }));

                    // Reconcile stock changes
                    const oldQtys = new Map<string, number>();
                    (invoiceToEdit.items || []).forEach((old: any) => {
                        const pid = old.productId || old.id;
                        oldQtys.set(pid, (oldQtys.get(pid) || 0) + (old.quantity || 1) * (old.unitMultiplier || 1));
                    });
                    const newQtys = new Map<string, number>();
                    items.forEach(i => {
                        const pid = i.productId || i.id;
                        if (pid) newQtys.set(pid, (newQtys.get(pid) || 0) + (i.quantity || 1) * (i.unitMultiplier || 1));
                    });
                    new Set([...oldQtys.keys(), ...newQtys.keys()]).forEach(pid => {
                        const diff = (newQtys.get(pid) || 0) - (oldQtys.get(pid) || 0);
                        if (diff !== 0) {
                            transaction.update(doc(db, 'companies', companyId, 'items', pid), {
                                stock: firebaseIncrement(-diff),
                                updatedAt: serverTimestamp(),
                            });
                        }
                    });
                });
                showSuccessModal('Invoice Updated', ROUTES.JOURNAL);
            } else {
                let result: any = null;
                await runTransaction(db, async (transaction) => {
                    const counterRef = doc(db, 'companies', companyId, 'counters', 'invoiceCounter');
                    const settingsRef = doc(db, 'companies', companyId, 'settings', 'sales-settings');
                    const [counterDoc, settingsDoc] = await Promise.all([
                        transaction.get(counterRef),
                        transaction.get(settingsRef),
                    ]);
                    const prefix = settingsDoc.exists() ? (settingsDoc.data().voucherPrefix || 'INV') : 'INV';
                    const nextNumber = counterDoc.exists() ? (counterDoc.data().currentNumber || 1) : 1;
                    const finalInvNo = isInvoiceNumberManuallyEdited.current
                        ? invoiceNumber
                        : `${prefix}-${nextNumber}`;

                    const newSaleRef = doc(collection(db, 'companies', companyId, 'sales'));
                    transaction.set(newSaleRef, buildSaleData({
                        createdAt: getParsedInvoiceDate(),
                        invoiceNumber: finalInvNo,
                        userId: currentUser.uid,
                        companyId,
                        voucherName: salesSettings?.voucherName ?? 'Sales',
                    }));

                    if (!isInvoiceNumberManuallyEdited.current) {
                        transaction.set(counterRef, { currentNumber: nextNumber + 1 }, { merge: true });
                    }

                    // FIX: include unitMultiplier in stock deduction
                    items.forEach(i => {
                        const pid = i.productId || i.id;
                        if (pid && !i.isCustomAmount) {
                            transaction.update(doc(db, 'companies', companyId, 'items', pid), {
                                stock: firebaseIncrement(-(i.quantity || 1) * (i.unitMultiplier || 1)),
                                updatedAt: serverTimestamp(),
                            });
                        }
                    });

                    if (settingsDocId) {
                        transaction.update(doc(db, 'companies', companyId, 'settings', settingsDocId), {
                            currentVoucherNumber: firebaseIncrement(1),
                        });
                    }

                    result = { id: newSaleRef.id, number: finalInvNo };
                });

                if (result) {
                    const finalizedItems = formatItemsForDB(items);
                    const invoiceData = {
                        id: result.id,
                        invoiceNumber: result.number,
                        amount: finalInvoiceTotal,
                        partyName: completionData.partyName || 'Cash',
                        partyNumber: completionData.partyNumber || '',
                        partyAddress: completionData.partyAddress || '',
                        partyGstin: completionData.partyGST || '',
                        createdAt: getParsedInvoiceDate(),
                        manualDiscount: completionData.discount || 0,
                        salesmanName: finalSalesman.name,
                        items: finalizedItems,
                    };
                    setIsDrawerOpen(false);
                    setSavedBillData({ id: result.id, number: result.number, invoiceData });
                    localStorage.removeItem('sales_cart_draft');
                    setItems([]);
                    isInvoiceNumberManuallyEdited.current = false;
                    setInvoiceNumber(await peekNextInvoiceNumber(currentUser.companyId));
                }
            }
        } catch (e: any) {
            console.error(e);
            setModal({ message: 'Error saving', type: State.ERROR });
        } finally {
            setIsSaving(false);
        }
    };

    // ─── PDF / WhatsApp ───────────────────────────────────────────────────────
    const preparePdfData = async (invoice: any) => {
        if (!currentUser?.companyId) return null;
        const dbOps = getFirestoreOperations(currentUser.companyId);
        const [businessInfo, fetchedItems, billSettingsSnap] = await Promise.all([
            dbOps.getBusinessInfo(),
            dbOps.syncItems(),
            getDoc(doc(db, 'companies', currentUser.companyId, 'settings', 'bill')),
        ]);
        const bs = billSettingsSnap.exists() ? billSettingsSnap.data() : {};
        return {
            gstScheme: salesSettings?.gstScheme || '',
            taxType: salesSettings?.taxType || '',
            companyName: pick(businessInfo, 'name', 'Your Company'),
            companyAddress: pick(businessInfo, 'address', 'Your Address'),
            companyContact: pick(businessInfo, 'phoneNumber', 'Your Phone'),
            companyEmail: pick(businessInfo, 'email'),
            signatureBase64: bs.signatureBase64 || '',
            companyGstin: bs.companyGstin || pick(businessInfo, 'gstin'),
            msmeNumber: bs.msmeNumber || '',
            panNumber: bs.panNumber || '',
            billDiscount: invoice.manualDiscount || 0,
            billTo: {
                name: invoice.partyName,
                address: invoice.partyAddress || '',
                phone: invoice.partyNumber || '',
                gstin: invoice.partyGstin || '',
            },
            invoice: {
                number: invoice.invoiceNumber,
                date: new Date(invoice.createdAt).toLocaleString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric',
                    hour: 'numeric', minute: 'numeric', hour12: true,
                }),
                billedBy: salesSettings?.enableSalesmanSelection ? (invoice.salesmanName || 'N/A') : '',
                roNumber: '',
            },
            items: (invoice.items || []).map((item: any, index: number) => {
                const full = fetchedItems.find((fi: any) => fi.id === item.productId || fi.id === item.id);
                return {
                    sno: index + 1,
                    name: item.name,
                    quantity: item.quantity,
                    unit: full?.unit || item.unit || 'Pcs',
                    listPrice: item.mrp,
                    gstPercent: item.taxRate || item.tax || full?.tax || 0,
                    hsn: full?.hsnSac || item.hsnSac || 'N/A',
                    discountAmount: item.discount || 0,
                    amount: item.finalPrice ?? item.mrp * item.quantity,
                };
            }),
            terms: bs.termsAndConditions || 'Goods once sold will not be taken back.',
            finalAmount: invoice.amount,
            bankDetails: {
                accountName: bs.accountName || pick(businessInfo, 'accountHolderName'),
                accountNumber: bs.accountNumber || pick(businessInfo, 'accountNumber'),
                bankName: bs.bankName || pick(businessInfo, 'bankName'),
                ifsc: bs.ifscCode || '',
            },
        };
    };

    const handleSendWhatsapp = async (invoice: any) => {
        if (!invoice.partyNumber) {
            setModal({ message: 'Customer phone number is missing.', type: State.ERROR }); return;
        }
        setSendingPdf(true);
        try {
            if (!currentUser?.companyId || !currentUser?.uid) throw new Error('User context missing.');
            const businessSnap = await getDoc(doc(db, 'companies', currentUser.companyId, 'business_info', currentUser.companyId));
            const { botMasterToken, whatsappNumber } = businessSnap.data() || {};
            if (!botMasterToken || !whatsappNumber) { setSendingPdf(false); navigate(ROUTES.WHATSAPP_PLAN); return; }

            const dataForPdf = await preparePdfData(invoice);
            if (!dataForPdf) throw new Error('Failed to prepare invoice data.');
            const pdfBlob = await generatePdfBlob(dataForPdf);
            const cleanName = `${invoice.invoiceNumber.replace(/[\/\\?%*:|"<>]/g, '-')}.pdf`;
            const storageRef = ref(storage, cleanName);
            await uploadBytes(storageRef, pdfBlob);
            const fileUrl = await getDownloadURL(storageRef);

            const message = `Hello ${invoice.partyName},\n\nHere is your invoice #${invoice.invoiceNumber}.\nAmount: ${invoice.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}\n\nThank you!`;
            const response = await botMasterService.sendPdfFromUrl(botMasterToken, whatsappNumber, invoice.partyNumber, message, fileUrl, cleanName);

            const isSuccess = Array.isArray(response)
                ? ['sent', 'delivered'].includes(response[0]?.status)
                : ['sent', 'success', 200].includes(response?.status);

            if (isSuccess) {
                setModal({ message: 'Invoice sent via WhatsApp!', type: State.SUCCESS });
                setTimeout(async () => { try { await deleteObject(storageRef); } catch (e) { console.warn('Could not auto-delete:', e); } }, 60000);
            } else throw new Error('API reported failure.');
        } catch (err) {
            console.error('WhatsApp Send Error:', err);
            setModal({ message: 'Failed to send WhatsApp invoice.', type: State.ERROR });
        } finally {
            setSendingPdf(false);
        }
    };

    const showSuccessModal = (message: string, navigateTo?: string) => {
        localStorage.removeItem('sales_cart_draft');
        setIsDrawerOpen(false);
        setModal({ message, type: State.SUCCESS });
        setTimeout(() => {
            setModal(null);
            if (navigateTo) navigate(navigateTo);
            else if (!salesSettings?.copyVoucherAfterSaving) setItems([]);
        }, 1500);
    };

    // ─── Shared prop objects ──────────────────────────────────────────────────
    const taxToggleProps = {
        activeTaxMode,
        onTaxModeChange: setActiveTaxMode,
        gstScheme: salesSettings?.gstScheme,
        lockTaxToggle: salesSettings?.lockTaxToggle ?? false,
    };

    const footerProps = {
        totalQuantity, subtotal, totalDiscount, taxAmount, finalAmount, showTaxRow,
        taxLabel: `Tax (${activeTaxMode === 'inclusive' ? 'Inc' : 'Exc'})`,
        actionLabel: isEditMode ? 'Update Invoice' : 'Proceed to Pay',
        onActionClick: handleProceedToPayment,
        disableAction: items.length === 0,
    };

    const drawerSharedProps = {
        subtotal,
        billTotal: amountToPayNow,
        onPaymentComplete: handleSavePayment,
        totalItemDiscount: totalDiscount,
        totalQuantity,
    };

    const salesDrawerEditProps = isEditMode ? {
        initialPartyName: invoiceToEdit?.partyName,
        initialPartyNumber: invoiceToEdit?.partyNumber,
        initialPaymentMethods: invoiceToEdit?.paymentMethods,
        initialDiscount: invoiceToEdit?.manualDiscount,
        initialShippingName: invoiceToEdit?.shippingName,
        initialShippingNumber: invoiceToEdit?.shippingNumber,
        initialShippingAddress: invoiceToEdit?.shippingAddress,
        initialShippingGST: invoiceToEdit?.shippingGST,
        initialExpenseName: invoiceToEdit?.extraExpenseName,
        initialExpenseAmount: invoiceToEdit?.extraExpenseAmount,
        initialNarration: invoiceToEdit?.narration,
    } : { initialPartyName: '', initialPartyNumber: '' };

    const salesmanSelector = salesSettings?.enableSalesmanSelection && (
        <select
            value={selectedWorker?.uid || ''}
            onChange={e => {
                if (e.target.value === 'ADD_NEW_SALESMAN') navigate(ROUTES.USER_ADD);
                else setSelectedWorker(workers.find(w => w.uid === e.target.value) || null);
            }}
            className="p-1 border rounded text-sm"
            disabled={!hasPermission(Permissions.ViewTransactions) || (isEditMode && !isManager)}
        >
            <option value="">Salesman</option>
            {workers.map(w => <option key={w.uid} value={w.uid}>{w.name}</option>)}
            <option value="ADD_NEW_SALESMAN" className="font-semibold bg-gray-100">+ Add New Salesman</option>
        </select>
    );

    // ─── All shared view props ────────────────────────────────────────────────
    const sharedViewProps = {
        // Modal
        modal, setModal,
        // Barcode
        isScannerOpen, setIsScannerOpen,
        isBarcodeLinkModalOpen, barcodeToLink, isLinkingBarcode,
        closeBarcodeLinkModal, handleLinkScannedBarcode, handleBarcodeScanned,
        // Header
        isEditMode,
        invoiceNumber,
        onInvoiceNumberChange: (val: string) => {
            isInvoiceNumberManuallyEdited.current = true;
            setInvoiceNumber(val);
        },
        invoiceDate,
        onInvoiceDateChange: setInvoiceDate,
        // Items / cart
        availableItems, cartEntries, itemGroupMap, categories,
        items, setItems, displayItems, addItemToCart,
        handleQuantityChange, handleDeleteItem, handleClearCart,
        handleDiscountChange, handleCustomPriceChange, handleCustomPriceBlur,
        // Locks
        isDiscountLocked, isPriceLocked, discountInfo, priceInfo,
        discountHandlers, priceHandlers,
        // Settings
        salesSettings, hideMrp, isCardImageView,
        // Tax
        activeTaxMode, setActiveTaxMode, taxToggleProps, taxAmount,
        // Totals
        subtotal, totalDiscount, finalAmount, totalQuantity, roundOff, taxableAmount,
        // Footer
        footerProps, isFooterExpanded, setIsFooterExpanded,
        // Salesman
        salesmanSelector, workers, selectedWorker, setSelectedWorker,
        // Drawer
        isDrawerOpen, setIsDrawerOpen, drawerSharedProps, salesDrawerEditProps,
        handleSavePayment,
        // Item edit drawer
        selectedItemForEdit, isItemDrawerOpen,
        handleOpenEditDrawer, handleCloseEditDrawer, handleSaveSuccess,
        // Bill success
        savedBillData, setSavedBillData, sendingPdf, handleSendWhatsapp,
        // User
        currentUser,
        // Calculator
        calcInput, setCalcInput,
        stagedCalcInput, setStagedCalcInput,
        parsedData, liveTotal, liveItemCount,
        handlePointerDown, handlePointerUp, handlePointerLeave,
        handleKeypadPress, handleCheckoutClick,
    };

    // ─── Guards ───────────────────────────────────────────────────────────────
    if (pageIsLoading) return (
        <div className="flex items-center justify-center h-screen">
            <Spinner /><p className="ml-2">Loading...</p>
        </div>
    );
    if (error) return (
        <div className="flex flex-col items-center justify-center h-screen text-red-600">
            <p>{error}</p>
            <button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                Go Back
            </button>
        </div>
    );

    // ─── Route to the correct view ────────────────────────────────────────────
    if (isCardView) return <SalesCardView {...sharedViewProps} />;
    if (isCalculatorView) return <SalesCalculatorView {...sharedViewProps} />;
    return <SalesListView {...sharedViewProps} />;
};


export { applyRounding } from './SalesComponents/Salescalculations';
export default Sales;
