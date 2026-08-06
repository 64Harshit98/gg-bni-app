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
import { Permissions, ROLES, State, Variant, ACTION } from '../../enums';
import { CustomButton } from '../../Components';
import type { User } from '../../Role/permission';
import { useSalesSettings } from '../../context/SettingsContext';
import { Spinner } from '../../constants/Spinner';
import { ItemEditDrawer } from '../../Components/ItemDrawer';
import { GenericCartList } from '../../Components/CartItem';
import BarcodeLinkModal from '../../Components/BarcodeLinkModal';
import { FiTrash2, FiX, FiEdit, FiCamera, FiDelete, FiSearch, FiMenu } from 'react-icons/fi';
import { GenericBillFooter } from '../../Components/Footer';
import { IconScanCircle, IconPrint } from '../../constants/Icons';
import QRCode from 'react-qr-code';
import { FiSend } from 'react-icons/fi';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../../lib/Firebase';
import { generatePdfBlob, generatePdf } from '../../UseComponents/pdfGenerator';
import { getFirestoreOperations } from '../../lib/ItemsFirebase';
import { botMasterService } from '../Additional/Whatsapp/WhatsappApi';
import { PLAN_ALLOWED_FEATURES } from '../Settings/SalesSetting';
import CalcDisplay from '../../Components/CalcDisplay';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
import { useLiveItemsStock } from '../hooks/useLiveItemsStock';

