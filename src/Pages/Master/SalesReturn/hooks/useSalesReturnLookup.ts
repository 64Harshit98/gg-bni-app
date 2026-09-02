import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../../../constants/routes.constants';
import {
    orderBy, limit, getDoc,
    collection,
    query,
    getDocs,
    doc,
    DocumentSnapshot,
    type DocumentData,
} from 'firebase/firestore';
import { db } from '../../../../lib/Firebase';
import { useCatalogueData } from '../../../../context/CatalogueDataContext';
import type { Item } from '../../../../constants/models';
import { State } from '../../../../enums';
import { applyRounding } from '../../Sales';
import { toCurrency } from '../salesReturn.calculations';
import type { SalesData, TransactionItem, ExchangeItem, Customer } from '../salesReturn.types';

interface UseSalesReturnLookupParams {
    currentUser: any;
    dbOperations: any;
    invoiceId: string | undefined;
    locationState: any;
    salesSettings: any;
    setActiveTaxMode: (mode: 'inclusive' | 'exclusive' | 'exempt') => void;
    setModal: (modal: { message: string; type: State } | null) => void;
    setExchangeItems: (items: ExchangeItem[]) => void;
}

// Owns sale/customer lookup + the returnable-items list — moved verbatim
// from SalesReturn.tsx: salesList/selectedSale/originalSaleItems/
// selectedReturnIds state, the search-dropdown state+click-outside effect
// (for both the sale-search and customer-search dropdowns), the initial
// data-fetch effect (recent sales + customers + edit-mode/deep-link
// specific invoice), handleSelectSale, handleSelectCustomer, handleClear,
// handleToggleReturnItem, and the generic handleListChange helper (used by
// both this hook's own return-item quantity editing AND by
// useExchangeItems for its discount/quantity handlers — passed out so the
// caller can thread it into that hook too, rather than duplicating it).
export const useSalesReturnLookup = ({
    currentUser,
    dbOperations,
    invoiceId,
    locationState,
    salesSettings,
    setActiveTaxMode,
    setModal,
    setExchangeItems,
}: UseSalesReturnLookupParams) => {
    const [partyName, setPartyName] = useState<string>('');
    const [partyNumber, setPartyNumber] = useState<string>('');

    const { items: catalogueItems } = useCatalogueData();

    const [originalSaleItems, setOriginalSaleItems] = useState<TransactionItem[]>([]);
    const [selectedReturnIds, setSelectedReturnIds] = useState<Set<string>>(new Set());
    const [salesList, setSalesList] = useState<SalesData[]>([]);
    const [selectedSale, setSelectedSale] = useState<SalesData | null>(null);
    const [searchSaleQuery, setSearchSaleQuery] = useState<string>('');

    const [isSalesDropdownOpen, setIsSalesDropdownOpen] = useState<boolean>(false);
    const salesDropdownRef = useRef<HTMLDivElement>(null);

    const [availableCustomers, setAvailableCustomers] = useState<Customer[]>([]);
    const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState<boolean>(false);
    const customerDropdownRef = useRef<HTMLDivElement>(null);

    // Local mirror of the shared catalogue items (not a direct context read)
    // — useExchangeItems optimistically mutates this after linking a scanned
    // barcode, ahead of the shared listener echoing the write back.
    const [availableItems, setAvailableItems] = useState<Item[]>(catalogueItems);
    useEffect(() => { setAvailableItems(catalogueItems); }, [catalogueItems]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [returnItemSearchQuery, setReturnItemSearchQuery] = useState<string>('');
    const [exchangeSearchQuery, setExchangeSearchQuery] = useState<string>('');

    const handleSelectSale = (sale: SalesData) => {
        setSelectedSale(sale);
        setPartyName(sale.partyName || 'N/A');
        setPartyNumber(sale.partyNumber || '');

        // 👇 ADD THIS LINE to inherit the original invoice's tax type
        if (sale.taxType) {
            setActiveTaxMode(sale.taxType as any);
        }

        setOriginalSaleItems(
            sale.items.map((item: any) => {
                const itemData = item.data || item;
                const quantity = Number(itemData.quantity) || 1;

                // FIX SCRUM-966: Fetch effectiveUnitPrice (pre-tax) instead of dividing finalPrice
                const fallbackUnitPrice = quantity > 0 ? Number(itemData.finalPrice) / quantity : 0;
                const unitPrice = itemData.effectiveUnitPrice !== undefined ? Number(itemData.effectiveUnitPrice) : fallbackUnitPrice;

                // Amount is strictly pre-tax now
                const amount = unitPrice * quantity;

                return {
                    id: crypto.randomUUID(),
                    originalItemId: itemData.id || itemData.productId || 'UNKNOWN_ID',
                    name: itemData.name,
                    quantity: quantity,
                    maxReturnQuantity: quantity,
                    unitPrice: unitPrice,
                    amount: amount,
                    mrp: itemData.mrp || 0,
                    unitMultiplier: itemData.unitMultiplier || 1,
                    unit: itemData.unit || ''
                };
            })
        );
        setSelectedReturnIds(new Set());
        setExchangeItems([]);
        setExchangeSearchQuery('');
        setReturnItemSearchQuery('');
        setSearchSaleQuery(sale.invoiceNumber || sale.partyName);
        setIsSalesDropdownOpen(false);
    };

    useEffect(() => {
        if (!currentUser || !currentUser.companyId || !dbOperations) {
            setIsLoading(false);
            return;
        }

        const fetchData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const salesQuery = query(
                    collection(db, 'companies', currentUser.companyId, 'sales'),
                    orderBy('createdAt', 'desc'),
                    limit(50)
                );

                const customersQuery = query(collection(db, 'companies', currentUser.companyId, 'customers'), limit(100));

                let specificInvoicePromise: Promise<DocumentSnapshot<DocumentData, DocumentData> | null> = Promise.resolve(null);

                if (invoiceId && !locationState?.invoiceData) {
                    const specificRef = doc(db, 'companies', currentUser.companyId, 'sales', invoiceId);
                    specificInvoicePromise = getDoc(specificRef);
                }

                const [salesSnapshot, customersSnap, specificInvoiceSnap] = await Promise.all([
                    getDocs(salesQuery),
                    getDocs(customersQuery),
                    specificInvoicePromise
                ]);

                const recentSales: SalesData[] = salesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SalesData));
                const customersData = customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));

                if (locationState?.invoiceData) {
                    handleSelectSale(locationState.invoiceData);
                }
                else if (specificInvoiceSnap && specificInvoiceSnap.exists()) {
                    const specificData = { id: specificInvoiceSnap.id, ...specificInvoiceSnap.data() } as SalesData;
                    if (!recentSales.find(s => s.id === specificData.id)) {
                        recentSales.unshift(specificData);
                    }
                    handleSelectSale(specificData);
                }
                else if (invoiceId) {
                    const pre = recentSales.find(sale => sale.id === invoiceId);
                    if (pre) handleSelectSale(pre);
                }

                setSalesList(recentSales);
                setAvailableCustomers(customersData);

            } catch (err) {
                console.error('Error fetching data:', err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser, dbOperations, invoiceId, locationState]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (salesDropdownRef.current && !salesDropdownRef.current.contains(event.target as Node)) {
                setIsSalesDropdownOpen(false);
            }
            if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
                setIsCustomerDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const itemsToReturn = useMemo(() =>
        originalSaleItems.filter(item => selectedReturnIds.has(item.id)),
        [originalSaleItems, selectedReturnIds]
    );

    const filteredReturnItems = useMemo(() => {
        const q = returnItemSearchQuery.trim().toLowerCase();
        if (!q) return originalSaleItems;

        return [...originalSaleItems].sort((a, b) => {
            const aMatch = (a.name || '').toLowerCase().includes(q);
            const bMatch = (b.name || '').toLowerCase().includes(q);
            if (aMatch && !bMatch) return -1;
            if (!aMatch && bMatch) return 1;
            return 0;
        });
    }, [originalSaleItems, returnItemSearchQuery]);

    const filteredSales = useMemo(() => salesList
        .filter(sale => !sale.isReturned)
        .filter(sale =>
            (sale.partyName && sale.partyName.toLowerCase().includes(searchSaleQuery.toLowerCase())) ||
            (sale.invoiceNumber && sale.invoiceNumber.toLowerCase().includes(searchSaleQuery.toLowerCase()))
        )
        .sort((a, b) => (b.createdAt?.toDate?.()?.getTime() || 0) - (a.createdAt?.toDate?.()?.getTime() || 0)),
        [salesList, searchSaleQuery]
    );

    const filteredCustomers = useMemo(() => {
        if (!partyNumber) return [];
        const searchParam = String(partyNumber).trim().toLowerCase();
        if (!searchParam) return [];
        return availableCustomers.filter(c => {
            const customerNumber = String(c.number ?? '').toLowerCase();
            const customerName = String(c.name ?? '').toLowerCase();
            return customerNumber.includes(searchParam) || customerName.includes(searchParam);
        });
    }, [availableCustomers, partyNumber]);

    const handleSelectCustomer = (customer: Customer) => {
        setPartyNumber(customer.number);
        setPartyName(customer.name);
        setIsCustomerDropdownOpen(false);
    };

    const handleToggleReturnItem = (itemId: string) => {
        setSelectedReturnIds(prevIds => {
            const newIds = new Set(prevIds);
            if (newIds.has(itemId)) newIds.delete(itemId); else newIds.add(itemId);
            return newIds;
        });
    };

    // Moved verbatim. Generic setter-taking helper, used both for
    // originalSaleItems (return-quantity edits) and — threaded out to the
    // caller — for exchangeItems (discount/quantity edits in
    // useExchangeItems), same as the original single definition served both.
    const handleListChange = (
        setter: React.Dispatch<React.SetStateAction<any[]>>,
        id: string,
        field: keyof TransactionItem | keyof ExchangeItem,
        value: string | number
    ) => {
        setter(prev => prev.map(item => {
            if (item.id === id) {
                let updatedValue: any = value;

                if (field === 'quantity' && (item as any).maxReturnQuantity !== undefined) {
                    const maxQty = (item as any).maxReturnQuantity;
                    const newQty = Number(value);
                    if (newQty > maxQty) {
                        setModal({ message: `Cannot return ${newQty} items. Only ${maxQty} were purchased.`, type: State.ERROR });
                        updatedValue = maxQty;
                    } else if (newQty < 1) {
                        updatedValue = 1;
                    }
                }

                const updatedItem: any = { ...item, [field]: updatedValue };
                const isRoundingEnabled = salesSettings?.enableRounding ?? true;
                const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;

                if (field === 'discount') {
                    const discountValue = Number(updatedValue) || 0;
                    // FIXED: Base price is MRP if it exists, otherwise Sales Price
                    const basePrice = (updatedItem.mrp && updatedItem.mrp > 0) ? updatedItem.mrp : (updatedItem.salesPrice || 0);

                    let newPrice = basePrice * (1 - discountValue / 100);
                    newPrice = applyRounding(newPrice, isRoundingEnabled, roundingInterval);
                    updatedItem.unitPrice = newPrice;
                    updatedItem.customPrice = newPrice;
                }

                if (field === 'quantity' || field === 'unitPrice' || field === 'discount') {
                    updatedItem.amount = toCurrency(Number(updatedItem.quantity) * Number(updatedItem.unitPrice));
                }
                return updatedItem;
            }
            return item;
        }));
    };

    const handleRemoveFromList = (setter: any, id: string) => {
        setter((prev: any[]) => prev.filter((item: any) => item.id !== id));
    };

    const navigate = useNavigate();
    const handleClear = () => {
        setSelectedSale(null);
        setPartyName('');
        setPartyNumber('');
        setOriginalSaleItems([]);
        setSelectedReturnIds(new Set());
        setExchangeItems([]);
        setSearchSaleQuery('');
        setExchangeSearchQuery('');
        setReturnItemSearchQuery('');
        navigate(ROUTES.SALES_RETURN);
    };

    return {
        partyName, setPartyName,
        partyNumber, setPartyNumber,
        originalSaleItems, setOriginalSaleItems,
        selectedReturnIds, setSelectedReturnIds,
        salesList, setSalesList,
        selectedSale, setSelectedSale,
        searchSaleQuery, setSearchSaleQuery,
        isSalesDropdownOpen, setIsSalesDropdownOpen,
        salesDropdownRef,
        availableCustomers, setAvailableCustomers,
        isCustomerDropdownOpen, setIsCustomerDropdownOpen,
        customerDropdownRef,
        availableItems, setAvailableItems,
        isLoading, setIsLoading,
        error,
        returnItemSearchQuery, setReturnItemSearchQuery,
        exchangeSearchQuery, setExchangeSearchQuery,
        itemsToReturn,
        filteredReturnItems,
        filteredSales,
        filteredCustomers,
        handleSelectSale,
        handleSelectCustomer,
        handleToggleReturnItem,
        handleListChange,
        handleRemoveFromList,
        handleClear,
    };
};
