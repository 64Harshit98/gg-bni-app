import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth, useDatabase } from '../../context/auth-context';
import type { Item, SalesItem as OriginalSalesItem } from '../../constants/models';
import { ROUTES } from '../../constants/routes.constants';
import { db } from '../../lib/Firebase';
import { collection, serverTimestamp, doc, increment as firebaseIncrement, runTransaction, getDocs, query, where, getDoc, onSnapshot } from 'firebase/firestore';
import SearchableItemInput from '../../UseComponents/SearchIteminput';
import BarcodeScanner from '../../UseComponents/BarcodeScanner';
import PaymentDrawer, { type PaymentCompletionData } from '../../Components/PaymentDrawer';
import { peekNextInvoiceNumber } from '../../UseComponents/InvoiceCounter';
import { Modal } from '../../constants/Modal';
import { Permissions, ROLES, State, Variant } from '../../enums';
import { CustomButton } from '../../Components';
import type { User } from '../../Role/permission';
import { useSalesSettings } from '../../context/SettingsContext';
import { Spinner } from '../../constants/Spinner';
import { ItemEditDrawer } from '../../Components/ItemDrawer';
import { GenericCartList } from '../../Components/CartItem';
import BarcodeLinkModal from '../../Components/BarcodeLinkModal';
import { FiTrash2, FiX, FiChevronDown, FiEdit, FiCamera, FiDelete } from 'react-icons/fi';
import { GenericBillFooter } from '../../Components/Footer';
import { IconScanCircle } from '../../constants/Icons';
import QRCode from 'react-qr-code';
import { FiSend } from 'react-icons/fi';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../../lib/Firebase';
import { generatePdfBlob } from '../../UseComponents/pdfGenerator';
import { getFirestoreOperations } from '../../lib/ItemsFirebase';
import { botMasterService } from '../Additional/Whatsapp/WhatsappApi';
import { PLAN_ALLOWED_FEATURES } from '../Settings/SalesSetting';

export interface SalesItem extends OriginalSalesItem {
    isEditable: boolean;
    customPrice?: number | string;
    taxableAmount?: number;
    taxAmount?: number;
    taxRate?: number;
    taxType?: 'inclusive' | 'exclusive' | 'none';
    purchasePrice: number;
    tax: number;
    itemGroupId: string;
    salesPrice: number;
    stock: number;
    amount: number;
    barcode: string;
    restockQuantity: number;
    productId: string;
    unit?: string;               // ADDED
    unitMultiplier?: number;     // ADDED
    packetSize?: number | undefined;  // ADDED
    isCustomAmount?: boolean;        // ADDED
    isStagedCalcItem?: boolean;
}

// Inside Sales component, add interface and button data
interface CalcKey {
    label: string;
    value: string;
    type: 'number' | 'operator' | 'function';
    icon?: React.ElementType;
    colClass?: string; // <--- Changed from colspan to colClass
}

const calcKeys: CalcKey[][] = [
    // Row 1: %, -, delete 
    [
        { label: '%', value: '%', type: 'operator', colClass: 'col-span-2' },
        { label: '-', value: '-', type: 'operator', colClass: 'col-span-2' },
        { label: '', value: 'Backspace', type: 'function', icon: FiDelete, colClass: 'col-span-4' }
    ],

    // Row 2: 1,2,3,*
    [
        { label: '1', value: '1', type: 'number', colClass: 'col-span-2' },
        { label: '2', value: '2', type: 'number', colClass: 'col-span-2' },
        { label: '3', value: '3', type: 'number', colClass: 'col-span-2' },
        { label: '×', value: '*', type: 'operator', colClass: 'col-span-2' }
    ],

    // Row 3: 4,5,6,+
    [
        { label: '4', value: '4', type: 'number', colClass: 'col-span-2' },
        { label: '5', value: '5', type: 'number', colClass: 'col-span-2' },
        { label: '6', value: '6', type: 'number', colClass: 'col-span-2' },
        { label: '+', value: '+', type: 'operator', colClass: 'col-span-2' }
    ],

    // Row 4: 7,8,9,.
    [
        { label: '7', value: '7', type: 'number', colClass: 'col-span-2' },
        { label: '8', value: '8', type: 'number', colClass: 'col-span-2' },
        { label: '9', value: '9', type: 'number', colClass: 'col-span-2' },
        { label: '.', value: '.', type: 'number', colClass: 'col-span-2' }
    ],

    // Row 5: 0,00
    [
        { label: '0', value: '0', type: 'number', colClass: 'col-span-4' },
        { label: '00', value: '00', type: 'number', colClass: 'col-span-4' }
    ]
];


export const applyRounding = (amount: number, isRoundingEnabled: boolean, interval: number = 1): number => {
    if (!isRoundingEnabled || !interval || interval <= 0) {
        return parseFloat(amount.toFixed(2));
    }
    const rounded = Math.round(amount / interval) * interval;
    return parseFloat(rounded.toFixed(2));
};

const toCurrency = (num: number) => {
    return Math.round((num + Number.EPSILON) * 100) / 100;
};