export interface SalesItem extends OriginalSalesItem {
    isEditable: boolean;
    customPrice?: number | string;
    discount2?: number;
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
    unit?: string;
    unitMultiplier?: number;
    moq?: number;
    packetSize?: number | undefined;
    isCustomAmount?: boolean;
    isStagedCalcItem?: boolean;
     addedAt?: number;   // 👈 NEW: 
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
    const [printingPdf, setPrintingPdf] = useState(false);
    const [showPrintSubMenu, setShowPrintSubMenu] = useState(false);
    const [enableTriplicate, setEnableTriplicate] = useState(false);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isSortOpen, setIsSortOpen] = useState(false);
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
            const savedDraft = sessionStorage.getItem('sales_cart_draft');
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
    const [duplicateItemPrompt, setDuplicateItemPrompt] = useState<{ item: Item; existingCount: number } | null>(null);
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
    const [cartSearchQuery, setCartSearchQuery] = useState<string>('');
    const [isFooterExpanded, setIsFooterExpanded] = useState(false);

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
            // 1. Check session storage first
            const savedTaxMode = sessionStorage.getItem('sales_tax_mode_draft');
            if (!isEditMode && (savedTaxMode === 'inclusive' || savedTaxMode === 'exclusive' || savedTaxMode === 'exempt')) {
                setActiveTaxMode(savedTaxMode);
            }
            // 2. Fallback to pre-select based on Settings
            else if (salesSettings.gstScheme === 'none' || salesSettings.gstScheme === 'composition') {
                setActiveTaxMode('exempt');
            } else {
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
                    const savedSalesmanUid = sessionStorage.getItem('sales_salesman_draft');
                    if (savedSalesmanUid) {
                        const savedWorker = fetchedWorkers.find(u => u.uid === savedSalesmanUid);
                        setSelectedWorker(savedWorker || null);
                    } else {
                        const currentUserAsWorker = fetchedWorkers.find(u => u.uid === currentUser.uid);
                        setSelectedWorker(currentUserAsWorker || null);
                    }
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
        const fetchBillSettings = async () => {
            if (!currentUser?.companyId) return;
            try {
                const billSettingsRef = doc(db, 'companies', currentUser.companyId, 'settings', 'bill');
                const snap = await getDoc(billSettingsRef);
                if (snap.exists()) setEnableTriplicate(!!snap.data().enableTriplicate);
            } catch (err) {
                console.error('Error fetching bill settings for triplicate flag:', err);
            }
        };
        fetchBillSettings();
    }, [currentUser?.companyId]);

    // Keeps availableItems' `stock` field live-synced — see useLiveItemsStock.ts
    useLiveItemsStock(currentUser?.companyId, setAvailableItems);

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
                discount2: item.discount2 || 0,
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
                unitMultiplier: 1,  // ADDED
                packetSize: item.packetSize || null,
            }));
            setItems(nonEditableItems);
        }
    }, [isEditMode, invoiceToEdit]);

    useEffect(() => {
        if (!isEditMode && !pageIsLoading) {
            sessionStorage.setItem('sales_cart_draft', JSON.stringify(items));
        }
    }, [items, isEditMode, pageIsLoading]);

    useEffect(() => {
        if (!isEditMode && activeTaxMode && !pageIsLoading) {
            sessionStorage.setItem('sales_tax_mode_draft', activeTaxMode);
        }
    }, [activeTaxMode, isEditMode, pageIsLoading]);

    useEffect(() => {
        if (!isEditMode && !pageIsLoading) {
            if (selectedWorker) {
                sessionStorage.setItem('sales_salesman_draft', selectedWorker.uid);
            } else {
                sessionStorage.removeItem('sales_salesman_draft');
            }
        }
    }, [selectedWorker, isEditMode, pageIsLoading]);

    const categories = useMemo(() => {
        const groups = new Set(availableItems.map(i => i.itemGroupId || 'uncategorized'));
        return ['All', ...Array.from(groups).sort()];
    }, [availableItems]);

    const sortedGridItems = useMemo(() => {
        const filtered = availableItems.filter(item => {
            const itemGroupId = item.itemGroupId || 'uncategorized';
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

    const { subtotal, totalDiscount, taxAmount, finalAmount, totalQuantity, totalMrp } = useMemo(() => {
        let accumulatorSubtotal = 0;
        let accumulatorTaxable = 0;
        let accumulatorTax = 0;
        let accumulatorQuantity = 0;
        let accumulatorMrp = 0;

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
            const basePrice = (cartItem.mrp > 0) ? cartItem.mrp : (cartItem.salesPrice || 0);
            accumulatorMrp += basePrice * currentQuantity;

            let baseForSubtotal = (cartItem.mrp > 0) ? cartItem.mrp : (cartItem.salesPrice || 0);
            const itemSpecificTaxRate = cartItem.tax !== undefined ? Number(cartItem.tax) : taxRate;

            if (effectiveTaxMode === 'inclusive' && itemSpecificTaxRate > 0) {
                baseForSubtotal = baseForSubtotal / (1 + (itemSpecificTaxRate / 100));
            }

            accumulatorSubtotal += baseForSubtotal * currentQuantity;

            const baseForDiscount = (cartItem.mrp > 0) ? cartItem.mrp : (cartItem.salesPrice || 0);
            let effectiveUnitPrice = 0;
            if (cartItem.customPrice !== undefined && cartItem.customPrice !== null && cartItem.customPrice !== '') {
                effectiveUnitPrice = parseFloat(String(cartItem.customPrice));
            } else {
                const priceAfterDiscount1 = baseForDiscount * (1 - (cartItem.discount || 0) / 100);
                effectiveUnitPrice = priceAfterDiscount1 * (1 - (cartItem.discount2 || 0) / 100);
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
            totalQuantity: accumulatorQuantity,
            totalMrp: accumulatorMrp
        };
    }, [items, salesSettings, activeTaxMode, gstSchemeDisplay]);

    const amountToPayNow = useMemo(() => finalAmount, [finalAmount]);
    // Helper to evaluate the current string (e.g., "100*2" -> 200)

    const displayRef = useRef<HTMLTextAreaElement>(null);
    const cartListRef = useRef<HTMLDivElement>(null);
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
    // Evaluates expressions like "23*5", "36-5", "45*5-10", "36" 
    // NO percentage handling here — that's done in parseFullEquation
    const evaluateSegmentNoPercent = (expr: string): number => {
        // Split by - to handle flat subtraction
        // But careful: "23*5-10" → base="23*5", subtract=10
        const subtractParts = expr.split('-');

        // First part may have multiplication
        let result = evaluateMultiplication(subtractParts[0]);

        // Remaining parts are subtracted flat
        for (let i = 1; i < subtractParts.length; i++) {
            const val = evaluateMultiplication(subtractParts[i]);
            if (!isNaN(val)) result -= val;
        }

        return result;
    };

    // Evaluates "23*5" or "100" — multiplication only
    const evaluateMultiplication = (expr: string): number => {
        const parts = expr.trim().split('*');
        let result = 1;
        let hasValid = false;

        parts.forEach(p => {
            const n = parseFloat(p.trim());
            if (!isNaN(n)) {
                result *= n;
                hasValid = true;
            }
        });

        return hasValid ? result : NaN;
    };
    // Parses the entire string on the screen to calculate live totals and generate items
    const parseFullEquation = (equation: string): { items: SalesItem[], total: number } => {
        if (!equation.trim()) return { items: [], total: 0 };

        // Split ONLY on + as separator (never treat + as addition)
        const segments = equation.split('+').map(s => s.trim()).filter(Boolean);

        const newItems: SalesItem[] = [];
        let grandTotal = 0;

        segments.forEach((segment) => {
            if (!segment.trim()) return;

            let segmentValue = 0;

            // Each segment can be:
            // "115"        → flat amount
            // "23*5"       → multiply
            // "36-5"       → flat subtract
            // "45*5-10"    → multiply then flat subtract
            // "20-2%"      → multiply/flat then percentage discount
            // "45*3-10%"   → multiply then percentage discount

            // Step 1: Check for percentage discount at the END (e.g. "45*3-10%")
            const percentDiscountMatch = segment.match(/^(.+)-(\d+(?:\.\d+)?)%$/);

            if (percentDiscountMatch) {
                const baseExpr = percentDiscountMatch[1].trim();  // "45*3" or "20"
                const discountPct = parseFloat(percentDiscountMatch[2]); // 10 or 2

                // Evaluate base expression (may have * and -)
                // First handle multiplication, then subtraction
                let baseValue = evaluateSegmentNoPercent(baseExpr);
                if (!isNaN(baseValue)) {
                    segmentValue = baseValue * (1 - discountPct / 100);
                }
            } else {
                // No percentage — evaluate as flat expression with * and -
                segmentValue = evaluateSegmentNoPercent(segment);
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
                    discount2: 0,
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
                    isStagedCalcItem: false,
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
            if (document.activeElement === displayRef.current) {
                if (e.key === 'Enter' || e.key === '=') {
                    e.preventDefault();
                    handleCheckoutClick();
                } else if (e.key.toLowerCase() === 'c' || e.key === 'Escape') {
                    e.preventDefault();
                    if (calcInput === '') {
                        if (items.length > 0 && window.confirm("Are you sure you want to clear the bill?")) setItems([]);
                    } else {
                        setCalcInput('');
                    }
                }
                return;
            }
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
        const initialMoq = Number((itemToAdd as any).moq || 1);

        let finalNetPrice = 0;
        let calculatedDiscount = 0;

        // --- NEW 3-TIER LOGIC ---
        if (mrp > 0 && salesPrice > 0) {
            // Case 1: Both exist. Ignore DB discount. Calculate diff.
            finalNetPrice = salesPrice;
            calculatedDiscount = ((mrp - salesPrice) / mrp) * 100;
        } else if (salesPrice > 0) {
            // Case 2: Only Sales Price exists. Apply DB discount.
            calculatedDiscount = presetDiscount;
            finalNetPrice = salesPrice * (1 - (presetDiscount / 100));
        } else if (mrp > 0) {
            // Case 3: Only MRP exists. Apply DB discount.
            calculatedDiscount = presetDiscount;
            finalNetPrice = mrp * (1 - (presetDiscount / 100));
        }

        const isRoundingEnabled = salesSettings?.enableRounding ?? true;
        const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;
        finalNetPrice = applyRounding(finalNetPrice, isRoundingEnabled, roundingInterval);

        const newSalesItem: SalesItem = {
            ...itemToAdd,
            id: crypto.randomUUID(),
            productId: itemToAdd.id!,
            quantity: Math.max(1, initialMoq),
            discount: calculatedDiscount,
            discount2: 0,
            customPrice: finalNetPrice,
            isEditable: true,
            purchasePrice: itemToAdd.purchasePrice || 0,
            tax: itemTaxExtracted,
            itemGroupId: itemToAdd.itemGroupId || '',
            stock: itemToAdd.stock || (itemToAdd as any).Stock || 0,
            amount: itemToAdd.amount || 0,
            barcode: itemToAdd.barcode || '',
            restockQuantity: itemToAdd.restockQuantity || 0,
            unit: (itemToAdd as any).unit || '',
            unitMultiplier: 1,
            packetSize: (itemToAdd as any).packetSize || null,
            addedAt: Date.now(),
        };

        setItems(prev => {
            const insertionOrder = salesSettings?.cartInsertionOrder || 'top';
            const newList = insertionOrder === 'top' ? [newSalesItem, ...prev] : [...prev, newSalesItem];

            setTimeout(() => {
                if (cartListRef.current) {
                    if (insertionOrder === 'bottom') {
                        cartListRef.current.scrollTo({ top: cartListRef.current.scrollHeight, behavior: 'smooth' });
                    } else {
                        cartListRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                }
            }, 50);

            return newList;
        });
    };

    const [showClearCartConfirm, setShowClearCartConfirm] = useState(false);

    const handleClearCart = () => {
        if (items.length > 0) {
            setModal({
                message: 'Are you sure you want to remove all items from the cart?',
                type: State.ERROR,
            });
            setShowClearCartConfirm(true);
        }
    };
    const handleConfirmClearCart = () => {
        setItems([]);
        setCartSearchQuery('');
        setShowClearCartConfirm(false);
    };
    const handleItemSelected = (selectedItem: Item | null) => {
        if (!selectedItem) return;

        // Cart mein ye item pehle se hai kya (ek ya zyada baar)?
        const existingMatches = items.filter(i => i.productId === selectedItem.id);

        if (existingMatches.length > 0) {
            // Direct add mat karo — pehle user se poocho
            setDuplicateItemPrompt({ item: selectedItem, existingCount: existingMatches.length });
            setGridSearchQuery('');
            return;
        }

        addItemToCart(selectedItem);
        setGridSearchQuery('');
    };

    // User ne "Quantity Badhao" choose kiya
    const handleIncreaseExistingQuantity = () => {
        if (!duplicateItemPrompt) return;
        const targetProductId = duplicateItemPrompt.item.id;

        setItems(prev => {
            const matches = prev.filter(i => i.productId === targetProductId);
            if (matches.length === 0) return prev;

            // Sabse "last added" (sabse recent) wala line dhoondo
            const lastAdded = matches.reduce((latest, current) =>
                (current.addedAt || 0) > (latest.addedAt || 0) ? current : latest
            );

            return prev.map(i =>
                i.id === lastAdded.id ? { ...i, quantity: (i.quantity || 1) + 1 } : i
            );
        });

        setDuplicateItemPrompt(null);
    };

    // User ne "Naya Item Add Karo" choose kiya
    const handleAddAsNewLine = () => {
        if (!duplicateItemPrompt) return;
        addItemToCart(duplicateItemPrompt.item);
        setDuplicateItemPrompt(null);
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
        const safeDiscount = isNaN(n) ? 0 : Math.min(100, Math.max(0, n));
        setItems(prev => prev.map(i => {
            if (i.id === id) {
                // FIXED: Base price is MRP if it exists, otherwise Sales Price
                const basePrice = (i.mrp > 0) ? i.mrp : (i.salesPrice || 0);
                const safeDiscount2 = i.discount2 || 0;
                const priceAfterFirstDiscount = basePrice * (1 - safeDiscount / 100);
                let newPrice = priceAfterFirstDiscount * (1 - safeDiscount2 / 100);
                const isRoundingEnabled = salesSettings?.enableRounding ?? true;
                const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;
                newPrice = applyRounding(newPrice, isRoundingEnabled, roundingInterval);
                return { ...i, discount: safeDiscount, customPrice: newPrice };
            }
            return i;
        }));
    };
    const handleDiscount2Change = (id: string, v: number | string) => {
        const n = typeof v === 'string' ? parseFloat(v) : v;
        const safeDiscount2 = isNaN(n) ? 0 : n;
        setItems(prev => prev.map(i => {
            if (i.id === id) {
                const basePrice = (i.mrp > 0) ? i.mrp : (i.salesPrice || 0);
                const safeDiscount1 = i.discount || 0;
                const priceAfterFirstDiscount = basePrice * (1 - safeDiscount1 / 100);
                let newPrice = priceAfterFirstDiscount * (1 - safeDiscount2 / 100);
                const isRoundingEnabled = salesSettings?.enableRounding ?? true;
                const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;
                newPrice = applyRounding(newPrice, isRoundingEnabled, roundingInterval);
                return { ...i, discount2: safeDiscount2, customPrice: newPrice };
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
                let d = 0;

                // FIXED: Base price is MRP if it exists, otherwise Sales Price
                const basePrice = (i.mrp > 0) ? i.mrp : (i.salesPrice || 0);

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
        setAvailableItems(prevItems => prevItems.map(item =>
            item.id === selectedItemForEdit?.id ? { ...item, ...updatedItemData, id: item.id } as Item : item
        ));

        const updateForCart: Partial<SalesItem> = { ...updatedItemData };
        if ((updateForCart as any).Stock !== undefined) {
            updateForCart.stock = (updateForCart as any).Stock;
            delete (updateForCart as any).Stock;
        }

        Object.keys(updateForCart).forEach(key => {
            if (updateForCart[key as keyof typeof updateForCart] === undefined) {
                delete updateForCart[key as keyof typeof updateForCart];
            }
        });

        setItems(prevCartItems => prevCartItems.map(cartItem => {
            if (cartItem.productId === selectedItemForEdit?.id || cartItem.id === selectedItemForEdit?.id) {
                const mergedItem = { ...cartItem, ...updateForCart } as SalesItem;

                const mrp = Number(mergedItem.mrp || 0);
                const salesPrice = Number(mergedItem.salesPrice || 0);
                const presetDiscount = Number(mergedItem.discount || 0);
                const existingDiscount2 = Number(mergedItem.discount2 || 0);

                let finalNetPrice = 0;
                let calculatedDiscount = 0;

                // --- NEW 3-TIER LOGIC ---
                if (mrp > 0 && salesPrice > 0) {
                    finalNetPrice = salesPrice;
                    calculatedDiscount = ((mrp - salesPrice) / mrp) * 100;
                } else if (salesPrice > 0) {
                    calculatedDiscount = presetDiscount;
                    finalNetPrice = salesPrice * (1 - (presetDiscount / 100));
                } else if (mrp > 0) {
                    calculatedDiscount = presetDiscount;
                    finalNetPrice = mrp * (1 - (presetDiscount / 100));
                }
                // Apply existing discount2 on top, compounding it
                finalNetPrice = finalNetPrice * (1 - (existingDiscount2 / 100));
                const isRoundingEnabled = salesSettings?.enableRounding ?? true;
                const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;
                finalNetPrice = applyRounding(finalNetPrice, isRoundingEnabled, roundingInterval);

                mergedItem.customPrice = finalNetPrice;
                mergedItem.discount = parseFloat(calculatedDiscount.toFixed(2)); // Make sure discount updates!
                mergedItem.discount2 = existingDiscount2;
                return mergedItem;
            }
            return cartItem;
        }));
    };
    const displayItems = useMemo(() => {
        const base = listSelectedCategory === 'All'
            ? items
            : items.filter(item => (item.itemGroupId || 'Others') === listSelectedCategory);

        const q = cartSearchQuery.trim().toLowerCase();
        if (!q) return base;

        // 👈 NEW: same "search bumps result to top" behavior as the Orders page search
        return [...base].sort((a, b) => {
            const aMatch = (a.name || '').toLowerCase().includes(q);
            const bMatch = (b.name || '').toLowerCase().includes(q);
            if (aMatch && !bMatch) return -1;
            if (!aMatch && bMatch) return 1;
            return 0; // keep original relative order otherwise
        });
    }, [items, listSelectedCategory, cartSearchQuery]);

    const handleProceedToPayment = () => {
        if (items.length === 0) {
            setModal({ message: 'Please add at least one item.', type: State.INFO });
            return;
        }
        if (salesSettings?.enableSalesmanSelection && !selectedWorker) {
            setModal({ message: 'Please select a salesman.', type: State.ERROR });
            return;
        }

        // --- NEW: MRP PRICE VALIDATION ---
        const invalidMrpItems: string[] = [];
        items.filter(i => !i.isCustomAmount).forEach(item => {
            const mrp = Number(item.mrp) || 0;

            // Only check if the item actually has an MRP set in the database
            if (mrp > 0) {
                let effectiveUnitPrice = 0;
                if (item.customPrice !== undefined && item.customPrice !== null && item.customPrice !== '') {
                    effectiveUnitPrice = parseFloat(String(item.customPrice));
                } else {
                    const currentDiscount = Number(item.discount) || 0;
                    effectiveUnitPrice = mrp * (1 - currentDiscount / 100);
                }

                // If the user's custom price is higher than the MRP, flag it
                if (effectiveUnitPrice > mrp) {
                    invalidMrpItems.push(`${item.name} (Max: ₹${mrp})`);
                }
            }
        });

        // Block the payment drawer from opening and show an error
        if (invalidMrpItems.length > 0) {
            setModal({
                message: `Selling price cannot exceed MRP for: ${invalidMrpItems.join(', ')}`,
                type: State.ERROR
            });
            return;
        }
        // ---------------------------------

        if (!(salesSettings as any)?.allowNegativeStock) {
            // Build a map of quantities already committed in the ORIGINAL invoice
            const originalQuantities = new Map<string, number>();
            if (isEditMode && invoiceToEdit?.items) {
                (invoiceToEdit.items as any[]).forEach((oldItem) => {
                    const pid = oldItem.productId || oldItem.id;
                    const oldQty = oldItem.quantity || 1;
                    originalQuantities.set(pid, (originalQuantities.get(pid) || 0) + oldQty);
                });
            }
            const stockNeeds = new Map<string, number>();
            items.filter(i => i.isEditable).forEach(i => {
                const pid = i.productId;
                const requiredStock = i.quantity || 1; // Multiplier removed. 1:1 mapping.
                stockNeeds.set(pid, (stockNeeds.get(pid) || 0) + requiredStock);
            });
            const invalidItems: string[] = [];
            stockNeeds.forEach((needed, pid) => {
                const avail = availableItems.find(a => a.id === pid);
                const currentStock = avail?.stock ?? 0;
                // Add back the original committed quantity — those units are already deducted
                const alreadyCommitted = originalQuantities.get(pid) || 0;
                const effectiveAvailable = currentStock + alreadyCommitted;
                if (effectiveAvailable < needed) {
                    invalidItems.push(`${avail?.name} (Avail:${effectiveAvailable}, Need:${needed})`);
                }
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

        const currentTaxRate = salesSettings?.defaultTaxRate ?? 0;
        const isRoundingEnabled = salesSettings?.enableRounding ?? true;
        const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;

        // --- NEW VARIABLES FOR PROPORTIONAL TAX ---
        const finalInvoiceTotal = completionData.finalAmount;
        const totalInvoiceDiscount = totalDiscount + (completionData.discount || 0);

        // Calculate proportional scale: (Total Before Drawer Discount - Drawer Discount) / Total Before Drawer Discount
        const billRatio = finalAmount > 0 ? Math.max(0, (finalAmount - (completionData.discount || 0)) / finalAmount) : 1;

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
                            return originalDate; // keeps original HH:MM:SS
                        }
                    }
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
                const currentDiscount = Number(item.discount) || 0;
                const currentDiscount2 = Number(item.discount2) || 0;
                const currentQuantity = Number(item.quantity) || 1;

                let effectiveUnitPrice = 0;
                if (customPrice !== undefined && customPrice !== null && customPrice !== '') {
                    effectiveUnitPrice = parseFloat(String(customPrice));
                } else {
                    const basePrice = (item.mrp && item.mrp > 0) ? item.mrp : (item.salesPrice || 0);
                    const priceAfterDiscount1 = basePrice * (1 - currentDiscount / 100);
                    effectiveUnitPrice = priceAfterDiscount1 * (1 - currentDiscount2 / 100);
                }

                effectiveUnitPrice = applyRounding(effectiveUnitPrice, isRoundingEnabled, roundingInterval);
                effectiveUnitPrice = toCurrency(effectiveUnitPrice);

                const lineTotal = toCurrency(effectiveUnitPrice * currentQuantity);

                // MATCH UI EXACTLY: Rely purely on finalGstScheme and finalTaxType
                let effectiveTaxMode = 'none';
                if (finalGstScheme === 'regular') {
                    effectiveTaxMode = finalTaxType === 'exempt' ? 'none' : finalTaxType;
                }

                // Extract tax safely
                const rawTax = item.tax ?? item.taxRate ?? currentTaxRate;
                const itemSpecificTaxRate = isNaN(Number(rawTax)) ? 0 : Number(rawTax);

                let itemTaxableBase = 0, itemTaxAmount = 0, itemFinalPrice = 0;

                if (effectiveTaxMode !== 'none' && itemSpecificTaxRate > 0) {
                    if (effectiveTaxMode === 'inclusive') {
                        itemFinalPrice = lineTotal;
                        itemTaxableBase = toCurrency(lineTotal / (1 + (itemSpecificTaxRate / 100)));
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

                // APPLY PROPORTIONAL DISCOUNT TO THE TAX VALUES ONLY
                const scaledTaxableBase = toCurrency(itemTaxableBase * billRatio);
                const scaledTaxAmount = toCurrency(itemTaxAmount * billRatio);

                return {
                    ...item,
                    id: item.productId || item.id,
                    quantity: currentQuantity,
                    discount: currentDiscount,
                    discount2: currentDiscount2,
                    effectiveUnitPrice: effectiveUnitPrice,
                    finalPrice: itemFinalPrice,
                    unit: item.unit || '',
                    unitMultiplier: 1,
                    packetSize: item.packetSize || null,
                    taxableAmount: scaledTaxableBase,
                    taxAmount: scaledTaxAmount,
                    taxRate: itemSpecificTaxRate,     // FIX: Forces the DB to save the actual percentage!
                    taxType: finalTaxType,
                    discountPercentage: currentDiscount,
                };
            });
        };

        const sanitizeForFirestore = (obj: any): any => {
            if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
            if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
                const cleaned: any = {};
                for (const [key, value] of Object.entries(obj)) {
                    if (value === undefined) cleaned[key] = null;
                    else if (typeof value === 'number' && isNaN(value)) cleaned[key] = 0;
                    else cleaned[key] = sanitizeForFirestore(value);
                }
                return cleaned;
            }
            return obj;
        };

        // 2. Generate finalized items WITH the proportional discount applied
        const finalizedItems = formatItemsForDB(items);

        // 3. Re-calculate total Tax and Taxable Amount from the finalized items
        const newTaxableAmount = toCurrency(finalizedItems.reduce((acc, item) => acc + item.taxableAmount, 0));
        const newTaxAmount = toCurrency(finalizedItems.reduce((acc, item) => acc + item.taxAmount, 0));

        // 4. Calculate perfect roundOff to ensure Database matches UI exactly
        const totalExpenseAmount = completionData.expenses?.reduce((sum, e) => sum + (Number(e.amount) || 0), 0) || 0;

        // 4. Calculate perfect roundOff to ensure Database matches UI exactly
        const rawInvoiceTotal = newTaxableAmount + newTaxAmount + totalExpenseAmount;
        const finalRoundOff = toCurrency(finalInvoiceTotal - rawInvoiceTotal);

        const saveOperation = async (transaction: any, isNew: boolean, existingId?: string) => {
            const customDate = getParsedInvoiceDate();
            const saleData: any = {
                items: finalizedItems,
                subtotal,
                discount: totalInvoiceDiscount,
                manualDiscount: completionData.discount || 0,
                revDiscount: completionData.revDiscount || 0,
                roundOff: finalRoundOff,
                taxableAmount: newTaxableAmount,
                taxAmount: newTaxAmount,
                gstScheme: finalGstScheme,
                taxType: finalTaxType,
                totalAmount: finalInvoiceTotal,
                paymentMethods: completionData.paymentDetails,
                partyName: completionData.partyName,
                partyNumber: completionData.partyNumber,
                partyAddress: completionData.partyAddress || '',
                partyGstin: completionData.partyGST || '',
                placeOfSupply: completionData.placeOfSupply || '',    // <-- ADD THIS
                shippingState: completionData.shippingState || '',
                salesmanId: finalSalesman.uid,
                salesmanName: finalSalesman.name,
                updatedAt: serverTimestamp(),
                shippingName: completionData.shippingName || '',
                shippingNumber: completionData.shippingNumber || '',
                shippingAddress: completionData.shippingAddress || '',
                shippingGST: completionData.shippingGST || '',
                expenses: completionData.expenses || [],
                narration: completionData.narration || '',
                transportDetails: completionData.transportDetails || null,
            };

            if (isNew) {
                const counterRef = doc(db, 'companies', companyId, 'counters', 'invoiceCounter');
                const settingsRef = doc(db, 'companies', companyId, 'settings', 'sales-settings');

                const [counterDoc, settingsDoc] = await Promise.all([
                    transaction.get(counterRef),
                    transaction.get(settingsRef)
                ]);

                const prefix = settingsDoc.exists() ? (settingsDoc.data().voucherPrefix || 'INV') : 'INV';
                const nextNumber = counterDoc.exists() ? (counterDoc.data().currentNumber || 1) : 1;
                const finalInvNo = isInvoiceNumberManuallyEdited.current ? invoiceNumber : `${prefix}-${nextNumber}`;

                saleData.createdAt = customDate;
                saleData.invoiceNumber = finalInvNo;
                saleData.userId = currentUser.uid;
                saleData.companyId = companyId;
                saleData.voucherName = salesSettings?.voucherName ?? 'Sales';

                const newSaleRef = doc(collection(db, "companies", companyId, "sales"));
                transaction.set(newSaleRef, sanitizeForFirestore(saleData));

                if (!isInvoiceNumberManuallyEdited.current) {
                    transaction.set(counterRef, { currentNumber: nextNumber + 1 }, { merge: true });
                }
                return { id: newSaleRef.id, number: finalInvNo };

            } else if (existingId) {
                const invoiceRef = doc(db, "companies", companyId, "sales", existingId);
                saleData.createdAt = customDate;
                saleData.invoiceNumber = invoiceNumber;
                transaction.update(invoiceRef, sanitizeForFirestore(saleData));
                return { id: existingId, number: invoiceNumber };
            }
            return null;
        };

        try {
            if (isEditMode && invoiceToEdit?.id) {
                await runTransaction(db, async (transaction) => {
                    await saveOperation(transaction, false, invoiceToEdit.id);

                    const oldQuantities = new Map<string, number>();
                    (invoiceToEdit.items || []).forEach((oldItem: any) => {
                        const pid = oldItem.productId || oldItem.id;
                        const oldQty = oldItem.quantity || 1;
                        oldQuantities.set(pid, (oldQuantities.get(pid) || 0) + oldQty);
                    });

                    const newQuantities = new Map<string, number>();
                    items.forEach(newItem => {
                        const pid = newItem.productId || newItem.id;
                        if (pid) {
                            const newQty = newItem.quantity || 1;
                            newQuantities.set(pid, (newQuantities.get(pid) || 0) + newQty);
                        }
                    });

                    const allProductIds = new Set([...oldQuantities.keys(), ...newQuantities.keys()]);

                    allProductIds.forEach(pid => {
                        const oldTotal = oldQuantities.get(pid) || 0;
                        const newTotal = newQuantities.get(pid) || 0;
                        const difference = newTotal - oldTotal;

                        if (difference !== 0) {
                            const itemRef = doc(db, "companies", companyId, "items", pid);
                            transaction.update(itemRef, {
                                stock: firebaseIncrement(-difference),
                                updatedAt: serverTimestamp()
                            });
                        }
                    });
                });

                setAvailableItems(prev => prev.map(item => {
                    const oldQty = (invoiceToEdit.items || [])
                        .filter((i: any) => (i.productId || i.id) === item.id)
                        .reduce((sum: number, i: any) => sum + (i.quantity || 1), 0);
                    const newQty = items
                        .filter(i => (i.productId || i.id) === item.id && !i.isCustomAmount)
                        .reduce((sum, i) => sum + (i.quantity || 1), 0);
                    const delta = newQty - oldQty;
                    if (delta === 0) return item;
                    return { ...item, stock: Math.max(0, (item.stock || 0) - delta) };
                }));
                showSuccessModal("Invoice Updated", ROUTES.JOURNAL);

            } else {
                let result: any = null;
                await runTransaction(db, async (transaction) => {
                    result = await saveOperation(transaction, true);

                    items.forEach(i => {
                        const pid = i.productId || i.id;
                        if (pid && !i.isCustomAmount) {
                            const itemRef = doc(db, "companies", companyId, "items", pid);
                            const totalToDeduct = i.quantity || 1;
                            transaction.update(itemRef, { stock: firebaseIncrement(-totalToDeduct), updatedAt: serverTimestamp() });
                        }
                    });

                    if (settingsDocId) {
                        const settingsRef = doc(db, "companies", companyId, "settings", settingsDocId);
                        transaction.update(settingsRef, { currentVoucherNumber: firebaseIncrement(1) });
                    }
                });

                if (result) {
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
                        expenses: completionData.expenses || [],
                        paymentMethods: completionData.paymentDetails,
                        dueAmount: completionData.paymentDetails?.due || 0,
                        shippingName: completionData.shippingName || '',
                        shippingNumber: completionData.shippingNumber || '',
                        shippingAddress: completionData.shippingAddress || '',
                        shippingGST: completionData.shippingGST || '',
                        transportDetails: completionData.transportDetails || undefined,
                        gstScheme: finalGstScheme,   // ✅ ADDED
                        taxType: finalTaxType,       // ✅ ADDED
                        placeOfSupply: completionData.placeOfSupply || ''   // ✅ ADDED (IGST calc ke liye bhi zaroori)
                    };

                    setAvailableItems(prev => prev.map(item => {
                        const stockDelta = items
                            .filter(i => (i.productId || i.id) === item.id && !i.isCustomAmount)
                            .reduce((sum, i) => sum + (i.quantity || 1), 0);
                        if (stockDelta === 0) return item;
                        return { ...item, stock: Math.max(0, (item.stock || 0) - stockDelta) };
                    }));

                    setIsDrawerOpen(false);
                    setSavedBillData({ id: result.id, number: result.number, invoiceData: invoiceData });
                    sessionStorage.removeItem('sales_cart_draft');
                    sessionStorage.removeItem('sales_tax_mode_draft');
                    sessionStorage.removeItem('sales_salesman_draft');
                    setItems([]);
                    setStagedCalcInput('');
                    setCalcInput('');
                    const nextNum = await peekNextInvoiceNumber(currentUser.companyId);
                    isInvoiceNumberManuallyEdited.current = false;
                    setInvoiceNumber(nextNum);
                }
            }
        } catch (e: any) {
            console.error("Save error:", e?.code, e?.message);

            if (e?.code === 'unavailable' || e?.message?.includes('network-request-failed')) {
                setModal({
                    message: 'Network lost while saving. Please check your connection and try again.',
                    type: State.ERROR
                });
            } else if (e?.code === 'permission-denied') {
                setModal({
                    message: 'You do not have permission to complete this action.',
                    type: State.ERROR
                });
            } else if (e?.code === 'aborted') {
                setModal({
                    message: 'Transaction conflict. Please try again.',
                    type: State.ERROR
                });
            } else {
                setModal({ message: 'Failed to save invoice. Please refresh the page and try again.', type: State.ERROR });
            }
        } finally {
            setIsSaving(false);
        }
    };

    const preparePdfData = async (invoice: any) => {
        if (!currentUser?.companyId) return null;
        const dbOps = getFirestoreOperations(currentUser.companyId);
        const [businessInfo, fetchedItems, billSettingsSnap, companyLogoBase64] = await Promise.all([
            dbOps.getBusinessInfo(),
            dbOps.syncItems(),
            getDoc(doc(db, 'companies', currentUser.companyId, 'settings', 'bill')),
            resolveCompanyLogoBase64(currentUser.companyId)
        ]);
        const billSettings = billSettingsSnap.exists() ? billSettingsSnap.data() : {};

        const populatedItems = (invoice.items || []).map((item: any, index: number) => {
            const fullItem = fetchedItems.find((fi: any) => fi.id === item.productId || fi.id === item.id);
            const finalTaxRate = item.taxRate || item.tax || fullItem?.tax || 0;
            const itemAmount = (item.finalPrice !== undefined && item.finalPrice !== null) ? item.finalPrice : (item.mrp * item.quantity);
            // --- Discount 1 + Discount 2 ko ₹ amount mein nikalna (Journal.tsx jaisa) ---
            const qty = Number(item.quantity) || 1;
            const actualMrp = Number(item.mrp) || 0;
            const basePrice = actualMrp > 0 ? actualMrp : (Number(item.salesPrice) || 0);

            const d1Pct = Number(item.discount || item.discountPercentage) || 0;
            const d2Pct = Number(item.discount2) || 0;

            const priceAfterD1 = basePrice * (1 - d1Pct / 100);
            const priceAfterD2 = priceAfterD1 * (1 - d2Pct / 100);

            const discount1Amount = (basePrice - priceAfterD1) * qty;
            let discount2Amount = (priceAfterD1 - priceAfterD2) * qty;

            // Agar discount2 % missing hai, actual amount se back-calculate karo
            if (d2Pct === 0 && itemAmount > 0) {
                const totalDiscountAmt = (basePrice * qty) - itemAmount;
                discount2Amount = Math.max(0, totalDiscountAmt - discount1Amount);
            }

            let absoluteDiscount = (basePrice * qty) - itemAmount;
            if (absoluteDiscount < 0) absoluteDiscount = 0;
            return {
                sno: index + 1,
                name: item.name,
                quantity: item.quantity,
                unit: fullItem?.unit || item.unit || "Pcs",
                listPrice: item.mrp,
                gstPercent: finalTaxRate,
                hsn: fullItem?.hsnSac || item.hsnSac || "N/A",
                discountAmount: absoluteDiscount,
                discount1Amount,
                discount2Amount,
                discount1Percent: d1Pct,   // NEW
                discount2Percent: d2Pct,   // NEW
                amount: itemAmount,
                taxAmount: item.taxAmount || 0,
                taxableAmount: item.taxableAmount || 0
            };
        });

        return {
            printFormat: billSettings.posPrintFormat || 'A4',
            enableTriplicate: billSettings.enableTriplicate || false,
            gstScheme: salesSettings?.gstScheme || '',
            taxType: salesSettings?.taxType || '',
            upiId: billSettings.upiId || '',   //  ADDED: without this, QR never generates
            companyName: businessInfo?.name || 'Your Company',
            companyAddress: businessInfo?.address || 'Your Address',
            companyContact: businessInfo?.phoneNumber || 'Your Phone',
            companyEmail: businessInfo?.email || '',
            companyLogoBase64: companyLogoBase64 || undefined,
            signatureBase64: billSettings.signatureBase64 || '',
            companyGstin: billSettings.companyGstin || businessInfo?.gstin || '',
            msmeNumber: billSettings.msmeNumber || '',
            panNumber: billSettings.panNumber || '',
            companyState: businessInfo?.state || '',
            billDiscount: invoice.manualDiscount || 0,
            discountDisplayFormat: billSettings?.discountDisplayFormat || 'amount',
            billTo: { name: invoice.partyName, address: invoice.partyAddress || '', phone: invoice.partyNumber || '', gstin: invoice.partyGstin || '' },
            shipTo: {
                name: invoice.shippingName || '',
                address: invoice.shippingAddress || '',
                phone: invoice.shippingNumber || '',
                gstin: invoice.shippingGST || '',
            },
            transportDetails: invoice.transportDetails || undefined,
            invoice: {
                number: invoice.invoiceNumber,
                date: new Date(invoice.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true }),
                billedBy: salesSettings?.enableSalesmanSelection ? (invoice.salesmanName || 'N/A') : '',
                roNumber: '',
            },
            items: populatedItems,
            terms: billSettings.posTermsAndConditions || billSettings.termsAndConditions || 'Goods once sold will not be taken back.',
            finalAmount: invoice.amount,
            expenses: invoice.expenses || [],
            advance: (() => {
                const pm = invoice.paymentMethods || {};
                const total = Object.entries(pm)
                    .filter(([k]) => k !== 'due')
                    .reduce((s, [, v]) => s + (Number(v) || 0), 0);
                return total > 0 ? total : 0;
            })(),
            due: invoice.dueAmount || 0,
            previousBalance: await (async () => {
                if (!currentUser?.companyId || !invoice.partyNumber) return 0;
                try {
                    const { getDocs, collection, query, where } = await import('firebase/firestore');
                    const salesRef = collection(db, 'companies', currentUser.companyId, 'sales');
                    const snap = await getDocs(query(salesRef, where('partyNumber', '==', invoice.partyNumber)));
                    let total = 0;
                    snap.forEach(d => {
                        if (d.id !== invoice.id) {
                            total += Number(d.data().paymentMethods?.due ?? 0);
                        }
                    });
                    const obRef = collection(db, 'companies', currentUser.companyId, 'openingBalances');
                    const obSnap = await getDocs(query(obRef, where('partyNumber', '==', invoice.partyNumber)));
                    obSnap.forEach(d => {
                        const data = d.data();
                        if ((data.balanceType ?? 'due') === 'due') {
                            total += Number(data.dueAmount ?? data.amount ?? 0);
                        }
                    });
                    return total;
                } catch { return 0; }
            })(),
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
            // --- NEW: Fetch the extra message from bill settings ---
            const billSettingsSnap = await getDoc(doc(db, 'companies', currentUser.companyId, 'settings', 'bill'));
            const extraMsg = billSettingsSnap.exists() && billSettingsSnap.data().whatsappExtraMessage
                ? `\n\n${billSettingsSnap.data().whatsappExtraMessage}`
                : '';
            // -------------------------------------------------------

            // Append the extraMsg to the end of your standard message
            const message = `Hello ${invoice.partyName},\n\nHere is your invoice #${invoice.invoiceNumber}.\nAmount: ${invoice.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}\n\nThank you!${extraMsg}`;
            const response = await botMasterService.sendPdfFromUrl(botMasterToken, whatsappNumber, invoice.partyNumber, message, fileUrl, cleanName);

            let isSuccess = false;
            if (Array.isArray(response) && response.length > 0) {
                if (response[0].status === 'sent' || response[0].status === 'delivered') isSuccess = true;
            } else if (response?.status === 'sent' || response?.status === 'success' || response?.status === 200) {
                isSuccess = true;
            }

            if (isSuccess) {
                setModal({ message: "Invoice sent via WhatsApp!", type: State.SUCCESS });
                setSavedBillData(null);
                setTimeout(async () => {
                    try { await deleteObject(storageRef); } catch (e) { console.warn("Could not auto-delete:", e); }
                }, 60000);
            } else {
                throw new Error("API reported failure.");
            }
        } catch (err: any) {
            console.error("WhatsApp Send Error:", err?.code, err?.message);
            setModal({ message: "Failed to send invoice via WhatsApp. Please try again.", type: State.ERROR });
        } finally {
            setSendingPdf(false);
        }
    };
    const handlePrintAction = async (invoice: any, withDuplicate: boolean = false) => {
        setShowPrintSubMenu(false);
        setPrintingPdf(true);
        try {
            const dataForPdf = await preparePdfData(invoice);
            if (dataForPdf) {
                await generatePdf(dataForPdf, ACTION.PRINT, withDuplicate);
            } else {
                throw new Error("Could not prepare PDF data");
            }
        } catch (err) {
            console.error('Failed to print PDF:', err);
            setModal({ message: 'Failed to print invoice. Please try again.', type: State.ERROR });
        } finally {
            setPrintingPdf(false);
        }
    };
    const showSuccessModal = (message: string, navigateTo?: string) => {
        sessionStorage.removeItem('sales_cart_draft');
        sessionStorage.removeItem('sales_tax_mode_draft');
        sessionStorage.removeItem('sales_salesman_draft');
        setIsDrawerOpen(false);
        setModal({ message, type: State.SUCCESS });
        setTimeout(() => { setModal(null); if (navigateTo) navigate(navigateTo); else if (!salesSettings?.copyVoucherAfterSaving) setItems([]); }, 1500);
    };
    const handleCloseQrModal = () => { setSavedBillData(null); };

    if (pageIsLoading) return <div className="flex items-center justify-center h-screen"><Spinner /> <p className="ml-2">Loading...</p></div>;
    if (error) return <div className="flex flex-col items-center justify-center h-screen text-red-600"><p>{error}</p><button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Go Back</button></div>;

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

            </div>
        </>
    );

    const oldTotalExpense = invoiceToEdit?.expenses
        ? invoiceToEdit.expenses.reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0)
        : Number(invoiceToEdit?.extraExpenseAmount || 0);

    const calculatedOriginalTotal = invoiceToEdit ?
        (Number(invoiceToEdit.totalAmount ?? invoiceToEdit.amount ?? 0) +
            Number(invoiceToEdit.manualDiscount || 0) -
            oldTotalExpense)
        : undefined;

    if (isCardView) {
        return (
            <div className="flex flex-col h-full bg-gray-100 w-full overflow-hidden pb-0">
                {modal && (
                    <Modal
                        message={modal.message}
                        onClose={() => {
                            setModal(null);
                            setShowClearCartConfirm(false);
                        }}
                        onConfirm={showClearCartConfirm ? () => {
                            handleConfirmClearCart();
                            setModal(null);
                        } : undefined}
                        showConfirmButton={showClearCartConfirm}
                        type={modal.type}
                    />
                )}
                {showClearCartConfirm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/20">
                        <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm mx-4">
                            <h3 className="text-lg font-bold text-gray-800">Clear Cart</h3>
                            <p className="my-4 text-gray-600">Are you sure you want to remove all items?</p>
                            <div className="flex justify-end gap-4 mt-6">
                                <CustomButton variant={Variant.Outline} onClick={() => setShowClearCartConfirm(false)}>Cancel</CustomButton>
                                <CustomButton variant={Variant.Filled} onClick={handleConfirmClearCart}>Clear</CustomButton>
                            </div>
                        </div>
                    </div>
                )}
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

                            {/* ── MOBILE: single toolbar row ── */}
                            <div className="flex md:hidden items-center gap-2 px-3 py-2 bg-white border-b border-gray-200">

                                {/* Search toggle icon */}
                                <button
                                    onClick={() => setIsSearchOpen(prev => !prev)}
                                    className={`p-2 rounded-sm border transition-colors flex-shrink-0 ${isSearchOpen ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-100 text-gray-600 border-gray-300'}`}
                                    title="Search"
                                >
                                    <FiSearch size={16} />
                                </button>

                                {/* Category pills - scrollable, fills remaining space */}
                                <div className="flex gap-1.5 overflow-x-auto flex-1 scrollbar-hide">
                                    {categories.map(cat => (
                                        <button
                                            key={cat}
                                            onClick={() => setSelectedCategory(cat)}
                                            className={`px-2.5 py-1 rounded-sm text-xs whitespace-nowrap border transition flex-shrink-0
            ${selectedCategory === cat
                                                    ? 'bg-blue-600 text-white border-blue-600'
                                                    : 'bg-gray-100 text-gray-700 border-gray-300'
                                                }`}
                                        >
                                            {cat === 'All' ? 'All' : itemGroupMap[cat] || cat}
                                        </button>
                                    ))}
                                </div>

                                {/* Sort menu icon - rightmost, with dropdown */}
                                <div className="relative flex-shrink-0">
                                    <button
                                        onClick={() => setIsSortOpen(prev => !prev)}
                                        className={`p-2 rounded-sm border transition-colors ${isSortOpen ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-100 text-gray-600 border-gray-300'}`}
                                        title="Sort"
                                    >
                                        <FiMenu size={16} />
                                    </button>

                                    {isSortOpen && (
                                        <>
                                            <div className="fixed inset-0 z-10" onClick={() => setIsSortOpen(false)} />
                                            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-sm shadow-lg z-20 min-w-[100px]">
                                                {([
                                                    { value: 'az', label: 'A-Z' },
                                                    { value: 'za', label: 'Z-A' },
                                                    { value: 'price_asc', label: 'Price ↑' },
                                                    { value: 'price_desc', label: 'Price ↓' },
                                                ] as const).map(opt => (
                                                    <button
                                                        key={opt.value}
                                                        onClick={() => { setSortOrder(opt.value); setIsSortOpen(false); }}
                                                        className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors
                  ${sortOrder === opt.value
                                                                ? 'bg-blue-50 text-blue-600 font-semibold'
                                                                : 'text-gray-700 hover:bg-gray-50'
                                                            }`}
                                                    >
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* ── MOBILE: expandable search bar + camera ── */}
                            {isSearchOpen && (
                                <div className="flex md:hidden gap-2 items-center px-3 py-2 bg-white border-b border-gray-200">
                                    <div className="flex-grow relative">
                                        <input
                                            type="text"
                                            value={gridSearchQuery}
                                            onChange={(e) => setGridSearchQuery(e.target.value)}
                                            placeholder="Search items by name or barcode..."
                                            className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-8"
                                            autoComplete="off"
                                            autoFocus
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
                                    <button
                                        onClick={() => setIsScannerOpen(true)}
                                        className='bg-transparent text-gray-700 p-3 border border-gray-700 rounded-sm font-semibold transition hover:bg-gray-800 hover:text-white flex-shrink-0'
                                        title="Scan Barcode"
                                    >
                                        <IconScanCircle width={20} height={20} />
                                    </button>
                                </div>
                            )}

                            {/* ── DESKTOP: original search bar ── */}
                            <div className="hidden md:flex p-3 bg-white gap-2 items-center">
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

                            {/* ── DESKTOP: category pills ── */}
                            <div className="hidden md:flex gap-2 overflow-x-auto px-3 pb-3 bg-white border-b border-gray-300">
                                {categories.map(cat => (
                                    <button key={cat} onClick={() => setSelectedCategory(cat)}
                                        className={`px-3 py-1 rounded-sm text-xs whitespace-nowrap border transition ${selectedCategory === cat ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'}`}>
                                        {cat === 'All' ? 'All' : itemGroupMap[cat] || cat}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* ── DESKTOP: sort bar ── */}
                        <div className="hidden md:flex gap-1.5 items-center px-3 py-2 bg-white border-b border-gray-200 overflow-x-auto flex-shrink-0">
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
                        <div className="px-3 pt-2 pb-2 bg-white border-b border-gray-100 grid grid-cols-3 items-center">
                            <div className="justify-self-start">
                                <h3 className="text-gray-700 font-medium">Cart</h3>
                            </div>
                            <div className="justify-self-center">
                                {salesSettings?.enableSalesmanSelection && (
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
                                )}
                            </div>
                            <div className="justify-self-end">
                                {items.length > 0 && (
                                    <button onClick={handleClearCart} className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200 flex items-center gap-1">
                                        <FiTrash2 /> Clear
                                    </button>
                                )}
                            </div>
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
                                let baseDisplayPrice = 0;

                                // --- NEW 3-TIER LOGIC FOR GRID CARDS ---
                                if (mrp > 0 && itemSalesPrice > 0) {
                                    baseDisplayPrice = itemSalesPrice; // Case 1
                                } else if (itemSalesPrice > 0) {
                                    baseDisplayPrice = allowItemDiscount ? itemSalesPrice * (1 - presetDiscount / 100) : itemSalesPrice; // Case 2
                                } else if (mrp > 0) {
                                    baseDisplayPrice = allowItemDiscount ? mrp * (1 - presetDiscount / 100) : mrp; // Case 3
                                }

                                baseDisplayPrice = applyRounding(baseDisplayPrice, isRoundingEnabled, roundingInterval);

                                const effectiveSp = (lastAddedCartItem?.customPrice !== undefined && lastAddedCartItem?.customPrice !== null && lastAddedCartItem?.customPrice !== '')
                                    ? Number(lastAddedCartItem.customPrice)
                                    : baseDisplayPrice;
                                const sp = effectiveSp;
                                const lineSubtotal = Math.round((Number(sp) * quantity) * 100) / 100;
                                const discPct = (!hideMrp && allowItemDiscount && mrp > 0 && Number(sp) < mrp && Number(sp) > 0)
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
                                                            className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
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
                                                        {item.unit && (
                                                            <span className="text-[9px] text-gray-400 font-medium ml-0.5">
                                                                ({item.unit})
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
                                                                    const moq = Number((item as any).moq) || 1;
                                                                    if (quantity > moq) {
                                                                        handleQuantityChange(lastAddedCartItem.id, quantity - 1);
                                                                    } else {
                                                                        handleDeleteItem(lastAddedCartItem.id);
                                                                    }
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
                                        onClick={() => {
                                            if (isSelected) handleQuantityChange(lastAddedCartItem.id, quantity + 1);
                                            else addItemToCart(item);
                                        }}
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
                                                    {item.unit && (
                                                        <span className="text-[9px] text-gray-400 font-medium ml-0.5">
                                                            ({item.unit})
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
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const moq = Number((item as any).moq) || 1;
                                                                    if (quantity > moq) {
                                                                        handleQuantityChange(lastAddedCartItem.id, quantity - 1);
                                                                    } else {
                                                                        handleDeleteItem(lastAddedCartItem.id);
                                                                    }
                                                                }}
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
                    totalTax={taxAmount}
                    onPaymentComplete={handleSavePayment}
                    isPartyNameEditable={!isEditMode}
                    originalBillTotal={calculatedOriginalTotal}
                    initialPartyName={isEditMode ? invoiceToEdit?.partyName : ''}
                    initialPartyNumber={isEditMode ? invoiceToEdit?.partyNumber : ''}
                    initialPaymentMethods={isEditMode ? invoiceToEdit?.paymentMethods : undefined}
                    totalItemDiscount={totalDiscount} totalQuantity={totalQuantity}
                    initialDiscount={invoiceToEdit?.manualDiscount}
                    requireCustomerName={salesSettings?.requireCustomerName}
                    requireCustomerMobile={salesSettings?.requireCustomerMobile}
                    allowDueBilling={salesSettings?.allowDueBilling ?? false}
                    initialPartyAddress={isEditMode ? invoiceToEdit?.partyAddress : ''}
                    initialPartyGST={isEditMode ? invoiceToEdit?.partyGstin : ''}
                    initialShippingName={isEditMode ? invoiceToEdit?.shippingName : ''}
                    initialShippingNumber={isEditMode ? invoiceToEdit?.shippingNumber : ''}
                    initialShippingAddress={isEditMode ? invoiceToEdit?.shippingAddress : ''}
                    initialShippingGST={isEditMode ? invoiceToEdit?.shippingGST : ''}
                    initialPlaceOfSupply={isEditMode ? invoiceToEdit?.placeOfSupply : ''}      // <-- ADD THIS
                    initialShippingState={isEditMode ? invoiceToEdit?.shippingState : ''}
                    initialExpenses={isEditMode ? (invoiceToEdit?.expenses || (invoiceToEdit?.extraExpenseName ? [{ name: invoiceToEdit.extraExpenseName, amount: invoiceToEdit.extraExpenseAmount }] : [])) : []}
                    initialNarration={isEditMode ? invoiceToEdit?.narration : ''}
                    initialTransportDetails={isEditMode ? invoiceToEdit?.transportDetails : undefined}
                    enableShippingDetails={salesSettings?.enableShippingDetails}
                    enableExtraExpense={salesSettings?.enableExtraExpense}
                    enableNarration={salesSettings?.enableNarration}
                    enableTransportDetails={salesSettings?.enableTransportDetails ?? false}
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
                            <button onClick={() => setShowPrintSubMenu(true)} disabled={printingPdf}
                                className="w-full bg-gray-900 text-white py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors flex items-center justify-center gap-2 mb-3 disabled:opacity-50">
                                {printingPdf ? <Spinner /> : <><IconPrint /> Print</>}
                            </button>
                            <button onClick={handleCloseQrModal} className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors">Done</button>
                        </div>
                    </div>
                )}

                {showPrintSubMenu && savedBillData && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50" onClick={() => setShowPrintSubMenu(false)}>
                        <div className="bg-white rounded-sm p-6 w-full max-w-xs mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
                            <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4 text-center">Print Options</h3>
                            <div className="flex flex-col gap-3">
                                <button onClick={() => handlePrintAction(savedBillData.invoiceData, false)} className="w-full border py-2.5 rounded-sm font-bold text-sm">
                                    Print (Bill Only)
                                </button>
                                <button onClick={() => handlePrintAction(savedBillData.invoiceData, true)} className="w-full border border-blue-500 text-blue-600 py-2.5 rounded-sm font-bold text-sm">
                                    {enableTriplicate ? 'Print (Bill + 2 Duplicates)' : 'Print (Bill + Duplicate)'}
                                </button>
                                <button onClick={() => setShowPrintSubMenu(false)} className="w-full text-[11px] font-bold text-slate-400 hover:text-slate-700 mt-1">
                                    Cancel
                                </button>
                            </div>
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
                            className="bg-white border border-gray-200 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] px-4 pt-3 pb-2 flex flex-col items-end justify-end min-h-[8rem] sm:min-h-[10rem] max-h-[12rem] sm:max-h-[14rem] shrink-0 w-full cursor-text overflow-hidden relative"
                            onClick={() => displayRef.current?.focus()}
                        >
                            {/* Hidden textarea — drives all input logic unchanged */}
                            <textarea
                                ref={displayRef}
                                inputMode="none"
                                value={calcInput}
                                placeholder=""
                                onChange={(e) => {
                                    const val = e.target.value.replace(/[^0-9*.\-+%]/g, '');
                                    setCalcInput(val);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') e.preventDefault();
                                }}
                                className="absolute opacity-0 pointer-events-none w-0 h-0"
                                rows={1}
                            />

                            {/* Visual display — wraps into lines, last line is large */}
                            <CalcDisplay value={calcInput} />
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
                    originalBillTotal={calculatedOriginalTotal}
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
                    requireCustomerName={salesSettings?.requireCustomerName ?? false}
                    requireCustomerMobile={salesSettings?.requireCustomerMobile ?? false}
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
            {modal && (
                <Modal
                    message={modal.message}
                    onClose={() => {
                        setModal(null);
                        setShowClearCartConfirm(false);
                    }}
                    onConfirm={showClearCartConfirm ? () => {
                        handleConfirmClearCart();
                        setModal(null);
                    } : undefined}
                    showConfirmButton={showClearCartConfirm}
                    type={modal.type}
                />
            )}
            {showClearCartConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/20">
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm mx-4">
                        <h3 className="text-lg font-bold text-gray-800">Clear Cart</h3>
                        <p className="my-4 text-gray-600">Are you sure you want to remove all items?</p>
                        <div className="flex justify-end gap-4 mt-6">
                            <CustomButton variant={Variant.Outline} onClick={() => setShowClearCartConfirm(false)}>Cancel</CustomButton>
                            <CustomButton variant={Variant.Filled} onClick={handleConfirmClearCart}>Clear</CustomButton>
                        </div>
                    </div>
                </div>
            )}
            {/* 👇 NEW: Duplicate item popup — styled like the shared Modal component */}
            {duplicateItemPrompt && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4">
                    <div className="bg-white rounded-sm shadow-2xl p-6 w-full max-w-sm text-center">
                        {/* Icon */}
                        <div className="mx-auto mb-4 w-12 h-12 rounded-sm flex items-center justify-center bg-blue-100">
                            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                        </div>

                        <h3 className="text-lg font-bold text-gray-800 mb-1">Item Already in Cart</h3>
                        <p className="text-sm text-gray-600 mb-6">
                            "<span className="font-medium">{duplicateItemPrompt.item.name}</span>" is already in your cart
                            {duplicateItemPrompt.existingCount > 1 ? ` (${duplicateItemPrompt.existingCount} times)` : ''}.
                            What would you like to do?
                        </p>

                        <div className="flex flex-col gap-2">
                            <button
                                onClick={handleIncreaseExistingQuantity}
                                className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-sm font-semibold hover:bg-blue-700 transition-colors"
                            >
                                Increase Quantity
                            </button>
                            <button
                                onClick={handleAddAsNewLine}
                                className="w-full bg-gray-200 text-gray-800 py-2.5 px-4 rounded-sm font-semibold hover:bg-gray-300 transition-colors"
                            >
                                Add as New Item
                            </button>
                            <button
                                onClick={() => setDuplicateItemPrompt(null)}
                                className="w-full text-xs font-medium text-gray-400 hover:text-gray-600 mt-1"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
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
                                    onSearchChange={setCartSearchQuery}
                                />
                            </div>
                            <button onClick={() => setIsScannerOpen(true)} className='bg-gray-700 text-white p-3 border border-gray-700 rounded-sm font-semibold transition hover:bg-gray-800' title="Scan Barcode">
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
                            scrollRef={cartListRef}
                            basePriceKey="mrp"
                            priceLabel="MRP"
                            settings={{
                                enableRounding: salesSettings?.enableRounding ?? true,
                                roundingInterval: (salesSettings as any)?.roundingInterval ?? 1,
                                enableItemWiseDiscount: salesSettings?.enableItemWiseDiscount ?? true,
                                enableDiscount2: (salesSettings as any)?.enableDiscount2 ?? false,
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
                            onDiscount2Change={handleDiscount2Change}
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
                originalBillTotal={calculatedOriginalTotal}
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
                initialPartyAddress={isEditMode ? invoiceToEdit?.partyAddress : ''}
                initialPartyGST={isEditMode ? invoiceToEdit?.partyGstin : ''}
                initialShippingName={isEditMode ? invoiceToEdit?.shippingName : ''}
                initialShippingNumber={isEditMode ? invoiceToEdit?.shippingNumber : ''}
                initialShippingAddress={isEditMode ? invoiceToEdit?.shippingAddress : ''}
                initialShippingGST={isEditMode ? invoiceToEdit?.shippingGST : ''}
                initialExpenses={isEditMode ? (invoiceToEdit?.expenses || (invoiceToEdit?.extraExpenseName ? [{ name: invoiceToEdit.extraExpenseName, amount: invoiceToEdit.extraExpenseAmount }] : [])) : []}
                initialNarration={isEditMode ? invoiceToEdit?.narration : ''}
                initialTransportDetails={isEditMode ? invoiceToEdit?.transportDetails : undefined}
                enableShippingDetails={salesSettings?.enableShippingDetails}
                enableExtraExpense={salesSettings?.enableExtraExpense}
                enableNarration={salesSettings?.enableNarration}
                enableTransportDetails={salesSettings?.enableTransportDetails ?? false}
                taxMode={activeTaxMode}
                onTaxModeChange={setActiveTaxMode}
                isTaxToggleLocked={(salesSettings?.gstScheme !== 'regular' || salesSettings?.lockTaxToggle)}
                totalMrp={totalMrp}
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

                        {/* --- NEW PRINT BUTTON --- */}
                        <button
                            onClick={() => setShowPrintSubMenu(true)}
                            disabled={printingPdf}
                            className="w-full bg-gray-900 text-white py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors flex items-center justify-center gap-2 mb-3 disabled:opacity-50"
                        >
                            {printingPdf ? <Spinner /> : <><IconPrint /> Print</>}
                        </button>

                        <button
                            onClick={handleCloseQrModal}
                            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}

            {showPrintSubMenu && savedBillData && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50" onClick={() => setShowPrintSubMenu(false)}>
                    <div className="bg-white rounded-sm p-6 w-full max-w-xs mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4 text-center">Print Options</h3>
                        <div className="flex flex-col gap-3">
                            <button onClick={() => handlePrintAction(savedBillData.invoiceData, false)} className="w-full border py-2.5 rounded-sm font-bold text-sm">
                                Print (Bill Only)
                            </button>
                            <button onClick={() => handlePrintAction(savedBillData.invoiceData, true)} className="w-full border border-blue-500 text-blue-600 py-2.5 rounded-sm font-bold text-sm">
                                {enableTriplicate ? 'Print (Bill + 2 Duplicates)' : 'Print (Bill + Duplicate)'}
                            </button>
                            <button onClick={() => setShowPrintSubMenu(false)} className="w-full text-[11px] font-bold text-slate-400 hover:text-slate-700 mt-1">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Sales;