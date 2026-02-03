import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth, useDatabase } from '../../context/auth-context';
import type { Item, SalesItem as OriginalSalesItem } from '../../constants/models';
import { ROUTES } from '../../constants/routes.constants';
import { db } from '../../lib/Firebase';
import { collection, serverTimestamp, doc, increment as firebaseIncrement, runTransaction, getDocs, query, where } from 'firebase/firestore';
import SearchableItemInput from '../../UseComponents/SearchIteminput';
import BarcodeScanner from '../../UseComponents/BarcodeScanner';
import PaymentDrawer, { type PaymentCompletionData } from '../../Components/PaymentDrawer';
import { generateNextInvoiceNumber } from '../../UseComponents/InvoiceCounter';
import { Modal } from '../../constants/Modal';
import { Permissions, ROLES, State, Variant } from '../../enums';
import { CustomButton } from '../../Components';
import type { User } from '../../Role/permission';
import { useSalesSettings } from '../../context/SettingsContext';
import { Spinner } from '../../constants/Spinner';
import { ItemEditDrawer } from '../../Components/ItemDrawer';
import { GenericCartList } from '../../Components/CartItem';
import { FiTrash2, FiX, FiChevronDown } from 'react-icons/fi';
import { GenericBillFooter } from '../../Components/Footer';
import { IconScanCircle } from '../../constants/Icons';
import QRCode from 'react-qr-code';

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
}

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
    const { salesSettings, loadingSettings } = useSalesSettings();

    const invoiceToEdit = location.state?.invoiceData;
    const isEditMode = location.state?.isEditMode === true && !!invoiceToEdit;

    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
    const [savedBillData, setSavedBillData] = useState<{ id: string, number: string } | null>(null);

    const [items, setItems] = useState<SalesItem[]>(() => {
        if (isEditMode) return [];
        try {
            const savedDraft = localStorage.getItem('sales_cart_draft');
            return savedDraft ? JSON.parse(savedDraft) : [];
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
    const [gridSearchQuery, setGridSearchQuery] = useState<string>('');
    const [itemGroupMap, setItemGroupMap] = useState<Record<string, string>>({});
    const [isFooterExpanded, setIsFooterExpanded] = useState(false);

    const isActive = (path: string) => location.pathname === path;
    const userRole = currentUser?.role || '';
    const isManager = userRole === ROLES.MANAGER || userRole === ROLES.OWNER;
    const hideMrp = (salesSettings as any)?.hideMrp ?? false;

    // View variables
    const isCardView = salesSettings?.salesViewType === 'card';
    const showTaxRow = (activeTaxMode !== 'exempt');

    // --- Initialize Tax Mode ---
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

        const fetchData = async () => {
            try {
                setPageIsLoading(true);
                setError(null);
                const fetchedItems = await dbOperations.syncItems();
                setAvailableItems(fetchedItems);
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
            } catch (err) { console.error(err); setError('Failed to load initial page data.'); } finally { setPageIsLoading(false); }
        };
        fetchData();
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
                isEditable: false,
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
                tax: item.tax || 0,
                itemGroupId: item.itemGroupId || '',
                stock: item.stock ?? item.Stock ?? 0,
                amount: item.amount || 0,
                barcode: item.barcode || '',
                restockQuantity: item.restockQuantity || 0,
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
        return filtered.sort((a, b) => {
            const aInCart = items.some(i => i.productId === a.id);
            const bInCart = items.some(i => i.productId === b.id);
            if (aInCart && !bInCart) return -1;
            if (!aInCart && bInCart) return 1;
            return 0;
        });
    }, [availableItems, selectedCategory, gridSearchQuery, items]);

    const gstSchemeDisplay = salesSettings?.gstScheme;

    const { subtotal, totalDiscount, roundOff, taxableAmount, taxAmount, finalAmount, totalQuantity } = useMemo(() => {
        let accumulatorSubtotal = 0;
        let accumulatorTaxable = 0;
        let accumulatorTax = 0;
        let accumulatorQuantity = 0;

        const isTaxEnabled = salesSettings?.enableTax ?? true;
        const taxRate = salesSettings?.defaultTaxRate ?? 0;
        const isRoundingEnabled = salesSettings?.enableRounding ?? true;
        const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;

        // Determine Effective Tax Mode
        let effectiveTaxMode = 'none';
        if (gstSchemeDisplay === 'regular' && isTaxEnabled) {
            effectiveTaxMode = activeTaxMode === 'exempt' ? 'none' : activeTaxMode;
        } else {
            effectiveTaxMode = 'none';
        }

        items.forEach(cartItem => {
            const currentQuantity = cartItem.quantity || 1;
            accumulatorQuantity += currentQuantity;

            let baseForSubtotal = (cartItem.mrp && cartItem.mrp > 0) ? cartItem.mrp : (cartItem.salesPrice || 0);

            const itemSpecificTaxRate = (cartItem.tax !== undefined && cartItem.tax !== null) ? Number(cartItem.tax) : taxRate;

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
        const finalPayableAmount = toCurrency(finalTaxable + finalTax);

        let totalDiscountValue = 0;

        if (effectiveTaxMode === 'none') {
            totalDiscountValue = toCurrency(accumulatorSubtotal - finalPayableAmount);
        } else {
            totalDiscountValue = toCurrency(accumulatorSubtotal - finalTaxable);
        }

        return {
            subtotal: accumulatorSubtotal,
            totalDiscount: totalDiscountValue > 0 ? totalDiscountValue : 0,
            roundOff: 0,
            taxableAmount: finalTaxable,
            taxAmount: finalTax,
            finalAmount: finalPayableAmount,
            totalQuantity: accumulatorQuantity
        };
    }, [items, salesSettings, activeTaxMode, gstSchemeDisplay]);

    const amountToPayNow = useMemo(() => finalAmount, [finalAmount]);

    const addItemToCart = (itemToAdd: Item) => {
        if (!itemToAdd || !itemToAdd.id) {
            setModal({ message: "Cannot add invalid item.", type: State.ERROR });
            return;
        }
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
            quantity: 1,
            discount: parseFloat(calculatedDiscount.toFixed(2)),
            customPrice: finalNetPrice,
            isEditable: true,
            purchasePrice: itemToAdd.purchasePrice || 0,
            tax: itemToAdd.tax || 0,
            itemGroupId: itemToAdd.itemGroupId || '',
            stock: itemToAdd.stock || (itemToAdd as any).Stock || 0,
            amount: itemToAdd.amount || 0,
            barcode: itemToAdd.barcode || '',
            restockQuantity: itemToAdd.restockQuantity || 0,
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
    const handleBarcodeScanned = async (barcode: string) => {
        setIsScannerOpen(false);
        if (!dbOperations) return;

        const cleanBarcode = barcode.trim();

        console.log("Searching for barcode:", cleanBarcode);

        try {
            const itemToAdd = await dbOperations.getItemByBarcode(cleanBarcode);
            if (itemToAdd) {
                addItemToCart(itemToAdd);
                setAvailableItems(prev => {
                    const exists = prev.find(p => p.id === itemToAdd.id);
                    return exists ? prev : [...prev, itemToAdd];
                });
            } else {
                setModal({
                    message: `Item not found for barcode: "${cleanBarcode}"`,
                    type: State.ERROR
                });
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
    const displayItems = useMemo(() => { return items; }, [items]);

    const handleProceedToPayment = () => {
        if (items.length === 0) { setModal({ message: 'Please add at least one item.', type: State.INFO }); return; }
        if (salesSettings?.enableSalesmanSelection && !selectedWorker) { setModal({ message: 'Please select a salesman.', type: State.ERROR }); return; }
        if (!(salesSettings as any)?.allowNegativeStock) {
            const stockNeeds = new Map<string, number>();
            items.filter(i => i.isEditable).forEach(i => { const pid = i.productId; stockNeeds.set(pid, (stockNeeds.get(pid) || 0) + (i.quantity || 1)); });
            const invalidItems: string[] = [];
            stockNeeds.forEach((needed, pid) => {
                const avail = availableItems.find(a => a.id === pid);
                if ((avail?.stock ?? 0) < needed) invalidItems.push(`${avail?.name} (Avail:${avail?.stock}, Need:${needed})`);
            });
            if (invalidItems.length > 0) { setModal({ message: `Insufficient stock: ${invalidItems.join(', ')}`, type: State.ERROR }); return; }
        }
        setIsDrawerOpen(true);
    };

    const handleSavePayment = async (completionData: PaymentCompletionData) => {
        if (!currentUser?.companyId) return;

        if (salesSettings?.requireCustomerName && !completionData.partyName?.trim()) throw new Error("Customer Name is required.");
        if (salesSettings?.requireCustomerMobile && !completionData.partyNumber?.trim()) throw new Error("Customer Mobile Number is required.");

        const companyId = currentUser.companyId;
        const salesman = salesSettings?.enableSalesmanSelection ? selectedWorker : workers.find(w => w.uid === currentUser.uid);
        const finalSalesman = salesman || { uid: currentUser.uid, name: currentUser.uid || 'Current User' };

        let finalGstScheme = 'none';
        let finalTaxType = 'none';

        if (activeTaxMode === 'exempt') {
            finalGstScheme = 'composition';
            finalTaxType = 'none';
        } else {
            finalGstScheme = 'regular';
            finalTaxType = activeTaxMode;
        }

        const isTaxEnabled = salesSettings?.enableTax ?? true;
        const currentTaxRate = salesSettings?.defaultTaxRate ?? 0;
        const isRoundingEnabled = salesSettings?.enableRounding ?? true;
        const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;

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

                const itemSpecificTaxRate = (item.tax !== undefined && item.tax !== null) ? Number(item.tax) : currentTaxRate;
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
                    taxableAmount: itemTaxableBase, taxAmount: itemTaxAmount, taxRate: isTaxEnabled ? itemSpecificTaxRate : 0,
                    taxType: finalTaxType, discountPercentage: currentDiscount,
                };
            });
        };

        const finalInvoiceTotal = finalAmount - completionData.discount;
        const totalInvoiceDiscount = totalDiscount + (completionData.discount || 0);


        const saveOperation = async (transaction: any, isNew: boolean, existingId?: string) => {
            const saleData: any = {
                items: formatItemsForDB(items),
                subtotal, discount: totalInvoiceDiscount, manualDiscount: completionData.discount || 0, revDiscount: completionData.revDiscount || 0,
                roundOff, taxableAmount, taxAmount,

                gstScheme: finalGstScheme,
                taxType: finalTaxType,

                totalAmount: finalInvoiceTotal,
                paymentMethods: completionData.paymentDetails,
                partyName: completionData.partyName, partyNumber: completionData.partyNumber,
                salesmanId: finalSalesman.uid, salesmanName: finalSalesman.name,
                updatedAt: serverTimestamp()
            };

            if (isNew) {
                saleData.createdAt = serverTimestamp();
                saleData.invoiceNumber = await generateNextInvoiceNumber(companyId);
                saleData.userId = currentUser.uid;
                saleData.partyAddress = completionData.partyAddress || '';
                saleData.partyGstin = completionData.partyGST || '';
                saleData.companyId = companyId;
                saleData.voucherName = salesSettings?.voucherName ?? 'Sales';

                const newSaleRef = doc(collection(db, "companies", companyId, "sales"));
                transaction.set(newSaleRef, saleData);
                return { id: newSaleRef.id, number: saleData.invoiceNumber };
            } else if (existingId) {
                const invoiceRef = doc(db, "companies", companyId, "sales", existingId);
                transaction.update(invoiceRef, saleData);
                return { id: existingId, number: invoiceToEdit.invoiceNumber };
            }
            return null;
        };

        try {
            if (isEditMode && invoiceToEdit?.id) {
                await runTransaction(db, async (transaction) => {
                    await saveOperation(transaction, false, invoiceToEdit.id);
                });
                showSuccessModal("Invoice Updated", ROUTES.JOURNAL);
            } else {
                let result;
                await runTransaction(db, async (transaction) => {
                    result = await saveOperation(transaction, true);

                    items.forEach(i => {
                        const pid = i.productId || i.id;
                        if (pid) {
                            const itemRef = doc(db, "companies", companyId, "items", pid);
                            transaction.update(itemRef, { stock: firebaseIncrement(-(i.quantity || 1)), updatedAt: serverTimestamp() });
                        }
                    });
                    if (settingsDocId) {
                        const settingsRef = doc(db, "companies", companyId, "settings", settingsDocId);
                        transaction.update(settingsRef, { currentVoucherNumber: firebaseIncrement(1) });
                    }
                });
                if (result) {
                    setIsDrawerOpen(false);
                    setSavedBillData(result);
                    localStorage.removeItem('sales_cart_draft');
                    setItems([]);
                }
            }
        } catch (e: any) {
            console.error(e); setModal({ message: "Error saving", type: State.ERROR });
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
            <div className="flex justify-between items-center p-2 bg-white border-b border-gray-200 px-5 rounded-sm">
                <span className="text-sm font-semibold text-gray-700">Tax Calculation</span>
                <div className="relative">
                    <select
                        value={activeTaxMode}
                        onChange={(e) => setActiveTaxMode(e.target.value as any)}
                        disabled={(salesSettings?.gstScheme !== 'regular')} // --- DISABLE INPUT IF LOCKED ---
                        className={`appearance-none border border-gray-300 pr-8 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium transition-all ${isLocked
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed' // Locked Style
                            : 'bg-gray-50 hover:border-blue-400 text-gray-700 cursor-pointer' // Active Style
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
        );
    };

    const renderHeader = () => (
        <div className="flex flex-col md:flex-row md:justify-between md:items-center bg-gray-100 md:bg-white border-b border-gray-200 shadow-sm flex-shrink-0 mb-2 md:mb-0 p-2 md:px-4 md:py-3">
            <h1 className="text-2xl font-bold text-gray-800 text-center md:text-left mb-2 md:mb-0">
                {isEditMode ? `Editing #${invoiceToEdit.invoiceNumber}` : (salesSettings?.voucherName ?? 'Sales')}
            </h1>
            {!isEditMode && (
                <div className="flex items-center justify-center gap-6 mb-2 md:mb-0">
                    <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.SALES)} active={isActive(ROUTES.SALES)}>Sales</CustomButton>
                    <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.SALES_RETURN)} active={isActive(ROUTES.SALES_RETURN)}>Sales Return</CustomButton>
                </div>
            )}
        </div>
    );

    if (isCardView) {
        return (
            <div className="flex flex-col h-full bg-gray-100 w-full overflow-hidden pb-2">
                {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
                <BarcodeScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleBarcodeScanned} />
                {renderHeader()}
                <div className="flex-shrink-0 bg-gray-50 border-b border-gray-300">
                    <div className="p-2 bg-white border-b flex gap-2 items-center">
                        <div className="flex-grow relative">
                            <input type="text" placeholder="Search..." className="w-full p-2 pr-8 border rounded" value={gridSearchQuery} onChange={e => setGridSearchQuery(e.target.value)} />
                            {gridSearchQuery && <button onClick={() => setGridSearchQuery('')} className="absolute right-2 top-2 text-gray-400">X</button>}
                        </div>
                        <button onClick={() => setIsScannerOpen(true)} className="p-2 border rounded bg-white">Scan</button>
                        {salesSettings?.enableSalesmanSelection && (<div className="w-1/3 min-w-[120px]"> <select value={selectedWorker?.uid || ''} onChange={(e) => setSelectedWorker(workers.find(s => s.uid === e.target.value) || null)} className="w-full p-2 border border-gray-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"> <option value="">Select Salesman</option> {workers.map(w => <option key={w.uid} value={w.uid}>{w.name || 'Unnamed'}</option>)} </select> </div>)}
                    </div>
                    <div className="flex overflow-x-auto p-2 gap-2 bg-white border-b">
                        {categories.map(cat => <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-4 py-1 rounded-full border ${selectedCategory === cat ? 'bg-green-600 text-white' : 'bg-white'}`}>{itemGroupMap[cat] || cat}</button>)}
                    </div>
                </div>
                <div className="flex-1 p-3 overflow-y-auto grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 content-start bg-gray-100 pb-20">
                    {sortedGridItems.map(item => {
                        const countInCart = items.filter(i => i.productId === item.id).length;
                        const isSelected = countInCart > 0;
                        const quantity = items.filter(i => i.productId === item.id).reduce((sum, i) => sum + i.quantity, 0);

                        return (
                            <div key={item.id} onClick={() => addItemToCart(item)} className={`p-2 rounded border bg-white text-center cursor-pointer ${isSelected ? 'border-blue-500 bg-blue-50' : ''}`}>
                                <div className="text-sm font-bold truncate">{item.name}</div>
                                {!hideMrp && <div className="text-xs text-gray-600">₹{item.mrp}</div>}
                                {isSelected && <div className="text-xs text-blue-600 font-bold mt-1">Added ({quantity})</div>}
                            </div>
                        );
                    })}
                </div>
                <div className="md:hidden p-2">
                    {renderTaxToggle()}
                </div>
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
                />
                <PaymentDrawer
                    mode='sale' isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} subtotal={subtotal} billTotal={amountToPayNow} onPaymentComplete={handleSavePayment} isPartyNameEditable={!isEditMode} initialPartyName={isEditMode ? invoiceToEdit?.partyName : ''} initialPartyNumber={isEditMode ? invoiceToEdit?.partyNumber : ''} initialPaymentMethods={isEditMode ? invoiceToEdit?.paymentMethods : undefined} totalItemDiscount={totalDiscount} totalQuantity={totalQuantity}
                    initialDiscount={invoiceToEdit?.manualDiscount}
                    requireCustomerName={salesSettings?.requireCustomerName}
                    requireCustomerMobile={salesSettings?.requireCustomerMobile}
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
                                    value={`${window.location.origin}/download-bill/${currentUser?.companyId}/${savedBillData.id}`}
                                    size={200}
                                    viewBox={`0 0 256 256`}
                                />
                            </div>
                            <p className="text-center text-sm text-gray-600 mb-4">
                                Ask customer to scan this QR code to download their bill.
                            </p>
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
    }

    return (
        <div className="flex flex-col h-full bg-gray-100 w-full overflow-hidden pb-2">
            {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
            <BarcodeScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleBarcodeScanned} />

            {renderHeader()}

            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

                <div className="flex flex-col w-full md:w-3/4 min-w-0 h-full relative">

                    <div className="flex-shrink-0 p-2 bg-white border-b pb-3 mb-2 rounded-sm md:mb-0 md:border-r border-gray-200">
                        <div className="flex gap-4 items-end w-full">
                            <div className="flex-grow">
                                <SearchableItemInput label="Search Item" placeholder="Search by name or barcode..." items={availableItems} onItemSelected={handleItemSelected} isLoading={pageIsLoading} error={error} />
                            </div>
                            <button onClick={() => setIsScannerOpen(true)} className='bg-transparent text-gray-700 p-3 border border-gray-700 rounded-md font-semibold transition hover:bg-gray-800' title="Scan Barcode">
                                <IconScanCircle width={20} height={20} />
                            </button>
                        </div>
                    </div>

                    {/* Cart List Container */}
                    <div className="flex-1 flex flex-col bg-gray-100 overflow-y-hidden md:border-r border-gray-200">
                        <div className="pt-2 flex-shrink-0 grid grid-cols-3 items-center border-b pb-2 px-2">
                            <div className="justify-self-start"><h3 className="text-gray-700 font-medium">Cart</h3></div>
                            <div className="justify-self-center w-full flex justify-center">{salesSettings?.enableSalesmanSelection && <select value={selectedWorker?.uid} onChange={e => setSelectedWorker(workers.find(w => w.uid === e.target.value) || null)} className="p-1 border rounded text-sm" disabled={!hasPermission(Permissions.ViewTransactions) || (isEditMode && !isManager)}><option value="">Salesman</option>{workers.map(w => <option key={w.uid} value={w.uid}>{w.name}</option>)}</select>}</div>
                            <div className="justify-self-end">{items.length > 0 && <button onClick={handleClearCart} className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200 flex items-center gap-1"><FiTrash2 /> Clear</button>}</div>
                        </div>
                        <div className="flex-shrink-0 grid grid-cols-2 px-2">
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
                        <h2 className="text-xl font-bold text-gray-800 mb-6 border-b pb-2">Bill Summary</h2>

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
                onPaymentComplete={handleSavePayment}
                initialDiscount={invoiceToEdit?.manualDiscount}
                isPartyNameEditable={!isEditMode}
                initialPartyName={isEditMode ? invoiceToEdit?.partyName : ''}
                initialPartyNumber={isEditMode ? invoiceToEdit?.partyNumber : ''}
                initialPaymentMethods={isEditMode ? invoiceToEdit?.paymentMethods : undefined}
                totalItemDiscount={totalDiscount} totalQuantity={totalQuantity}
                requireCustomerName={salesSettings?.requireCustomerName}
                requireCustomerMobile={salesSettings?.requireCustomerMobile}
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