const Sales: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { currentUser, loading: authLoading, hasPermission } = useAuth();
    const dbOperations = useDatabase();
    // 👇 1. GRAB RAW SETTINGS FROM DB 👇
    const { salesSettings: rawSettings, loadingSettings } = useSalesSettings();

    // 👇 2. INSTANTLY ENFORCE PLAN LIMITS 👇
    const salesSettings = useMemo(() => {
        if (!rawSettings) return null;

        // Get the active plan using your exact data structure
        const activePlan = currentUser?.Subscription?.pack?.toLowerCase() || 'pos_basic';
        const allowedFeatures = PLAN_ALLOWED_FEATURES[activePlan] || PLAN_ALLOWED_FEATURES['pos_basic'];

        // If their saved view isn't allowed, force them to the first allowed view (e.g. 'calculator' for basic)
        const validView = allowedFeatures.allowedViews?.includes(rawSettings.salesViewType || 'list')
            ? rawSettings.salesViewType
            : allowedFeatures.allowedViews[0];

        return {
            ...rawSettings,
            salesViewType: validView,
        };
    }, [rawSettings, currentUser?.Subscription?.pack]);
    const invoiceToEdit = location.state?.invoiceData;
    const isEditMode = location.state?.isEditMode === true && !!invoiceToEdit;
    const [barcodeToLink, setBarcodeToLink] = useState<string | null>(null);
    const [isBarcodeLinkModalOpen, setIsBarcodeLinkModalOpen] = useState(false);
    const [isLinkingBarcode, setIsLinkingBarcode] = useState(false);
    const [sortOrder, setSortOrder] = useState<'az' | 'za' | 'price_asc' | 'price_desc'>('az');
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
    const [savedBillData, setSavedBillData] = useState<{ id: string, number: string, invoiceData?: any } | null>(null);
    const [sendingPdf, setSendingPdf] = useState(false);

    const [invoiceNumber, setInvoiceNumber] = useState<string>('');
    const isInvoiceNumberManuallyEdited = useRef(false);
    const [invoiceDate, setInvoiceDate] = useState<string>(() => {
        // In edit mode, use the original invoice's date
        if (location.state?.isEditMode === true && location.state?.invoiceData?.createdAt) {
            const original = new Date(location.state.invoiceData.createdAt);
            if (!isNaN(original.getTime())) {
                const yyyy = original.getFullYear();
                const mm = String(original.getMonth() + 1).padStart(2, '0');
                const dd = String(original.getDate()).padStart(2, '0');
                return `${yyyy}-${mm}-${dd}`;
            }
        }
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    });

    const [items, setItems] = useState<SalesItem[]>(() => {
        if (isEditMode) return [];
        try {
            const savedDraft = localStorage.getItem('sales_cart_draft');
            const parsedDraft = savedDraft ? JSON.parse(savedDraft) : [];
            return parsedDraft;
        } catch (e) {
            return [];
        }
    });

    // --- Active Tax Mode State ---
    // This drives the entire calculation logic now
    const [activeTaxMode, setActiveTaxMode] = useState<'inclusive' | 'exclusive' | 'exempt'>('exclusive');

    const [availableItems, setAvailableItems] = useState<Item[]>([]);
    const [pageIsLoading, setPageIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const longPressTimer = useRef<NodeJS.Timeout | null>(null);

    const [isDiscountLocked, setIsDiscountLocked] = useState(true);
    const [discountInfo, setDiscountInfo] = useState<string | null>(null);
    const [isPriceLocked, setIsPriceLocked] = useState(true);
    const [priceInfo, setPriceInfo] = useState<string | null>(null);

    const [workers, setWorkers] = useState<User[]>([]);
    const [selectedWorker, setSelectedWorker] = useState<User | null>(null);
    const [settingsDocId, setSettingsDocId] = useState<string | null>(null);

    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [listSelectedCategory] = useState<string>('All');
    const [gridSearchQuery, setGridSearchQuery] = useState<string>('');
    const [itemGroupMap, setItemGroupMap] = useState<Record<string, string>>({});
    const [isFooterExpanded, setIsFooterExpanded] = useState(false);

    const isActive = (path: string) => location.pathname === path;
    const userRole = currentUser?.role || '';
    const isManager = userRole === ROLES.MANAGER || userRole === ROLES.OWNER;
    const hideMrp = (salesSettings as any)?.hideMrp ?? false;

    // View variables
    const isCardView = salesSettings?.salesViewType === 'card';
    const isCardImageView = isCardView && (salesSettings?.cardViewWithPhoto !== false);
    const isCalculatorView = salesSettings?.salesViewType === 'calculator';
    const showTaxRow = (activeTaxMode !== 'exempt');
    const [calcInput, setCalcInput] = useState<string>('');
    const [stagedCalcInput, setStagedCalcInput] = useState<string>('');

    // If the cart gets completely cleared (e.g., successful payment), forget the staged equation
    useEffect(() => {
        if (items.length === 0) {
            setStagedCalcInput('');
        }
    }, [items.length]);

    const handlePointerDown = (key: CalcKey) => {
        if (key.value === 'Backspace') {
            longPressTimer.current = setTimeout(() => {
                handleKeypadPress({ ...key, value: 'Clear' }); // Triggers the Clear logic after 1.5s
                longPressTimer.current = null;
            }, 1000);
        }
    };

    const handlePointerUp = (key: CalcKey) => {
        if (key.value === 'Backspace') {
            if (longPressTimer.current) {
                clearTimeout(longPressTimer.current); // Cancel the long press
                handleKeypadPress(key); // Execute normal short press (Backspace)
                longPressTimer.current = null;
            }
        } else {
            handleKeypadPress(key); // Normal keys execute on click/up
        }
    };

    const handlePointerLeave = (key: CalcKey) => {
        if (key.value === 'Backspace' && longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };
    // Logic: Always pre-select based on settings, but allow override.
    useEffect(() => {
        if (loadingSettings) return;

        if (isEditMode && invoiceToEdit?.taxType) {
            const savedType = invoiceToEdit.taxType;
            if (savedType === 'none') setActiveTaxMode('exempt');
            else if (savedType === 'inclusive' || savedType === 'exclusive') setActiveTaxMode(savedType);
        } else if (salesSettings) {
            // Pre-select based on Settings
            if (salesSettings.gstScheme === 'none' || salesSettings.gstScheme === 'composition') {
                setActiveTaxMode('exempt');
            } else {
                // If Regular, use the taxType preference
                setActiveTaxMode(salesSettings.taxType as any || 'exclusive');
            }
        }
    }, [loadingSettings, salesSettings, isEditMode, invoiceToEdit]);

    // ... (Data Fetching - Unchanged) ...
    useEffect(() => {
        const findSettingsDocId = async () => {
            if (currentUser?.companyId) {
                const settingsQuery = query(collection(db, 'companies', currentUser.companyId, 'settings'), where('settingType', '==', 'sales'));
                const settingsSnapshot = await getDocs(settingsQuery);
                if (!settingsSnapshot.empty) setSettingsDocId(settingsSnapshot.docs[0].id);
            }
        };
        findSettingsDocId();

        if (authLoading || !currentUser || !dbOperations || loadingSettings) {
            setPageIsLoading(authLoading || loadingSettings);
            return;
        }

        // --- REAL-TIME INVOICE LISTENER (Multi-tab Fix) ---
        let unsubscribeCounter: () => void = () => { };

        if (!isEditMode && currentUser?.companyId) {
            const counterRef = doc(db, 'companies', currentUser.companyId, 'counters', 'invoiceCounter');
            const settingsRef = doc(db, 'companies', currentUser.companyId, 'settings', 'sales-settings');

            unsubscribeCounter = onSnapshot(counterRef, async (docSnap) => {
                if (isInvoiceNumberManuallyEdited.current) return;
                const settingsSnap = await getDoc(settingsRef);
                const prefix = settingsSnap.exists() ? (settingsSnap.data().voucherPrefix || 'INV') : 'INV';

                if (docSnap.exists()) {
                    const nextNum = docSnap.data().currentNumber || 1;
                    setInvoiceNumber(`${prefix}-${nextNum}`);
                } else {
                    setInvoiceNumber(`${prefix}-1`);
                }
            });
        }

        const fetchData = async () => {
            try {
                setPageIsLoading(true);
                setError(null);
                const fetchedItems = await dbOperations.syncItems();
                setAvailableItems(fetchedItems);

                // If in edit mode, we use the saved number, NOT the live counter
                if (isEditMode && invoiceToEdit?.invoiceNumber) {
                    setInvoiceNumber(invoiceToEdit.invoiceNumber);
                }

                const fetchedWorkers = await dbOperations.getWorkers();
                setWorkers(fetchedWorkers);
                let groupMap: Record<string, string> = {};
                if (currentUser?.companyId) {
                    try {
                        const groupsRef = collection(db, 'companies', currentUser.companyId, 'itemGroups');
                        const groupsSnap = await getDocs(groupsRef);
                        groupsSnap.docs.forEach(doc => { const data = doc.data(); groupMap[doc.id] = data.name || data.groupName || 'Unknown Group'; });
                    } catch (e) { console.error(e); }
                }
                setItemGroupMap(groupMap);
                if (isEditMode) {
                    const originalSalesman = fetchedWorkers.find(u => u.uid === invoiceToEdit?.salesmanId);
                    setSelectedWorker(originalSalesman || null);
                } else {
                    const currentUserAsWorker = fetchedWorkers.find(u => u.uid === currentUser.uid);
                    setSelectedWorker(currentUserAsWorker || null);
                }
            } catch (err) {
                console.error(err);
                setError('Failed to load initial page data.');
            } finally {
                setPageIsLoading(false);
            }
        };

        fetchData();

        // Cleanup the listener when the component unmounts
        return () => unsubscribeCounter();

    }, [authLoading, currentUser, dbOperations, isEditMode, invoiceToEdit, loadingSettings]);

    useEffect(() => {
        if (!loadingSettings && salesSettings) {
            setIsDiscountLocked(salesSettings.lockDiscountEntry ?? false);
            setIsPriceLocked(salesSettings.lockSalePriceEntry ?? false);
        }
    }, [loadingSettings, salesSettings?.lockDiscountEntry, salesSettings?.lockSalePriceEntry]);

    // ... (Edit Mode Init - Unchanged) ...
    useEffect(() => {
        if (isEditMode && invoiceToEdit?.items) {
            const nonEditableItems = invoiceToEdit.items.map((item: any) => ({
                ...item,
                id: crypto.randomUUID(),
                productId: item.id,
                isEditable: true,
                customPrice: item.effectiveUnitPrice,
                quantity: item.quantity || 1,
                mrp: item.mrp || 0,
                discount: item.discount || 0,
                taxableAmount: item.taxableAmount,
                taxAmount: item.taxAmount,
                taxRate: item.taxRate,
                taxType: item.taxType,
                finalPrice: item.finalPrice,
                effectiveUnitPrice: item.effectiveUnitPrice,
                discountPercentage: item.discountPercentage,
                purchasePrice: item.purchasePrice || 0,
                tax: Number(item.tax ?? item.taxRate ?? 0),
                itemGroupId: item.itemGroupId || '',
                stock: item.stock ?? item.Stock ?? 0,
                amount: item.amount || 0,
                barcode: item.barcode || '',
                restockQuantity: item.restockQuantity || 0,
                unit: item.unit || '',                     // ADDED
                unitMultiplier: item.unitMultiplier || 1,  // ADDED
                packetSize: item.packetSize || null,
            }));
            setItems(nonEditableItems);
        }
    }, [isEditMode, invoiceToEdit]);

    useEffect(() => {
        if (!isEditMode) localStorage.setItem('sales_cart_draft', JSON.stringify(items));
    }, [items, isEditMode]);

    const categories = useMemo(() => {
        const groups = new Set(availableItems.map(i => i.itemGroupId || 'Others'));
        return ['All', ...Array.from(groups).sort()];
    }, [availableItems]);

    const sortedGridItems = useMemo(() => {
        const filtered = availableItems.filter(item => {
            const itemGroupId = item.itemGroupId || 'Others';
            const matchesCategory = selectedCategory === 'All' || itemGroupId === selectedCategory;
            const matchesSearch = gridSearchQuery === '' || item.name.toLowerCase().includes(gridSearchQuery.toLowerCase()) || item.barcode?.includes(gridSearchQuery);
            return matchesCategory && matchesSearch;
        });

        const sortFn = (a: Item, b: Item) => {
            switch (sortOrder) {
                case 'az': return a.name.localeCompare(b.name);
                case 'za': return b.name.localeCompare(a.name);
                case 'price_asc': return (a.salesPrice || a.mrp || 0) - (b.salesPrice || b.mrp || 0);
                case 'price_desc': return (b.salesPrice || b.mrp || 0) - (a.salesPrice || a.mrp || 0);
                default: return 0;
            }
        };

        return [...filtered].sort(sortFn);

    }, [availableItems, selectedCategory, gridSearchQuery, items, sortOrder]);

    const gstSchemeDisplay = salesSettings?.gstScheme;

    const { subtotal, totalDiscount, roundOff, taxableAmount, taxAmount, finalAmount, totalQuantity } = useMemo(() => {
        let accumulatorSubtotal = 0;
        let accumulatorTaxable = 0;
        let accumulatorTax = 0;
        let accumulatorQuantity = 0;

        const taxRate = salesSettings?.defaultTaxRate ?? 0;
        const isRoundingEnabled = salesSettings?.enableRounding ?? true;
        const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;

        // Determine Effective Tax Mode
        // Determine Effective Tax Mode
        let effectiveTaxMode = 'none';

        // Removed "&& isTaxEnabled" so it only relies on the GST scheme and the dropdown
        if (gstSchemeDisplay?.toLowerCase() === 'regular') {
            effectiveTaxMode = activeTaxMode === 'exempt' ? 'none' : activeTaxMode;
        } else {
            effectiveTaxMode = 'none';
        }


        items.forEach(cartItem => {
            const currentQuantity = cartItem.quantity || 1;
            accumulatorQuantity += currentQuantity;

            let baseForSubtotal = (cartItem.mrp && cartItem.mrp > 0) ? cartItem.mrp : (cartItem.salesPrice || 0);

            // 👇 Fixed condition here so it doesn't fail if taxRate is null
            const itemSpecificTaxRate = cartItem.tax !== undefined ? Number(cartItem.tax) : taxRate;

            if (effectiveTaxMode === 'inclusive' && itemSpecificTaxRate > 0) {
                baseForSubtotal = baseForSubtotal / (1 + (itemSpecificTaxRate / 100));
            }

            accumulatorSubtotal += baseForSubtotal * currentQuantity;

            const baseForDiscount = (cartItem.mrp && cartItem.mrp > 0) ? cartItem.mrp : (cartItem.salesPrice || 0);

            let effectiveUnitPrice = 0;
            if (cartItem.customPrice !== undefined && cartItem.customPrice !== null && cartItem.customPrice !== '') {
                effectiveUnitPrice = parseFloat(String(cartItem.customPrice));
            } else {
                effectiveUnitPrice = baseForDiscount * (1 - (cartItem.discount || 0) / 100);
            }

            effectiveUnitPrice = applyRounding(effectiveUnitPrice, isRoundingEnabled, roundingInterval);
            const lineTotal = toCurrency(effectiveUnitPrice * currentQuantity);

            // 3. Tax Calculation
            let lineBaseAmount = 0;
            let lineTaxAmount = 0;

            if (effectiveTaxMode !== 'none' && itemSpecificTaxRate > 0) {
                if (effectiveTaxMode === 'inclusive') {
                    lineBaseAmount = toCurrency(lineTotal / (1 + (itemSpecificTaxRate / 100)));
                    lineTaxAmount = toCurrency(lineTotal - lineBaseAmount);
                } else {
                    lineBaseAmount = lineTotal;
                    lineTaxAmount = toCurrency(lineTotal * (itemSpecificTaxRate / 100));
                }
            } else {
                lineBaseAmount = lineTotal;
                lineTaxAmount = 0;
            }

            accumulatorTaxable += lineBaseAmount;
            accumulatorTax += lineTaxAmount;
        });

        const finalTaxable = toCurrency(accumulatorTaxable);
        const finalTax = toCurrency(accumulatorTax);
        const rawFinalAmount = toCurrency(finalTaxable + finalTax);

        let totalDiscountValue = 0;

        if (effectiveTaxMode === 'none') {
            totalDiscountValue = toCurrency(accumulatorSubtotal - rawFinalAmount);
        } else {
            totalDiscountValue = toCurrency(accumulatorSubtotal - finalTaxable);
        }

        const finalPayableAmount = Math.round(rawFinalAmount);
        const roundOffAmount = toCurrency(finalPayableAmount - rawFinalAmount);


        return {
            subtotal: accumulatorSubtotal,
            totalDiscount: totalDiscountValue > 0 ? totalDiscountValue : 0,
            roundOff: roundOffAmount,
            taxableAmount: finalTaxable,
            taxAmount: finalTax,
            finalAmount: finalPayableAmount,
            totalQuantity: accumulatorQuantity
        };
    }, [items, salesSettings, activeTaxMode, gstSchemeDisplay]);

    const amountToPayNow = useMemo(() => finalAmount, [finalAmount]);
    // Helper to evaluate the current string (e.g., "100*2" -> 200)

    const displayRef = useRef<HTMLInputElement>(null);

    // Injects a number exactly where the user tapped
    const insertAtCursor = (val: string) => {
        const input = displayRef.current;
        if (!input) {
            setCalcInput(prev => prev + val);
            return;
        }

        // Capture cursor position *before* the state updates
        const start = input.selectionStart ?? 0;
        const end = input.selectionEnd ?? 0;
        // Detect if the user is typing at the very end of the visible text
        const isAtEnd = start === (input.value?.length || 0);

        setCalcInput(prev => {
            const currentInput = prev || '';

            // If typing rapidly at the end, safely append. Otherwise, insert at cursor.
            const newVal = isAtEnd
                ? currentInput + val
                : currentInput.slice(0, start) + val + currentInput.slice(end);

            setTimeout(() => {
                input.focus();
                const newPos = isAtEnd ? newVal.length : start + val.length;
                input.setSelectionRange(newPos, newPos);
            }, 0);

            return newVal;
        });
    };

    // Deletes the number exactly where the user tapped
    const deleteAtCursor = () => {
        const input = displayRef.current;
        if (!input) return;

        const start = input.selectionStart ?? 0;
        const end = input.selectionEnd ?? 0;
        const isAtEnd = start === (input.value?.length || 0);

        setCalcInput(prev => {
            if (!prev) return prev;

            let newVal;
            let newPos;

            // If rapid-firing backspace at the end of the string
            if (isAtEnd) {
                newVal = prev.slice(0, -1);
                newPos = newVal.length;
            } else if (start === end && start > 0) {
                newVal = prev.slice(0, start - 1) + prev.slice(end);
                newPos = start - 1;
            } else if (start !== end) {
                newVal = prev.slice(0, start) + prev.slice(end);
                newPos = start;
            } else {
                return prev; // Nothing to delete
            }

            setTimeout(() => {
                input.focus();
                input.setSelectionRange(newPos, newPos);
            }, 0);

            return newVal;
        });
    };

    const generateSafeId = () => {
        if (typeof window.crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        // Fallback for mobile HTTP testing
        return 'id-' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    };
    // Parses the entire string on the screen to calculate live totals and generate items
    const parseFullEquation = (equation: string): { items: SalesItem[], total: number } => {
        if (!equation.trim()) return { items: [], total: 0 };

        // Normalize equation: handle subtraction by converting "-" into "+-" form
        const normalized = equation.replace(/-/g, '+-');
        const segments = normalized.split('+');

        const newItems: SalesItem[] = [];
        let grandTotal = 0;

        segments.forEach((segment) => {
            if (!segment.trim()) return;

            let segmentValue = 0;

            // Handle percentage 
            if (segment.includes('%')) {
                const num = parseFloat(segment.replace('%', ''));
                if (!isNaN(num)) {
                    segmentValue = (grandTotal * num) / 100;
                }
            } else {
                // Handle multiplication
                const multiplicationParts = segment.split('*');
                let subtotal = 1;
                let hasValidNumber = false;

                multiplicationParts.forEach(numStr => {
                    const num = parseFloat(numStr);
                    if (!isNaN(num)) {
                        subtotal *= num;
                        hasValidNumber = true;
                    }
                });

                if (hasValidNumber) {
                    segmentValue = subtotal;
                }
            }

            if (!isNaN(segmentValue) && segmentValue !== 0) {
                newItems.push({
                    id: generateSafeId(),
                    productId: `${generateSafeId()}`,
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
                    isCustomAmount: true
                });

                grandTotal += segmentValue;
            }
        });

        return { items: newItems, total: grandTotal };
    };

    // Live preview data
    const parsedData = parseFullEquation(calcInput);
    const liveTotal = finalAmount + parsedData.total;
    const liveItemCount = items.length + parsedData.items.length;


    const handleKeypadPress = (key: CalcKey) => {
        const { value, type } = key;
        if (type === 'function') {
            if (value === 'Backspace') {
                deleteAtCursor(); // <-- UPDATED
            } else if (value === 'Clear') {
                if (calcInput === '') {
                    if (items.length > 0 && window.confirm("Are you sure you want to clear the entire bill?")) setItems([]);
                } else {
                    setCalcInput('');
                }
            }
        } else {
            // Operator (+, *) or Number
            insertAtCursor(value); // <-- UPDATED
        }
    };

    // Update physical keyboard listener to use the cursor too
    // useEffect(() => {
    //     if (!isCalculatorView) return;
    //     const handleKeyDown = (e: KeyboardEvent) => {

    //         // 1. If the input IS focused natively, prevent double-typing but catch action keys
    //         if (document.activeElement === displayRef.current) {
    //             if (e.key === 'Enter' || e.key === '=') {
    //                 e.preventDefault();
    //                 handleCheckoutClick();
    //             } else if (e.key.toLowerCase() === 'c' || e.key === 'Escape') {
    //                 e.preventDefault();
    //                 if (calcInput === '') {
    //                     if (items.length > 0 && window.confirm("Are you sure you want to clear the bill?")) setItems([]);
    //                 } else {
    //                     setCalcInput('');
    //                 }
    //             }
    //             return; // Stop here so native onChange can handle the physical number typing
    //         }

    //         // 2. If the input IS NOT focused (Global typing fallback)
    //         const key = e.key;
    //         if (/^[0-9*.\-+]$/.test(key)) {
    //             e.preventDefault();
    //             insertAtCursor(key);
    //         } else if (key === 'Enter' || key === '=') {
    //             e.preventDefault();
    //             handleCheckoutClick();
    //         } else if (key === 'Backspace') {
    //             e.preventDefault();
    //             deleteAtCursor();
    //         } else if (key.toLowerCase() === 'c' || key === 'Escape') {
    //             e.preventDefault();
    //             if (calcInput === '') {
    //                 if (items.length > 0 && window.confirm("Are you sure you want to clear the bill?")) setItems([]);
    //             } else {
    //                 setCalcInput('');
    //             }
    //         }
    //     };
    //     window.addEventListener('keydown', handleKeyDown);
    //     return () => window.removeEventListener('keydown', handleKeyDown);
    // }, [isCalculatorView, calcInput, items.length]);

    const handleCheckoutClick = () => {
        if (calcInput.trim()) {
            // Flag the items as 'staged' so we can remove them if the drawer is canceled
            const stagedItems = parsedData.items.map(i => ({ ...i, isStagedCalcItem: true }));

            setStagedCalcInput(calcInput); // Remember the equation

            setItems(prev => {
                const insertionOrder = salesSettings?.cartInsertionOrder || 'top';
                return insertionOrder === 'top' ? [...stagedItems, ...prev] : [...prev, ...stagedItems];
            });
            setCalcInput(''); // Clear screen
        }

        setTimeout(() => {
            if (items.length > 0 || parsedData.items.length > 0) {
                setIsDrawerOpen(true);
            } else {
                setModal({ message: 'Please add at least one item.', type: State.INFO });
            }
        }, 10);
    };

    useEffect(() => {
        if (!isCalculatorView) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            const key = e.key;
            if (/^[0-9*.\-+]$/.test(key)) {
                setCalcInput(prev => prev + key);
            } else if (key === 'Enter' || key === '=') {
                e.preventDefault();
                handleCheckoutClick();
            } else if (key === 'Backspace') {
                setCalcInput(prev => prev.slice(0, -1));
            } else if (key.toLowerCase() === 'c' || key === 'Escape') {
                if (calcInput === '') {
                    if (items.length > 0 && window.confirm("Are you sure you want to clear the bill?")) setItems([]);
                } else {
                    setCalcInput('');
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isCalculatorView, calcInput, items.length]);

    const addItemToCart = (itemToAdd: Item) => {
        if (!itemToAdd || !itemToAdd.id) {
            setModal({ message: "Cannot add invalid item.", type: State.ERROR });
            return;
        }

        const itemTaxExtracted = Number(itemToAdd.tax ?? (itemToAdd as any).taxRate ?? salesSettings?.defaultTaxRate ?? 0);

        const mrp = Number(itemToAdd.mrp || 0);
        const salesPrice = Number(itemToAdd.salesPrice || 0);
        const presetDiscount = Number(itemToAdd.discount || 0);
        let finalNetPrice = mrp;
        let calculatedDiscount = 0;
        if (salesPrice > 0) {
            finalNetPrice = salesPrice;
            if (mrp > 0) {
                calculatedDiscount = ((mrp - salesPrice) / mrp) * 100;
            }
        } else if (presetDiscount > 0) {
            calculatedDiscount = presetDiscount;
            finalNetPrice = mrp * (1 - (presetDiscount / 100));
        } else {
            finalNetPrice = mrp;
            calculatedDiscount = 0;
        }
        const isRoundingEnabled = salesSettings?.enableRounding ?? true;
        const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;
        finalNetPrice = applyRounding(finalNetPrice, isRoundingEnabled, roundingInterval);
        const newSalesItem: SalesItem = {
            ...itemToAdd,
            id: crypto.randomUUID(),
            productId: itemToAdd.id!,
            quantity: (itemToAdd as any).unitMultiplier || 1,
            discount: parseFloat(calculatedDiscount.toFixed(2)),
            customPrice: finalNetPrice,
            isEditable: true,
            purchasePrice: itemToAdd.purchasePrice || 0,
            tax: itemTaxExtracted,
            itemGroupId: itemToAdd.itemGroupId || '',
            stock: itemToAdd.stock || (itemToAdd as any).Stock || 0,
            amount: itemToAdd.amount || 0,
            barcode: itemToAdd.barcode || '',
            restockQuantity: itemToAdd.restockQuantity || 0,
            unit: (itemToAdd as any).unit || '',                     // ADDED
            unitMultiplier: (itemToAdd as any).unitMultiplier || 1,  // ADDED
            packetSize: (itemToAdd as any).packetSize || null,
        };
        setItems(prev => {
            const insertionOrder = salesSettings?.cartInsertionOrder || 'top';
            return insertionOrder === 'top' ? [newSalesItem, ...prev] : [...prev, newSalesItem];
        });
    };

    const handleClearCart = () => {
        if (items.length > 0 && window.confirm("Are you sure you want to remove all items?")) setItems([]);
    };
    const handleItemSelected = (selectedItem: Item | null) => {
        if (selectedItem) { addItemToCart(selectedItem); setGridSearchQuery(''); }
    };
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
            // Explicitly type the variable to accept Item, undefined (from .find), or null (from DB)
            let itemToAdd: Item | null | undefined = availableItems.find(item => item.barcode === cleanBarcode);

            // Fallback to the database if it's not in local state
            if (!itemToAdd) {
                itemToAdd = await dbOperations.getItemByBarcode(cleanBarcode);
            }

            if (itemToAdd) {
                addItemToCart(itemToAdd);

                // Only add to availableItems if it came from the DB fallback
                setAvailableItems(prev => {
                    const exists = prev.find(p => p.id === itemToAdd!.id);
                    return exists ? prev : [...prev, itemToAdd!];
                });
            } else {
                const hasAnyItemWithoutBarcode = availableItems.some(item => !(item.barcode || '').trim());
                if (!hasAnyItemWithoutBarcode) {
                    setModal({
                        message: `Item not found for barcode: "${cleanBarcode}"`,
                        type: State.ERROR
                    });
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
    const handleQuantityChange = (id: string, newQuantity: number) => { setItems(prev => prev.map(item => item.id === id ? { ...item, quantity: Math.max(0, newQuantity) } : item)); };
    const handleDeleteItem = (id: string) => { setItems(prev => prev.filter(item => item.id !== id)); };
    const handleDiscountPressStart = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); longPressTimer.current = setTimeout(() => setIsDiscountLocked(false), 500); };
    const handleDiscountPressEnd = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
    const handleDiscountClick = () => { if (salesSettings?.lockDiscountEntry || isDiscountLocked) { setDiscountInfo("Cannot edit discount"); setTimeout(() => setDiscountInfo(null), 3000); } };
    const handlePricePressStart = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); longPressTimer.current = setTimeout(() => setIsPriceLocked(false), 500); };
    const handlePricePressEnd = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
    const handlePriceClick = () => { if (salesSettings?.lockSalePriceEntry || isPriceLocked) { setPriceInfo("Cannot edit sale price"); setTimeout(() => setPriceInfo(null), 1000); } };
    const handleDiscountChange = (id: string, v: number | string) => {
        const n = typeof v === 'string' ? parseFloat(v) : v;
        const safeDiscount = isNaN(n) ? 0 : n;
        setItems(prev => prev.map(i => {
            if (i.id === id) {
                const basePrice = (i.mrp && i.mrp > 0) ? i.mrp : (i.salesPrice || 0);
                let newPrice = basePrice * (1 - safeDiscount / 100);
                const isRoundingEnabled = salesSettings?.enableRounding ?? true;
                const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;
                newPrice = applyRounding(newPrice, isRoundingEnabled, roundingInterval);
                return { ...i, discount: safeDiscount, customPrice: newPrice };
            }
            return i;
        }));
    };
    const handleCustomPriceChange = (id: string, v: string) => { if (v === '' || /^[0-9]*\.?[0-9]*$/.test(v)) setItems(prev => prev.map(i => i.id === id ? { ...i, customPrice: v } : i)); };
    const handleCustomPriceBlur = (id: string) => {
        setItems(prev => prev.map(i => {
            if (i.id === id && typeof i.customPrice === 'string') {
                const n = parseFloat(i.customPrice);
                if (i.customPrice === '' || isNaN(n)) return { ...i, customPrice: undefined };
                let d = 0; const basePrice = (i.mrp && i.mrp > 0) ? i.mrp : (i.salesPrice || 0);
                if (basePrice > 0) d = ((basePrice - n) / basePrice) * 100;
                return { ...i, customPrice: n, discount: parseFloat(d.toFixed(2)) };
            }
            return i;
        }));
    };
    const [selectedItemForEdit, setSelectedItemForEdit] = useState<Item | null>(null);
    const [isItemDrawerOpen, setIsItemDrawerOpen] = useState(false);
    const handleOpenEditDrawer = (item: Item) => { setSelectedItemForEdit(item); setIsItemDrawerOpen(true); };
    const handleCloseEditDrawer = () => { setIsItemDrawerOpen(false); setTimeout(() => setSelectedItemForEdit(null), 300); };
    const handleSaveSuccess = (updatedItemData: Partial<Item>) => {
        setAvailableItems(prevItems => prevItems.map(item => item.id === selectedItemForEdit?.id ? { ...item, ...updatedItemData, id: item.id } as Item : item));
        const updateForCart: Partial<SalesItem> = { ...updatedItemData };
        if ((updateForCart as any).Stock !== undefined) { updateForCart.stock = (updateForCart as any).Stock; delete (updateForCart as any).Stock; }
        Object.keys(updateForCart).forEach(key => { if (updateForCart[key as keyof typeof updateForCart] === undefined) delete updateForCart[key as keyof typeof updateForCart]; });
        setItems(prevCartItems => prevCartItems.map(cartItem => {
            if (cartItem.productId === selectedItemForEdit?.id || cartItem.id === selectedItemForEdit?.id) return { ...cartItem, ...updateForCart } as SalesItem;
            return cartItem;
        }));
    };
    const displayItems = useMemo(() => {
        if (listSelectedCategory === 'All') return items;
        return items.filter(item => (item.itemGroupId || 'Others') === listSelectedCategory);
    }, [items, listSelectedCategory]);

    const handleProceedToPayment = () => {
        if (items.length === 0) { setModal({ message: 'Please add at least one item.', type: State.INFO }); return; }
        if (salesSettings?.enableSalesmanSelection && !selectedWorker) { setModal({ message: 'Please select a salesman.', type: State.ERROR }); return; }
        if (!(salesSettings as any)?.allowNegativeStock) {
            const stockNeeds = new Map<string, number>();
            items.filter(i => i.isEditable).forEach(i => {
                const pid = i.productId;
                const multiplier = i.unitMultiplier || 1; // ADDED
                const requiredStock = (i.quantity || 1) * multiplier; // ADDED
                stockNeeds.set(pid, (stockNeeds.get(pid) || 0) + requiredStock); // UPDATED
            });
            const invalidItems: string[] = [];
            stockNeeds.forEach((needed, pid) => {
                const avail = availableItems.find(a => a.id === pid);
                if ((avail?.stock ?? 0) < needed) invalidItems.push(`${avail?.name} (Avail:${avail?.stock}, Need:${needed})`);
            });
            if (invalidItems.length > 0) { setModal({ message: `Insufficient stock: ${invalidItems.join(', ')}`, type: State.ERROR }); return; }
        }
        setIsDrawerOpen(true);
    };

    const [isSaving, setIsSaving] = useState(false);
    const handleSavePayment = async (completionData: PaymentCompletionData) => {
        if (isSaving) return; // Exit if already saving
        setIsSaving(true);
        if (!currentUser?.companyId) return;

        if (salesSettings?.requireCustomerName && !completionData.partyName?.trim()) {
            setModal({ message: "Customer Name is required.", type: State.ERROR });
            setIsSaving(false);
            return;
        }
        if (salesSettings?.requireCustomerMobile && !completionData.partyNumber?.trim()) {
            setModal({ message: "Customer Mobile Number is required.", type: State.ERROR });
            setIsSaving(false);
            return;
        }

        const companyId = currentUser.companyId;
        const salesman = salesSettings?.enableSalesmanSelection ? selectedWorker : workers.find(w => w.uid === currentUser.uid);
        const finalSalesman = salesman || { uid: currentUser.uid, name: currentUser.uid || 'Current User' };

        let finalGstScheme = salesSettings?.gstScheme || 'none';
        let finalTaxType = activeTaxMode === 'exempt' ? 'none' : activeTaxMode;

        const isTaxEnabled = salesSettings?.enableTax ?? true;
        const currentTaxRate = salesSettings?.defaultTaxRate ?? 0;
        const isRoundingEnabled = salesSettings?.enableRounding ?? true;
        const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;

        const getParsedInvoiceDate = () => {
            try {
                if (!invoiceDate) return new Date();

                const parts = invoiceDate.split('-'); // [YYYY, MM, DD]

                if (parts.length === 3) {
                    const year = parseInt(parts[0], 10);
                    const month = parseInt(parts[1], 10) - 1;
                    const day = parseInt(parts[2], 10);

                    if (isEditMode && invoiceToEdit?.createdAt) {
                        // In edit mode: restore the original timestamp exactly,
                        // but allow the date portion to reflect any user change.
                        const originalDate = new Date(invoiceToEdit.createdAt);
                        if (!isNaN(originalDate.getTime())) {
                            originalDate.setFullYear(year);
                            originalDate.setMonth(month);
                            originalDate.setDate(day);
                            return originalDate; // keeps original HH:MM:SS
                        }
                    }

                    // New invoice: use selected date + current time
                    const finalDate = new Date();
                    finalDate.setFullYear(year);
                    finalDate.setMonth(month);
                    finalDate.setDate(day);
                    return finalDate;
                }
            } catch (e) {
                console.error("Date parsing error", e);
            }
            return new Date();
        };

        const formatItemsForDB = (itemsToFormat: SalesItem[]) => {
            return itemsToFormat.map(({ isEditable, customPrice, ...item }) => {
                const currentDiscount = item.discount || 0;
                const currentQuantity = item.quantity || 1;

                let effectiveUnitPrice = 0;
                if (customPrice !== undefined && customPrice !== null && customPrice !== '') {
                    effectiveUnitPrice = parseFloat(String(customPrice));
                } else {
                    const basePrice = (item.mrp && item.mrp > 0) ? item.mrp : (item.salesPrice || 0);
                    effectiveUnitPrice = basePrice * (1 - currentDiscount / 100);
                }

                effectiveUnitPrice = applyRounding(effectiveUnitPrice, isRoundingEnabled, roundingInterval);
                effectiveUnitPrice = toCurrency(effectiveUnitPrice);

                const lineTotal = toCurrency(effectiveUnitPrice * currentQuantity);

                const itemSpecificTaxRate = (item.tax !== undefined && item.taxRate !== null) ? Number(item.tax) : currentTaxRate;
                let itemTaxableBase = 0, itemTaxAmount = 0, itemFinalPrice = 0;

                if (finalGstScheme === 'regular' && itemSpecificTaxRate > 0 && isTaxEnabled) {
                    if (finalTaxType === 'inclusive') {
                        itemFinalPrice = lineTotal;
                        itemTaxableBase = toCurrency(lineTotal / (1 + (itemSpecificTaxRate / 100)));
                        itemTaxAmount = toCurrency(lineTotal - itemTaxableBase);
                    } else {
                        itemTaxableBase = lineTotal;
                        itemTaxAmount = toCurrency(lineTotal * (itemSpecificTaxRate / 100));
                        itemFinalPrice = toCurrency(itemTaxableBase + itemTaxAmount);
                    }
                } else {
                    itemTaxableBase = lineTotal; itemFinalPrice = lineTotal;
                }

                return {
                    ...item,
                    id: item.productId,
                    quantity: currentQuantity, discount: currentDiscount, effectiveUnitPrice, finalPrice: itemFinalPrice,
                    unit: item.unit || '',                     // ADDED
                    unitMultiplier: item.unitMultiplier || 1,  // ADDED
                    packetSize: item.packetSize || null,
                    taxableAmount: itemTaxableBase, taxAmount: itemTaxAmount, taxRate: isTaxEnabled ? itemSpecificTaxRate : 0,
                    taxType: finalTaxType, discountPercentage: currentDiscount,
                };
            });
        };

        const finalInvoiceTotal = finalAmount - completionData.discount + (completionData.extraExpenseAmount || 0);
        const totalInvoiceDiscount = totalDiscount + (completionData.discount || 0);


        const saveOperation = async (transaction: any, isNew: boolean, existingId?: string) => {
            const customDate = getParsedInvoiceDate();
            const saleData: any = {
                items: formatItemsForDB(items),
                subtotal,
                discount: totalInvoiceDiscount,
                manualDiscount: completionData.discount || 0,
                revDiscount: completionData.revDiscount || 0,
                roundOff: roundOff,
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

                // --- EXPLICITLY MAP NEW FIELDS HERE ---
                shippingName: completionData.shippingName || '',
                shippingNumber: completionData.shippingNumber || '',
                shippingAddress: completionData.shippingAddress || '',
                shippingGST: completionData.shippingGST || '',
                extraExpenseName: completionData.extraExpenseName || '',
                extraExpenseAmount: completionData.extraExpenseAmount || 0,
                narration: completionData.narration || '',
            };

            // 2. Handle New vs Edit behavior
            if (isNew) {
                // 1. References
                const counterRef = doc(db, 'companies', companyId, 'counters', 'invoiceCounter');
                const settingsRef = doc(db, 'companies', companyId, 'settings', 'sales-settings');

                // 2. FRESH FETCH INSIDE THE LOCK (Transaction)
                // This makes sure this tab sees exactly what's in the DB right now
                const [counterDoc, settingsDoc] = await Promise.all([
                    transaction.get(counterRef),
                    transaction.get(settingsRef)
                ]);

                const prefix = settingsDoc.exists() ? (settingsDoc.data().voucherPrefix || 'INV') : 'INV';
                const nextNumber = counterDoc.exists() ? (counterDoc.data().currentNumber || 1) : 1;
                const finalInvNo = isInvoiceNumberManuallyEdited.current
                    ? invoiceNumber  // Use what the user typed
                    : `${prefix}-${nextNumber}`;

                // 3. Assign the "Database Truth" number to the sale
                saleData.createdAt = customDate;
                saleData.invoiceNumber = finalInvNo;
                saleData.userId = currentUser.uid;
                saleData.companyId = companyId;
                saleData.voucherName = salesSettings?.voucherName ?? 'Sales';

                const newSaleRef = doc(collection(db, "companies", companyId, "sales"));

                // 4. Set the Sale
                transaction.set(newSaleRef, saleData);

                // 5. Increment the Counter
                if (!isInvoiceNumberManuallyEdited.current) {
                    transaction.set(counterRef, { currentNumber: nextNumber + 1 }, { merge: true });
                }

                // Result returned to the UI
                return { id: newSaleRef.id, number: finalInvNo };


            } else if (existingId) {
                const invoiceRef = doc(db, "companies", companyId, "sales", existingId);
                saleData.createdAt = customDate;
                transaction.update(invoiceRef, saleData);
                return { id: existingId, number: invoiceToEdit.invoiceNumber };
            }
            return null;
        };

        try {
            if (isEditMode && invoiceToEdit?.id) {
                await runTransaction(db, async (transaction) => {
                    await saveOperation(transaction, false, invoiceToEdit.id);

                    // 1. Calculate the original quantities from the saved invoice
                    const oldQuantities = new Map<string, number>();
                    (invoiceToEdit.items || []).forEach((oldItem: any) => {
                        const pid = oldItem.productId || oldItem.id;
                        const oldMultiplier = oldItem.unitMultiplier || 1;
                        const oldQty = (oldItem.quantity || 1) * oldMultiplier;
                        oldQuantities.set(pid, (oldQuantities.get(pid) || 0) + oldQty);
                    });

                    // 2. Calculate the new quantities from the current cart
                    const newQuantities = new Map<string, number>();
                    items.forEach(newItem => {
                        const pid = newItem.productId || newItem.id;
                        if (pid) {
                            const newMultiplier = newItem.unitMultiplier || 1;
                            const newQty = (newItem.quantity || 1) * newMultiplier;
                            newQuantities.set(pid, (newQuantities.get(pid) || 0) + newQty);
                        }
                    });

                    // 3. Compare and apply the difference to Firestore
                    const allProductIds = new Set([...oldQuantities.keys(), ...newQuantities.keys()]);

                    allProductIds.forEach(pid => {
                        const oldTotal = oldQuantities.get(pid) || 0;
                        const newTotal = newQuantities.get(pid) || 0;
                        const difference = newTotal - oldTotal; // How many MORE we are selling

                        // Only run the update if the quantity actually changed
                        if (difference !== 0) {
                            const itemRef = doc(db, "companies", companyId, "items", pid);
                            // -difference: If we sell 1 more, deduct 1. If we remove 1, add 1 back.
                            transaction.update(itemRef, {
                                stock: firebaseIncrement(-difference),
                                updatedAt: serverTimestamp()
                            });
                        }
                    });
                });
                showSuccessModal("Invoice Updated", ROUTES.JOURNAL);
            } else {
                let result: any = null;
                await runTransaction(db, async (transaction) => {
                    result = await saveOperation(transaction, true);

                    // Existing logic for New Invoices stays exactly the same
                    items.forEach(i => {
                        const pid = i.productId || i.id;
                        if (pid && !i.isCustomAmount) {
                            const itemRef = doc(db, "companies", companyId, "items", pid);
                            transaction.update(itemRef, { stock: firebaseIncrement(-(i.quantity || 1)), updatedAt: serverTimestamp() }); // BACK TO NORMAL
                        }
                    });

                    if (settingsDocId) {
                        const settingsRef = doc(db, "companies", companyId, "settings", settingsDocId);
                        transaction.update(settingsRef, { currentVoucherNumber: firebaseIncrement(1) });
                    }
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
                        items: finalizedItems
                    };

                    setIsDrawerOpen(false);
                    setSavedBillData({ id: result.id, number: result.number, invoiceData: invoiceData });
                    localStorage.removeItem('sales_cart_draft');
                    setItems([]);
                    const nextNum = await peekNextInvoiceNumber(currentUser.companyId);
                    isInvoiceNumberManuallyEdited.current = false;
                    setInvoiceNumber(nextNum);
                }
            }
        } catch (e: any) {
            console.error(e); setModal({ message: "Error saving", type: State.ERROR });
        } finally {
            setIsSaving(false);
        }
    };

    const preparePdfData = async (invoice: any) => {
        if (!currentUser?.companyId) return null;
        const dbOps = getFirestoreOperations(currentUser.companyId);
        const [businessInfo, fetchedItems, billSettingsSnap] = await Promise.all([
            dbOps.getBusinessInfo(),
            dbOps.syncItems(),
            getDoc(doc(db, 'companies', currentUser.companyId, 'settings', 'bill'))
        ]);
        const billSettings = billSettingsSnap.exists() ? billSettingsSnap.data() : {};

        const populatedItems = (invoice.items || []).map((item: any, index: number) => {
            const fullItem = fetchedItems.find((fi: any) => fi.id === item.productId || fi.id === item.id);
            const finalTaxRate = item.taxRate || item.tax || fullItem?.tax || 0;
            const itemAmount = (item.finalPrice !== undefined && item.finalPrice !== null) ? item.finalPrice : (item.mrp * item.quantity);

            return {
                sno: index + 1,
                name: item.name,
                quantity: item.quantity,
                unit: fullItem?.unit || item.unit || "Pcs",
                listPrice: item.mrp,
                gstPercent: finalTaxRate,
                hsn: fullItem?.hsnSac || item.hsnSac || "N/A",
                discountAmount: item.discount || 0,
                amount: itemAmount
            };
        });

        return {
            gstScheme: salesSettings?.gstScheme || '',
            taxType: salesSettings?.taxType || '',
            companyName: businessInfo?.name || 'Your Company',
            companyAddress: businessInfo?.address || 'Your Address',
            companyContact: businessInfo?.phoneNumber || 'Your Phone',
            companyEmail: businessInfo?.email || '',
            signatureBase64: billSettings.signatureBase64 || '',
            companyGstin: billSettings.companyGstin || businessInfo?.gstin || '',
            msmeNumber: billSettings.msmeNumber || '',
            panNumber: billSettings.panNumber || '',
            billDiscount: invoice.manualDiscount || 0,
            billTo: { name: invoice.partyName, address: invoice.partyAddress || '', phone: invoice.partyNumber || '', gstin: invoice.partyGstin || '' },
            invoice: {
                number: invoice.invoiceNumber,
                date: new Date(invoice.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true }),
                billedBy: salesSettings?.enableSalesmanSelection ? (invoice.salesmanName || 'N/A') : '',
                roNumber: '',
            },
            items: populatedItems,
            terms: billSettings.termsAndConditions || 'Goods once sold will not be taken back.',
            finalAmount: invoice.amount,
            bankDetails: {
                accountName: billSettings.accountName || businessInfo?.accountHolderName,
                accountNumber: billSettings.accountNumber || businessInfo?.accountNumber,
                bankName: billSettings.bankName || businessInfo?.bankName,
                ifsc: billSettings.ifscCode || '',
            }
        };
    };

    const handleSendWhatsapp = async (invoice: any) => {
        if (!invoice.partyNumber) {
            setModal({ message: "Customer phone number is missing.", type: State.ERROR });
            return;
        }
        setSendingPdf(true);
        try {
            if (!currentUser?.companyId || !currentUser?.uid) throw new Error("User context missing.");

            const businessDocRef = doc(db, 'companies', currentUser.companyId, 'business_info', currentUser.companyId);
            const businessSnap = await getDoc(businessDocRef);
            const { botMasterToken, whatsappNumber } = businessSnap.data() || {};

            if (!botMasterToken || !whatsappNumber) {
                setSendingPdf(false);
                navigate(ROUTES.WHATSAPP_PLAN);
                return;
            }

            const dataForPdf = await preparePdfData(invoice);
            if (!dataForPdf) throw new Error("Failed to prepare invoice data.");
            const pdfBlob = await generatePdfBlob(dataForPdf);

            const safeNum = invoice.invoiceNumber.replace(/[\/\\?%*:|"<>]/g, '-');
            const cleanName = `${safeNum}.pdf`;
            const storageRef = ref(storage, cleanName);
            await uploadBytes(storageRef, pdfBlob);

            const fileUrl = await getDownloadURL(storageRef);
            const message = `Hello ${invoice.partyName},\n\nHere is your invoice #${invoice.invoiceNumber}.\nAmount: ${invoice.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}\n\nThank you!`;

            const response = await botMasterService.sendPdfFromUrl(botMasterToken, whatsappNumber, invoice.partyNumber, message, fileUrl, cleanName);

            let isSuccess = false;
            if (Array.isArray(response) && response.length > 0) {
                if (response[0].status === 'sent' || response[0].status === 'delivered') isSuccess = true;
            } else if (response?.status === 'sent' || response?.status === 'success' || response?.status === 200) {
                isSuccess = true;
            }

            if (isSuccess) {
                setModal({ message: "Invoice sent via WhatsApp!", type: State.SUCCESS });
                setTimeout(async () => {
                    try { await deleteObject(storageRef); } catch (e) { console.warn("Could not auto-delete:", e); }
                }, 60000);
            } else {
                throw new Error("API reported failure.");
            }
        } catch (err: any) {
            console.error("WhatsApp Send Error:", err);
            setModal({ message: "Failed to send WhatsApp invoice.", type: State.ERROR });
        } finally {
            setSendingPdf(false);
        }
    };

    const showSuccessModal = (message: string, navigateTo?: string) => {
        localStorage.removeItem('sales_cart_draft');
        setIsDrawerOpen(false);
        setModal({ message, type: State.SUCCESS });
        setTimeout(() => { setModal(null); if (navigateTo) navigate(navigateTo); else if (!salesSettings?.copyVoucherAfterSaving) setItems([]); }, 1500);
    };
    const handleCloseQrModal = () => { setSavedBillData(null); };

    if (pageIsLoading) return <div className="flex items-center justify-center h-screen"><Spinner /> <p className="ml-2">Loading...</p></div>;
    if (error) return <div className="flex flex-col items-center justify-center h-screen text-red-600"><p>{error}</p><button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Go Back</button></div>;

    // --- Render Tax Toggle (DROPDOWN) ---
    const renderTaxToggle = () => {
        const isSettingLocked = salesSettings?.lockTaxToggle ?? false;
        const isSchemeLocked = salesSettings?.gstScheme !== 'regular';
        const isLocked = isSettingLocked || isSchemeLocked;
        return (
            <>
                {/* MOBILE VIEW */}
                <div className="flex md:hidden justify-between items-center p-1 bg-white border-b border-gray-200 px-5 rounded-sm">
                    <span className="text-sm font-semibold text-gray-700">Tax Calculation</span>
                    <div className="relative">
                        <select
                            value={activeTaxMode}
                            onChange={(e) => setActiveTaxMode(e.target.value as any)}
                            disabled={(salesSettings?.gstScheme !== 'regular')}
                            className={`appearance-none border border-gray-300 pr-8 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium transition-all ${isLocked
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'bg-gray-50 hover:border-blue-400 text-gray-700 cursor-pointer'
                                }`}
                        >
                            <option value="exclusive">Tax Exclusive</option>
                            <option value="inclusive">Tax Inclusive</option>
                            <option value="exempt">Tax Exempt</option>
                        </select>
                        {!isLocked && (
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                                <FiChevronDown size={14} />
                            </div>
                        )}
                    </div>
                </div>

                {/* DESKTOP VIEW */}
                <div className="hidden md:flex flex-row items-center justify-between md:flex-col md:items-start gap-2 py-2 bg-white border-b border-gray-200">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                        Tax Calculation
                    </span>
                    <div className="relative w-1/2 md:w-full">
                        <select
                            value={activeTaxMode}
                            onChange={(e) => setActiveTaxMode(e.target.value as any)}
                            disabled={(salesSettings?.gstScheme !== 'regular')}
                            className={`appearance-none w-full bg-white border border-gray-300 px-3 py-2 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium transition-all shadow-sm md:px-4 md:py-2.5 md:text-[15px] md:rounded-sm ${isLocked
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'hover:border-blue-400 text-gray-700 cursor-pointer'
                                }`}
                        >
                            <option value="exclusive">Tax Exclusive</option>
                            <option value="inclusive">Tax Inclusive</option>
                            <option value="exempt">Tax Exempt</option>
                        </select>
                        {!isLocked && (
                            <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-gray-400">
                                <FiChevronDown size={14} />
                            </div>
                        )}
                    </div>
                </div>
            </>
        );
    };

    const renderHeader = () => (
        <>
            <div className="flex flex-col md:flex-row md:justify-between md:items-center bg-gray-100 md:bg-white border-b border-gray-200 shadow-sm flex-shrink-0 p-2 md:px-4 md:py-3 mb-2 md:mb-0">

                {/* MOBILE: date left, title center, inv no right */}
                <div className="flex md:hidden items-center justify-between w-full mb-2">
                    <div className="flex flex-col items-center">
                        <input
                            type="date"
                            value={invoiceDate}
                            onChange={(e) => setInvoiceDate(e.target.value)}
                            className="bg-transparent border-b border-gray-400 focus:border-blue-600 text-gray-800 font-bold text-center w-25 text-sm outline-none transition-colors cursor-pointer" // 👈 Widened to w-32 and added cursor-pointer
                        />
                        <span className="text-[9px] text-gray-400 uppercase tracking-wide mt-0.5">DATE</span>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-800 text-center flex-1">
                        Sales
                    </h1>
                    <div className="flex flex-col items-center">
                        <input
                            type="text"
                            value={invoiceNumber}
                            onChange={(e) => {
                                isInvoiceNumberManuallyEdited.current = true;
                                setInvoiceNumber(e.target.value)
                            }}
                            className="bg-transparent border-b border-gray-400 focus:border-blue-600 text-gray-800 font-bold text-center w-24 text-sm outline-none transition-colors"
                        />
                        <span className="text-[9px] text-gray-400 uppercase tracking-wide mt-0.5">INV NO</span>
                    </div>
                </div>

                {/* DESKTOP */}
                <div className="hidden md:flex md:flex-row md:items-center w-full md:w-auto gap-1 md:gap-4 md:mb-0">
                    <h1 className="text-2xl font-bold text-gray-800">
                        Sales
                    </h1>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">INV NO:</span>
                            <input
                                type="text"
                                value={invoiceNumber}
                                onChange={(e) => {
                                    isInvoiceNumberManuallyEdited.current = true;
                                    setInvoiceNumber(e.target.value);
                                }}
                                className="bg-transparent border-b border-gray-400 focus:border-blue-600 text-gray-800 font-bold text-center w-24 text-sm outline-none transition-colors"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">DATE:</span>
                            <input
                                type="date"
                                value={invoiceDate}
                                onChange={(e) => setInvoiceDate(e.target.value)}
                                className="bg-transparent border-b border-gray-400 focus:border-blue-600 text-gray-800 font-bold text-center w-25 text-sm outline-none transition-colors cursor-pointer" // 👈 Widened to w-32 and added cursor-pointer
                            />
                        </div>
                    </div>
                </div>

                {/* Sales / Sales Return buttons */}
                {!isEditMode && (
                    <div className="flex items-center justify-center md:justify-end gap-3">
                        <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.SALES)} active={isActive(ROUTES.SALES)}>Sales</CustomButton>
                        <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.SALES_RETURN)} active={isActive(ROUTES.SALES_RETURN)}>Sales Return</CustomButton>
                    </div>
                )}
            </div>
        </>
    );

    if (isCardView) {
        return (
            <div className="flex flex-col h-full bg-gray-100 w-full overflow-hidden pb-0">
                {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
                <BarcodeScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleBarcodeScanned} />
                <BarcodeLinkModal
                    isOpen={isBarcodeLinkModalOpen}
                    barcode={barcodeToLink}
                    items={availableItems}
                    isLinking={isLinkingBarcode}
                    onClose={closeBarcodeLinkModal}
                    onLink={handleLinkScannedBarcode}
                />
                {renderHeader()}
                <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

                    {/* LEFT PANEL */}
                    <div className="flex flex-col w-full md:w-3/4 h-full relative min-w-0 border-r border-gray-200 overflow-hidden">

                        {/* Search / category bar */}
                        <div className="flex-shrink-0 bg-gray-50 border-b border-gray-200">
                            {salesSettings?.enableSalesmanSelection && (
                                <div className="px-3 pt-2 pb-1 bg-white border-b border-gray-100 flex justify-center">
                                    <select
                                        value={selectedWorker?.uid || ''}
                                        onChange={(e) => {
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
                                </div>
                            )}
                            <div className="p-3 bg-white flex gap-2 items-center">
                                <div className="flex-grow relative">
                                    <input
                                        type="text"
                                        value={gridSearchQuery}
                                        onChange={(e) => setGridSearchQuery(e.target.value)}
                                        placeholder="Search items by name or barcode..."
                                        className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-8"
                                        autoComplete="off"
                                    />
                                    {gridSearchQuery && (
                                        <button
                                            onClick={() => setGridSearchQuery('')}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                        >
                                            <FiX size={14} />
                                        </button>
                                    )}
                                </div>
                                <button onClick={() => setIsScannerOpen(true)} className='bg-transparent text-gray-700 p-3 border border-gray-700 rounded-sm font-semibold transition hover:bg-gray-800 hover:text-white' title="Scan Barcode">
                                    <IconScanCircle width={20} height={20} />
                                </button>
                            </div>
                            <div className="flex gap-2 overflow-x-auto px-3 pb-3 bg-white border-b border-gray-300">
                                {categories.map(cat => (
                                    <button key={cat} onClick={() => setSelectedCategory(cat)}
                                        className={`px-3 py-1 rounded-sm text-xs whitespace-nowrap border transition ${selectedCategory === cat ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'}`}>
                                        {cat === 'All' ? 'All' : itemGroupMap[cat] || cat}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {/* Sort Bar */}
                        <div className="flex gap-1.5 items-center px-3 py-2 bg-white border-b border-gray-200 overflow-x-auto flex-shrink-0">
                            <span className="text-xs text-gray-400 font-medium uppercase tracking-wide whitespace-nowrap flex-shrink-0">Sort:</span>
                            {([
                                { value: 'az', label: 'A → Z' },
                                { value: 'za', label: 'Z → A' },
                                { value: 'price_asc', label: 'Price ↑' },
                                { value: 'price_desc', label: 'Price ↓' },
                            ] as const).map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setSortOrder(opt.value)}
                                    className={`px-2.5 py-1 rounded-sm text-xs whitespace-nowrap border transition flex-shrink-0 ${sortOrder === opt.value
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200'
                                        }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                        {/* Card grid — fills remaining height, scrollable */}
                        <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-5 bg-gray-100 pb-20"
                            style={{ gridAutoRows: 'auto', alignContent: 'start', gap: '14px', padding: '8px 14px' }}>
                            {sortedGridItems.map(item => {
                                const matchingCartItems = items.filter(i => i.productId === item.id);
                                const lastAddedCartItem = matchingCartItems[matchingCartItems.length - 1];
                                const isSelected = matchingCartItems.length > 0;
                                const quantity = matchingCartItems.reduce((sum, i) => sum + i.quantity, 0);
                                const isRoundingEnabled = salesSettings?.enableRounding ?? true;
                                const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;
                                const allowItemDiscount = salesSettings?.enableItemWiseDiscount ?? true;
                                const mrp = Number(item.mrp || 0);
                                const itemSalesPrice = Number(item.salesPrice || 0);
                                const presetDiscount = Number(item.discount || 0);
                                let defaultPrice = mrp;
                                if (itemSalesPrice > 0) {
                                    defaultPrice = itemSalesPrice;
                                } else if (presetDiscount > 0 && allowItemDiscount) {
                                    defaultPrice = mrp * (1 - (presetDiscount / 100));
                                }
                                defaultPrice = applyRounding(defaultPrice, isRoundingEnabled, roundingInterval);
                                const sp = lastAddedCartItem?.customPrice ?? item.salesPrice ?? item.mrp ?? 0;
                                const lineSubtotal = Math.round((Number(sp) * quantity) * 100) / 100;
                                const discPct = (!hideMrp && allowItemDiscount && mrp > 0 && Number(sp) < mrp)
                                    ? Math.round(((mrp - Number(sp)) / mrp) * 100)
                                    : 0;

                                if (isCardImageView) {
                                    const imageUrl: string | undefined =
                                        (item as any).image ||
                                        (item as any).imageUrl ||
                                        (item as any).thumbnail ||
                                        (item as any).imageURL;

                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => {
                                                if (isSelected) handleQuantityChange(lastAddedCartItem.id, quantity + 1);
                                                else addItemToCart(item);
                                            }}
                                            className={`bg-white rounded-sm flex flex-col w-full overflow-visible transition-all duration-200 relative group cursor-pointer
${isSelected
                                                    ? 'border-2 border-blue-400 shadow-md ring-1 ring-blue-100'
                                                    : 'border border-gray-100 hover:shadow-md hover:border-gray-200'}`}
                                            style={{ margin: '0 2px' }}
                                        >
                                            {/* ── Image Block ── */}
                                            <div className="relative w-full bg-gray-100 rounded-t-sm overflow-hidden" style={{ height: '140px' }}>

                                                {/* Centered image container */}
                                                <div className="w-full h-full flex items-center justify-center p-1.5">
                                                    {imageUrl ? (
                                                        <img
                                                            src={imageUrl}
                                                            alt={item.name}
                                                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                            loading="lazy"
                                                            onError={(e) => {
                                                                (e.currentTarget as HTMLImageElement).style.display = 'none';
                                                                const placeholder = (e.currentTarget as HTMLImageElement)
                                                                    .parentElement
                                                                    ?.querySelector<HTMLElement>('[data-no-image]');
                                                                if (placeholder) placeholder.style.display = 'flex';
                                                            }}
                                                        />
                                                    ) : null}

                                                    {/* Camera placeholder – shown when no image */}
                                                    <div
                                                        data-no-image
                                                        className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50"
                                                        style={{ display: imageUrl ? 'none' : 'flex' }}
                                                    >
                                                        <FiCamera className="text-gray-300" size={22} strokeWidth={1.4} />
                                                        <span className="text-[9px] text-gray-300 mt-1 uppercase tracking-wide font-medium">No Image</span>
                                                    </div>
                                                </div>

                                                {/* ── Discount badge – Blinkit style, top-left ── */}
                                                {discPct > 0 && (
                                                    <div
                                                        className="absolute top-1.5 left-1.5 z-10 bg-blue-600 text-white font-bold text-[9px] leading-tight px-1.5 py-[3px] rounded-md shadow-sm"
                                                    >
                                                        {discPct}% OFF
                                                    </div>
                                                )}

                                                {/* ✕ remove – shown only when in cart */}
                                                {isSelected && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteItem(lastAddedCartItem.id); }}
                                                        className="absolute top-1 right-1.5 z-20 w-5 h-5 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-sm text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors text-[10px] font-bold shadow-sm border border-gray-100"
                                                    >
                                                        ✕
                                                    </button>
                                                )}
                                            </div>

                                            {/* Content block */}
                                            <div className="p-1.5 sm:p-2 flex flex-col flex-1 gap-0.5">
                                                {/* Item name — always 2 lines, fixed height */}
                                                <div className="flex items-start justify-between gap-1" style={{ minHeight: '28px' }}>
                                                    <p
                                                        className="text-[11px]  font-bold text-gray-900 leading-snug flex-1 overflow-hidden"
                                                        style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
                                                        title={item.name}
                                                    >
                                                        {item.name.length > 45 ? item.name.slice(0, 45) : item.name}
                                                    </p>
                                                    <button onClick={(e) => { e.stopPropagation(); const orig = availableItems.find(a => a.id === item.id); if (orig) handleOpenEditDrawer(orig); }}
                                                        className="text-gray-400 hover:text-blue-600 flex-shrink-0 mt-0.5">
                                                        <FiEdit size={11} />
                                                    </button>
                                                </div>

                                                {/* Fixed bottom section — always same height regardless of name */}
                                                <div className="mt-auto flex flex-col gap-1 pt-1 border-t border-gray-50">

                                                    {/* Row 1: Price + MRP */}
                                                    <div className="flex items-baseline gap-1">
                                                        <span className="text-xs font-semibold text-gray-900">
                                                            ₹{Number(sp).toLocaleString('en-IN')}
                                                        </span>
                                                        {discPct > 0 && mrp > 0 && Number(sp) < mrp && (
                                                            <span className="text-[10px] text-gray-400 line-through">
                                                                ₹{mrp.toLocaleString('en-IN')}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Subtotal row — only when selected */}
                                                    {isSelected && (
                                                        <div className="flex items-center gap-1 border-t border-gray-50 pt-1 min-w-0">
                                                            <span className="text-[9px] uppercase text-gray-400 tracking-wide flex-shrink-0">Subtotal</span>
                                                            <span className="text-[10px] font-semibold text-blue-600 truncate">₹{lineSubtotal.toLocaleString('en-IN')}</span>
                                                        </div>
                                                    )}

                                                    {/* Row 3: Add button OR Quantity selector — always pinned last */}
                                                    {!isSelected ? (
                                                        <>
                                                            <div className="h-[18px] border-t border-gray-50" />
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    addItemToCart(item);
                                                                }}
                                                                className="w-full h-[26px] rounded-sm text-[11px] font-medium text-gray-600 bg-gray-100 hover:bg-blue-50 hover:text-blue-600 border border-gray-200 transition-colors"
                                                            >
                                                                + Add
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <div
                                                            className="flex items-center border border-gray-200 rounded-sm overflow-hidden bg-white w-full"
                                                        >
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (quantity > 1) handleQuantityChange(lastAddedCartItem.id, quantity - 1);
                                                                    else handleDeleteItem(lastAddedCartItem.id);
                                                                }}
                                                                className="h-7 flex-1 flex items-center justify-center bg-gray-50 hover:bg-gray-200 text-gray-700 font-bold text-sm transition-colors"
                                                            >−</button>
                                                            <span className="w-8 text-center text-[11px] font-semibold text-gray-800">{quantity}</span>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleQuantityChange(lastAddedCartItem.id, quantity + 1);
                                                                }}
                                                                className="h-7 flex-1 flex items-center justify-center bg-gray-50 hover:bg-gray-200 text-gray-700 font-bold text-sm transition-colors"
                                                            >+</button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }

                                // ── CARD WITHOUT IMAGE ───────────────────────────────────────────────────────
                                return (
                                    <div
                                        key={item.id}
                                        className={`bg-white rounded-sm border flex flex-col overflow-visible transition-all relative
                                      ${isSelected ? 'border-blue-400 ring-1 ring-blue-100' : 'border-gray-100 hover:shadow-sm'}`}
                                        style={{ minHeight: 130 }}
                                    >
                                        {/* Discount badge - corner stamp */}
                                        {discPct > 0 && (
                                            <div
                                                className="absolute -top-px -left-px bg-blue-600 text-white text-[8px] font-medium leading-tight text-center z-10"
                                                style={{ borderRadius: '10px 0 8px 0', padding: '3px 6px', minWidth: 28 }}
                                            >
                                                {discPct}% OFF
                                            </div>
                                        )}

                                        {/* X button - only when selected */}
                                        {isSelected && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDeleteItem(lastAddedCartItem.id); }}
                                                className="absolute top-1 right-2 text-gray-400 hover:text-red-500 transition-colors z-10 bg-transparent border-none cursor-pointer text-xs leading-none"
                                            >
                                                ✕
                                            </button>
                                        )}

                                        <div className="p-2.5 flex flex-col gap-1.5 flex-1">

                                            {/* Item name - 2 line clamp then ellipsis */}
                                            <p
                                                className="text-[12px] font-medium text-gray-900 leading-snug pr-4 min-h-[32px] flex items-start"
                                                style={{
                                                    marginTop: discPct > 0 ? 14 : 2,
                                                    display: '-webkit-box',
                                                    WebkitLineClamp: 2,
                                                    WebkitBoxOrient: 'vertical' as any,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                }}
                                                title={item.name}
                                            >
                                                {item.name}
                                            </p>

                                            {/* Price + edit icon in same row */}
                                            <div className="flex items-center justify-between gap-1">
                                                <div className="flex items-baseline gap-1.5">
                                                    <span className="text-xs font-semibold text-gray-900">
                                                        ₹{Number(sp).toLocaleString('en-IN')}
                                                    </span>
                                                    {discPct > 0 && mrp > 0 && Number(sp) < mrp && (
                                                        <span className="text-[10px] text-gray-400 line-through">
                                                            ₹{mrp.toLocaleString('en-IN')}
                                                        </span>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const orig = availableItems.find(a => a.id === item.id);
                                                        if (orig) handleOpenEditDrawer(orig);
                                                    }}
                                                    className="text-gray-400 hover:text-blue-600 transition-colors flex-shrink-0"
                                                >
                                                    <FiEdit size={10} />
                                                </button>
                                            </div>

                                            {/* Bottom - pinned, same height for all cards */}
                                            {/* Bottom - pinned, same height for all cards */}
                                            <div className="mt-auto pt-2 flex items-center justify-between gap-2 min-w-0 overflow-hidden">

                                                {!isSelected ? (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); addItemToCart(item); }}
                                                        className="w-full py-1.5 rounded-sm text-[11px] font-medium text-gray-600 bg-gray-100 hover:bg-blue-50 hover:text-blue-600 border border-gray-200 transition-colors"
                                                    >
                                                        + Add
                                                    </button>
                                                ) : (
                                                    <div className="flex items-center justify-between gap-1 w-full min-w-0 overflow-hidden">
                                                        {/* Subtotal LEFT */}
                                                        <div className="text-left min-w-0 flex-shrink overflow-hidden">
                                                            <p className="text-[9px] uppercase text-gray-400 tracking-wide leading-none">Subtotal</p>
                                                            <p className="text-[11px] font-semibold text-blue-600 truncate">
                                                                ₹{lineSubtotal.toLocaleString('en-IN')}
                                                            </p>
                                                        </div>

                                                        {/* Quantity RIGHT */}
                                                        <div className="flex items-center border border-gray-200 rounded-sm overflow-hidden bg-white flex-shrink-0">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); if (quantity > 1) handleQuantityChange(lastAddedCartItem.id, quantity - 1); else handleDeleteItem(lastAddedCartItem.id); }}
                                                                className="w-6 h-7 flex items-center justify-center bg-gray-50 hover:bg-gray-200 text-gray-700 font-bold text-sm transition-colors"
                                                            >−</button>
                                                            <span className="w-5 text-center text-xs font-semibold text-gray-800">{quantity}</span>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleQuantityChange(lastAddedCartItem.id, quantity + 1); }}
                                                                className="w-6 h-7 flex items-center justify-center bg-gray-50 hover:bg-gray-200 text-gray-700 font-bold text-sm transition-colors"
                                                            >+</button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Mobile footer — ONCE only */}
                        <div className="md:hidden">
                            <GenericBillFooter
                                isExpanded={isFooterExpanded}
                                onToggleExpand={() => setIsFooterExpanded(!isFooterExpanded)}
                                totalQuantity={totalQuantity} subtotal={subtotal}
                                totalDiscount={totalDiscount} taxAmount={taxAmount}
                                finalAmount={finalAmount} showTaxRow={showTaxRow}
                                taxLabel={`Tax (${activeTaxMode === 'inclusive' ? 'Inc' : 'Exc'})`}
                                actionLabel={isEditMode ? 'Update Invoice' : 'Proceed to Pay'}
                                onActionClick={handleProceedToPayment}
                                disableAction={items.length === 0}>
                                {renderTaxToggle()}
                            </GenericBillFooter>
                        </div>
                    </div>

                    {/* RIGHT PANEL — desktop only */}
                    <div className="hidden md:flex w-1/4 flex-col bg-white h-full relative border-l border-gray-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10">
                        <div className="flex-1 p-6 flex flex-col justify-end">
                            <div className="mb-6 border-b pb-2 flex items-end justify-between">
                                <h2 className="text-xl font-bold text-gray-800">Bill Summary</h2>
                                <span className="text-xs text-indigo-500 font-semibold">{items.length} Items</span>
                            </div>
                            {renderTaxToggle()}
                            <GenericBillFooter
                                isExpanded={true} onToggleExpand={() => { }}
                                totalQuantity={totalQuantity} subtotal={subtotal}
                                totalDiscount={totalDiscount} taxAmount={taxAmount}
                                finalAmount={finalAmount} showTaxRow={showTaxRow}
                                taxLabel={`Tax (${activeTaxMode === 'inclusive' ? 'Inc' : 'Exc'})`}
                                actionLabel={isEditMode ? 'Update Invoice' : 'Proceed to Pay'}
                                onActionClick={handleProceedToPayment}
                                disableAction={items.length === 0}
                            />
                        </div>
                    </div>
                </div>

                {/* Drawers & modals — rendered ONCE */}
                <PaymentDrawer
                    mode='sale' isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)}
                    subtotal={subtotal} billTotal={amountToPayNow}
                    onPaymentComplete={handleSavePayment}
                    isPartyNameEditable={!isEditMode}
                    initialPartyName={isEditMode ? invoiceToEdit?.partyName : ''}
                    initialPartyNumber={isEditMode ? invoiceToEdit?.partyNumber : ''}
                    initialPaymentMethods={isEditMode ? invoiceToEdit?.paymentMethods : undefined}
                    totalItemDiscount={totalDiscount} totalQuantity={totalQuantity}
                    initialDiscount={invoiceToEdit?.manualDiscount}
                    requireCustomerName={salesSettings?.requireCustomerName}
                    requireCustomerMobile={salesSettings?.requireCustomerMobile}
                    allowDueBilling={salesSettings?.allowDueBilling ?? false}
                />
                <ItemEditDrawer item={selectedItemForEdit} isOpen={isItemDrawerOpen} onClose={handleCloseEditDrawer} onSaveSuccess={handleSaveSuccess} />

                {savedBillData && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm flex flex-col items-center animate-in fade-in zoom-in duration-300">
                            <button onClick={handleCloseQrModal} className="self-end text-gray-400 hover:text-gray-600 mb-2"><FiX size={24} /></button>
                            <h3 className="text-xl font-bold text-gray-800 mb-1">Bill Saved!</h3>
                            <p className="text-sm text-gray-500 mb-4">Invoice #{savedBillData.number}</p>
                            <div className="bg-white p-2 border-2 border-gray-100 rounded-lg shadow-inner mb-4">
                                <QRCode value={`${window.location.origin}/download-bill/${currentUser?.companyId}/${savedBillData.id}`} size={200} viewBox="0 0 256 256" />
                            </div>
                            <p className="text-center text-sm text-gray-600 mb-4">Ask customer to scan this QR code to download their bill.</p>
                            {savedBillData.invoiceData?.partyNumber ? (
                                <button onClick={() => handleSendWhatsapp(savedBillData.invoiceData)} disabled={sendingPdf}
                                    className="w-full bg-green-500 text-white py-3 rounded-lg font-semibold hover:bg-green-600 transition-colors flex items-center justify-center gap-2 mb-3 disabled:opacity-50">
                                    {sendingPdf ? <Spinner /> : <><FiSend /> Send on WhatsApp</>}
                                </button>
                            ) : (
                                <p className="text-xs text-amber-600 mb-3 text-center bg-amber-50 p-2 rounded w-full border border-amber-200">No phone number provided for WhatsApp.</p>
                            )}
                            <button onClick={handleCloseQrModal} className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors">Done</button>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    if (isCalculatorView) {
        return (
            // fixed inset-0 completely disables page scrolling
            <div className="fixed inset-0 flex flex-col bg-transparent w-full overflow-hidden">
                {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

                {/* Top Navigation */}
                <div className="shrink-0 bg-white border-b border-gray-200">
                    <div className="flex flex-col md:flex-row md:justify-between md:items-center p-2 md:px-4 md:py-3">
                        <h1 className="text-2xl font-bold text-gray-800 text-center md:text-left md:mb-0">
                            Sales
                        </h1>
                    </div>
                </div>

                {/* Main Calculator Area */}
                <div className="flex-1 flex flex-col items-center p-1 sm:p-4 min-h-0 w-full">
                    <div className="w-full max-w-sm mx-auto flex flex-col h-full">

                        {/* Live Summary Totals (Moved Above Calculator) */}
                        <div className="flex justify-between items-end px-2 py-1 shrink-0">
                            <div className="flex flex-col">
                                <span className="text-gray-500 font-medium text-sm mb-0.5">Grand Total</span>
                                <span className="text-xs text-indigo-500 font-semibold">{liveItemCount} Items</span>
                            </div>
                            <span className="text-4xl font-bold text-gray-900 tracking-tight">₹{liveTotal.toFixed(2)}</span>
                        </div>
                        {/* Enlarged Display Screen */}
                        <div
                            className="bg-white border border-gray-200 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] p-4 flex flex-col items-end justify-end h-32 sm:h-40 shrink-0 w-full cursor-text"
                            onClick={() => displayRef.current?.focus()}
                        >
                            <input
                                ref={displayRef}
                                type="text"
                                inputMode="none" // <--- The magic attribute that hides mobile keyboards but keeps the cursor
                                value={calcInput}
                                placeholder="0"
                                onChange={(e) => {
                                    // Sanitizes native physical typing to only allow math chars
                                    const val = e.target.value.replace(/[^0-9*.\-+]/g, '');
                                    setCalcInput(val);
                                }}
                                className="text-4xl sm:text-5xl font-light text-gray-800 tracking-wide w-full text-right bg-transparent border-none outline-none m-0 p-0 overflow-x-auto caret-indigo-600"
                            />
                        </div>

                        <div className="grid grid-cols-8 sm:gap-2 flex-1 min-h-0 w-full">
                            {calcKeys.flat().map((key) => {
                                const { label, icon: Icon, colClass, type, value } = key;
                                const isFunction = type === 'function';
                                const isOperator = type === 'operator';
                                const isBackspace = value === 'Backspace';

                                return (
                                    <button
                                        key={key.label}
                                        onPointerDown={(e) => {
                                            e.preventDefault();
                                            if (isBackspace) {
                                                handlePointerDown(key);
                                            } else {
                                                handleKeypadPress(key);
                                            }
                                        }}
                                        onPointerUp={isBackspace ? () => handlePointerUp(key) : undefined}
                                        onPointerLeave={isBackspace ? () => handlePointerLeave(key) : undefined}
                                        className={`h-full w-full flex items-center justify-center text-2xl sm:text-3xl font-medium transition-all active:scale-95 border select-none
        ${isFunction ? 'bg-red-50 border-red-300 text-red-500 hover:bg-red-100' :
                                                isOperator ? 'bg-indigo-50 border-indigo-300 text-indigo-600 hover:bg-indigo-100' :
                                                    'bg-white shadow-sm border-gray-300 text-gray-800 hover:bg-gray-50'}
        ${colClass || 'col-span-2'}`}
                                    >
                                        {Icon ? <Icon size={28} /> : label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Bottom Action Bar (Now only holds the button) */}
                <div className="shrink-0 bg-transparent p-1 sm:p-4 shadow-[0_-4px_15px_-3px_rgba(0,0,0,0.05)] mb-16">
                    <div className="w-full max-w-sm mx-auto flex flex-col">
                        <button
                            onClick={handleCheckoutClick}
                            disabled={liveItemCount === 0}
                            className="w-full bg-emerald-500 rounded-xs hover:bg-emerald-600 disabled:bg-emerald-200 disabled:text-white text-white font-bold py-1 text-xl transition-colors shadow-md active:scale-[0.98]"
                        >
                            Proceed to Pay
                        </button>
                    </div>
                </div>

                {/* Modals & Drawers */}
                <PaymentDrawer
                    mode='calculator'
                    isOpen={isDrawerOpen}
                    onClose={() => {
                        setIsDrawerOpen(false);
                        if (stagedCalcInput) {
                            setCalcInput(stagedCalcInput);
                            setItems(prev => prev.filter(i => !i.isStagedCalcItem));
                            setStagedCalcInput('');
                        }
                    }}
                    enableCustomerDetails={salesSettings?.enableCustomerInfoToggle ?? false}
                    subtotal={subtotal}
                    billTotal={amountToPayNow}
                    onPaymentComplete={handleSavePayment}
                    enableShippingDetails={false}
                    enableExtraExpense={false}
                    enableNarration={false}
                    allowDueBilling={salesSettings?.allowDueBilling ?? false}
                    requireCustomerName={false}
                    requireCustomerMobile={false}
                    isPartyNameEditable={true}
                    initialPartyName={''}
                    initialPartyNumber={''}
                    totalItemDiscount={totalDiscount}
                    totalQuantity={totalQuantity}
                />

            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-gray-100 w-full overflow-hidden pb-2">
            {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
            <BarcodeScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleBarcodeScanned} />
            <BarcodeLinkModal
                isOpen={isBarcodeLinkModalOpen}
                barcode={barcodeToLink}
                items={availableItems}
                isLinking={isLinkingBarcode}
                onClose={closeBarcodeLinkModal}
                onLink={handleLinkScannedBarcode}
            />
            {renderHeader()}

            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

                <div className="flex flex-col w-full md:w-3/4 min-w-0 h-full relative">

                    <div className="flex-shrink-0 p-2 bg-white border-b pb-3 mb-2 rounded-sm md:mb-0 md:border-r border-gray-200">
                        <div className="flex gap-4 items-end w-full">
                            <div className="flex-grow">
                                <SearchableItemInput
                                    label="Search Item"
                                    placeholder="Search by name or barcode..."
                                    items={availableItems}
                                    onItemSelected={handleItemSelected}
                                    isLoading={pageIsLoading}
                                    error={error}
                                    onAddItem={(query) => navigate(ROUTES.ITEM_ADD, { state: { prefillName: query } })}
                                    categories={categories}
                                    itemGroupMap={itemGroupMap}
                                />
                            </div>
                            <button onClick={() => setIsScannerOpen(true)} className='bg-transparent text-gray-700 p-3 border border-gray-700 rounded-sm font-semibold transition hover:bg-gray-800 hover:text-white' title="Scan Barcode">
                                <IconScanCircle width={20} height={20} />
                            </button>
                        </div>
                    </div>

                    {/* Cart List Container */}
                    <div className="flex-1 flex flex-col bg-gray-100 overflow-y-hidden md:border-r border-gray-200">
                        <div className="pt-2 flex-shrink-0 grid grid-cols-3 items-center border-b pb-2 px-2">
                            <div className="justify-self-start"><h3 className="text-gray-700 font-medium">Cart</h3></div>
                            <div className="justify-self-center w-full flex justify-center">{salesSettings?.enableSalesmanSelection && <select
                                value={selectedWorker?.uid || ''}
                                onChange={(e) => {
                                    if (e.target.value === 'ADD_NEW_SALESMAN') {
                                        navigate(ROUTES.USER_ADD);
                                    } else {
                                        setSelectedWorker(workers.find(w => w.uid === e.target.value) || null);
                                    }
                                }}
                                className="p-1 border rounded text-sm"
                                disabled={!hasPermission(Permissions.ViewTransactions) || (isEditMode && !isManager)}
                            >
                                <option value="">Salesman</option>
                                {workers.map(w => <option key={w.uid} value={w.uid}>{w.name}</option>)}
                                <option value="ADD_NEW_SALESMAN" className="font-semibold border border-grey-300 bg-gray-100 hover:bg-gray-200">
                                    + Add New Salesman
                                </option>
                            </select>}</div>
                            <div className="justify-self-end">{items.length > 0 && <button onClick={handleClearCart} className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200 flex items-center gap-1"><FiTrash2 /> Clear</button>}</div>
                        </div>
                        <div className="flex-shrink-0 grid grid-cols-2 px-2 py-1">
                            {discountInfo && <div className="text-xs text-red-600">{discountInfo}</div>}
                            {priceInfo && <div className="text-xs text-red-600">{priceInfo}</div>}
                        </div>
                        <GenericCartList
                            items={displayItems}
                            availableItems={availableItems}
                            basePriceKey="mrp"
                            priceLabel="MRP"
                            settings={{
                                enableRounding: salesSettings?.enableRounding ?? true,
                                roundingInterval: (salesSettings as any)?.roundingInterval ?? 1,
                                enableItemWiseDiscount: salesSettings?.enableItemWiseDiscount ?? true,
                                lockDiscount: isDiscountLocked,
                                lockPrice: isPriceLocked,
                                hideMrp: hideMrp
                            }}
                            applyRounding={applyRounding}
                            State={State}
                            setModal={setModal}
                            onOpenEditDrawer={handleOpenEditDrawer}
                            onDeleteItem={handleDeleteItem}
                            onDiscountChange={handleDiscountChange}
                            onCustomPriceChange={handleCustomPriceChange}
                            onCustomPriceBlur={handleCustomPriceBlur}
                            onQuantityChange={handleQuantityChange}
                            onDiscountPressStart={handleDiscountPressStart}
                            onDiscountPressEnd={handleDiscountPressEnd}
                            onDiscountClick={handleDiscountClick}
                            onPricePressStart={handlePricePressStart}
                            onPricePressEnd={handlePricePressEnd}
                            onPriceClick={handlePriceClick}
                        />

                        {/* MOBILE FOOTER (Visible only on small screens) */}
                        <div className="md:hidden">

                            <GenericBillFooter
                                isExpanded={isFooterExpanded}
                                onToggleExpand={() => setIsFooterExpanded(!isFooterExpanded)}
                                totalQuantity={totalQuantity}
                                subtotal={subtotal}
                                totalDiscount={totalDiscount}
                                taxAmount={taxAmount}
                                finalAmount={finalAmount}
                                showTaxRow={showTaxRow}
                                taxLabel={`Tax (${activeTaxMode === 'inclusive' ? 'Inc' : 'Exc'})`}
                                actionLabel={isEditMode ? 'Update Invoice' : 'Proceed to Pay'}
                                onActionClick={handleProceedToPayment}
                                disableAction={items.length === 0}
                            >
                                {renderTaxToggle()}
                            </GenericBillFooter>
                        </div>
                    </div>
                </div>

                <div className="hidden md:flex w-1/4 flex-col bg-white h-full relative border-l border-gray-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10">
                    <div className="flex-1 p-6 flex flex-col justify-end">
                        <div className="mb-6 border-b pb-2 flex items-end justify-between">
                            <h2 className="text-xl font-bold text-gray-800">Bill Summary</h2>
                            <span className="text-xs text-indigo-500 font-semibold">{liveItemCount} Items</span>
                        </div>

                        {/* Desktop Toggle */}
                        {renderTaxToggle()}

                        <GenericBillFooter
                            isExpanded={true}
                            onToggleExpand={() => { }}
                            totalQuantity={totalQuantity}
                            subtotal={subtotal}
                            totalDiscount={totalDiscount}
                            taxAmount={taxAmount}
                            finalAmount={finalAmount}
                            showTaxRow={showTaxRow}
                            taxLabel={`Tax (${activeTaxMode === 'inclusive' ? 'Inc' : 'Exc'})`}
                            actionLabel={isEditMode ? 'Update Invoice' : 'Proceed to Pay'}
                            onActionClick={handleProceedToPayment}
                            disableAction={items.length === 0}
                        />
                    </div>
                </div>

            </div>

            <PaymentDrawer isOpen={isDrawerOpen}
                mode='sale'
                onClose={() => setIsDrawerOpen(false)}
                subtotal={subtotal} billTotal={amountToPayNow}
                totalTax={taxAmount}
                onPaymentComplete={handleSavePayment}
                initialDiscount={invoiceToEdit?.manualDiscount}
                allowDueBilling={salesSettings?.allowDueBilling ?? false}
                isPartyNameEditable={!isEditMode}
                initialPartyName={isEditMode ? invoiceToEdit?.partyName : ''}
                initialPartyNumber={isEditMode ? invoiceToEdit?.partyNumber : ''}
                initialPaymentMethods={isEditMode ? invoiceToEdit?.paymentMethods : undefined}
                totalItemDiscount={totalDiscount} totalQuantity={totalQuantity}
                requireCustomerName={salesSettings?.requireCustomerName}
                requireCustomerMobile={salesSettings?.requireCustomerMobile}
                initialShippingName={isEditMode ? invoiceToEdit?.shippingName : ''}
                initialShippingNumber={isEditMode ? invoiceToEdit?.shippingNumber : ''}
                initialShippingAddress={isEditMode ? invoiceToEdit?.shippingAddress : ''}
                initialShippingGST={isEditMode ? invoiceToEdit?.shippingGST : ''}
                initialExpenseName={isEditMode ? invoiceToEdit?.extraExpenseName : ''}
                initialExpenseAmount={isEditMode ? invoiceToEdit?.extraExpenseAmount : ''}
                initialNarration={isEditMode ? invoiceToEdit?.narration : ''}
                enableShippingDetails={salesSettings?.enableShippingDetails}
                enableExtraExpense={salesSettings?.enableExtraExpense}
                enableNarration={salesSettings?.enableNarration}
            />
            <ItemEditDrawer item={selectedItemForEdit} isOpen={isItemDrawerOpen} onClose={handleCloseEditDrawer} onSaveSuccess={handleSaveSuccess} />

            {savedBillData && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm flex flex-col items-center animate-in fade-in zoom-in duration-300">
                        <button onClick={handleCloseQrModal} className="self-end text-gray-400 hover:text-gray-600 mb-2">
                            <FiX size={24} />
                        </button>
                        <h3 className="text-xl font-bold text-gray-800 mb-1">Bill Saved!</h3>
                        <p className="text-sm text-gray-500 mb-4">Invoice #{savedBillData.number}</p>

                        <div className="bg-white p-2 border-2 border-gray-100 rounded-lg shadow-inner mb-4">
                            <QRCode
                                value={`${window.location.origin}/download-bill/${currentUser?.companyId}/${savedBillData?.id}`}
                                size={200}
                                viewBox={`0 0 256 256`}
                            />
                        </div>

                        <p className="text-center text-sm text-gray-600 mb-4">
                            Ask customer to scan this QR code to download their bill.
                        </p>

                        {/* --- NEW WHATSAPP BUTTON --- */}
                        {savedBillData.invoiceData?.partyNumber ? (
                            <button
                                onClick={() => handleSendWhatsapp(savedBillData.invoiceData)}
                                disabled={sendingPdf}
                                className="w-full bg-green-500 text-white py-3 rounded-lg font-semibold hover:bg-green-600 transition-colors flex items-center justify-center gap-2 mb-3 disabled:opacity-50"
                            >
                                {sendingPdf ? <Spinner /> : <><FiSend /> Send on WhatsApp</>}
                            </button>
                        ) : (
                            <p className="text-xs text-amber-600 mb-3 text-center bg-amber-50 p-2 rounded w-full border border-amber-200">
                                No phone number provided for WhatsApp.
                            </p>
                        )}

                        <button
                            onClick={handleCloseQrModal}
                            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Sales;