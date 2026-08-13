import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    collection,
    query,
    getDocs,
    doc,
    getDoc,
    type DocumentData,
    orderBy,
    limit,
    type DocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../../../../lib/Firebase';
import { ROUTES } from '../../../../constants/routes.constants';
import type { Item } from '../../../../constants/models';
import { State } from '../../../../enums';
import type { PurchaseData, TransactionItem, ReturnCartItem, Party } from '../purchaseReturn.types';

interface UsePurchaseReturnLookupParams {
    currentUser: any;
    dbOperations: any;
    purchaseId: string | undefined;
    locationState: any;
    setActiveTaxMode: (mode: 'inclusive' | 'exclusive' | 'exempt') => void;
    setModal: (modal: { message: string; type: State } | null) => void;
    setNewItemsReceived: (items: ReturnCartItem[]) => void;
    setNewItemsSearchQuery: (q: string) => void;
}

// Owns purchase/party lookup + the returnable-items list — moved verbatim
// from PurchaseReturn.tsx: purchaseList/selectedPurchase/
// originalPurchaseItems/selectedReturnIds state, the three search-dropdown
// state+click-outside effect (purchase search, party-by-name,
// party-by-number), the initial data-fetch effect, handleSelectPurchase,
// handleSelectParty, handleToggleReturnItem, handleClear, and the generic
// handleItemChange helper (used by this hook's own return-item quantity
// editing — the only caller in the original file, unlike SalesReturn's
// equivalent which was shared with the exchange list too).
export const usePurchaseReturnLookup = ({
    currentUser,
    dbOperations,
    purchaseId,
    locationState,
    setActiveTaxMode,
    setModal,
    setNewItemsReceived,
    setNewItemsSearchQuery,
}: UsePurchaseReturnLookupParams) => {
    const navigate = useNavigate();

    const [supplierName, setSupplierName] = useState<string>('');
    const [supplierNumber, setSupplierNumber] = useState<string>('');
    const [supplierAddress, setSupplierAddress] = useState<string>('');
    const [supplierGstin, setSupplierGstin] = useState<string>('');

    const [originalPurchaseItems, setOriginalPurchaseItems] = useState<TransactionItem[]>([]);
    const [selectedReturnIds, setSelectedReturnIds] = useState<Set<string>>(new Set());
    const [purchaseList, setPurchaseList] = useState<PurchaseData[]>([]);
    const [selectedPurchase, setSelectedPurchase] = useState<PurchaseData | null>(null);
    const [searchQuery, setSearchQuery] = useState<string>('');

    // Purchase Search Dropdown
    const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Party (Customer) Search Dropdown States
    const [availableParties, setAvailableParties] = useState<Party[]>([]);

    // 1. Party Number Dropdown
    const [isPartyDropdownOpen, setIsPartyDropdownOpen] = useState<boolean>(false);
    const partyDropdownRef = useRef<HTMLDivElement>(null);

    // 2. Party Name Dropdown (NEW)
    const [isNameDropdownOpen, setIsNameDropdownOpen] = useState<boolean>(false);
    const nameDropdownRef = useRef<HTMLDivElement>(null);

    const [availableItems, setAvailableItems] = useState<Item[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [returnItemSearchQuery, setReturnItemSearchQuery] = useState<string>('');

    const handleSelectPurchase = (purchase: PurchaseData) => {
        setSelectedPurchase(purchase);
        setSupplierName(purchase.partyName);
        setSupplierNumber(purchase.partyNumber || '');
        setSupplierAddress(purchase.partyAddress || '');
        setSupplierGstin(purchase.partyGstin || '');

        // 👇 STRICTLY INHERIT FROM THE ORIGINAL BILL
        if (purchase.taxType) {
            setActiveTaxMode((purchase.taxType === 'exempt' ? 'none' : purchase.taxType) as any);
        } else {
            setActiveTaxMode('exclusive'); // Fallback for old bills
        }

        setOriginalPurchaseItems(purchase.items.map((item: any) => {
            const itemData = item.data || item;
            const quantity = itemData.quantity || 1;
            const unitPrice = itemData.purchasePrice ?? itemData.finalPrice ?? 0;

            return {
                id: crypto.randomUUID(),
                originalItemId: itemData.id,
                name: itemData.name,
                quantity: quantity,
                unitPrice: unitPrice,
                maxReturnQuantity: quantity,
                amount: unitPrice * quantity,
                mrp: itemData.mrp || 0,
                tax: itemData.tax || 0,
                hsnSac: itemData.hsnSac || '',
                barcode: itemData.barcode || '',
                unit: itemData.unit || '',
                stock: itemData.stock || 0,
                unitMultiplier: itemData.unitMultiplier || 1
            };
        }));

        setSelectedReturnIds(new Set());
        setNewItemsReceived([]);
        setNewItemsSearchQuery('');
        setReturnItemSearchQuery('');
        setSearchQuery(purchase.invoiceNumber || purchase.partyName);
        setIsDropdownOpen(false);
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
                const purchasesQuery = query(
                    collection(db, 'companies', currentUser.companyId, 'purchases'),
                    orderBy('createdAt', 'desc'),
                    limit(50)
                );

                const partiesQuery = query(collection(db, 'companies', currentUser.companyId, 'suppliers'), limit(100));

                let specificPurchasePromise: Promise<DocumentSnapshot<DocumentData, DocumentData> | null> = Promise.resolve(null);

                if (purchaseId && !locationState?.invoiceData) {
                    const specificRef = doc(db, 'companies', currentUser.companyId, 'purchases', purchaseId);
                    specificPurchasePromise = getDoc(specificRef);
                }

                const [purchasesSnapshot, allItems, partiesSnap, specificPurchaseSnap] = await Promise.all([
                    getDocs(purchasesQuery),
                    dbOperations.syncItems(),
                    getDocs(partiesQuery),
                    specificPurchasePromise
                ]);

                const recentPurchases: PurchaseData[] = purchasesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseData));
                const partiesData = partiesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Party));

                if (locationState?.invoiceData) {
                    handleSelectPurchase(locationState.invoiceData);
                }
                else if (specificPurchaseSnap && specificPurchaseSnap.exists()) {
                    const specificData = { id: specificPurchaseSnap.id, ...specificPurchaseSnap.data() } as PurchaseData;
                    if (!recentPurchases.find(p => p.id === specificData.id)) {
                        recentPurchases.unshift(specificData);
                    }
                    handleSelectPurchase(specificData);
                }
                else if (purchaseId) {
                    const preselected = recentPurchases.find(p => p.id === purchaseId);
                    if (preselected) {
                        handleSelectPurchase(preselected);
                    }
                }

                setPurchaseList(recentPurchases);
                setAvailableItems(allItems);
                setAvailableParties(partiesData);

            } catch (err) {
                setError('Failed to load initial data.');
                console.error("Error fetching data:", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser, dbOperations, purchaseId, locationState]);

    // Click Outside Handler (Modified to close both dropdowns)
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
            if (partyDropdownRef.current && !partyDropdownRef.current.contains(event.target as Node)) {
                setIsPartyDropdownOpen(false);
            }
            if (nameDropdownRef.current && !nameDropdownRef.current.contains(event.target as Node)) {
                setIsNameDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const itemsToReturn = useMemo(() =>
        originalPurchaseItems.filter(item => selectedReturnIds.has(item.id)),
        [originalPurchaseItems, selectedReturnIds]
    );

    const filteredReturnItems = useMemo(() => {
        const q = returnItemSearchQuery.trim().toLowerCase();
        if (!q) return originalPurchaseItems;

        return [...originalPurchaseItems].sort((a, b) => {
            const aMatch = (a.name || '').toLowerCase().includes(q);
            const bMatch = (b.name || '').toLowerCase().includes(q);
            if (aMatch && !bMatch) return -1;
            if (!aMatch && bMatch) return 1;
            return 0;
        });
    }, [originalPurchaseItems, returnItemSearchQuery]);

    const filteredList = useMemo(() => purchaseList
        .filter(p => !p.isReturned)
        .filter(p =>
            p.partyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (p.invoiceNumber && p.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()))
        )
        .sort((a, b) => (b.createdAt?.toDate?.()?.getTime() || 0) - (a.createdAt?.toDate?.()?.getTime() || 0)),
        [purchaseList, searchQuery]
    );

    // Filter based on NUMBER input
    const filteredPartiesByNumber = useMemo(() => {
        if (!supplierNumber) return [];
        const searchParam = String(supplierNumber).trim().toLowerCase();
        if (!searchParam) return [];

        return availableParties.filter(c => {
            const pNumber = String(c.number ?? '').toLowerCase();
            const pName = String(c.name ?? '').toLowerCase();
            return pNumber.includes(searchParam) || pName.includes(searchParam);
        });
    }, [availableParties, supplierNumber]);

    // NEW: Filter based on NAME input
    const filteredPartiesByName = useMemo(() => {
        if (!supplierName) return [];
        const searchParam = String(supplierName).trim().toLowerCase();
        if (!searchParam) return [];

        return availableParties.filter(c => {
            const pName = String(c.name ?? '').toLowerCase();
            const pNumber = String(c.number ?? '').toLowerCase();
            return pName.includes(searchParam) || pNumber.includes(searchParam);
        });
    }, [availableParties, supplierName]);

    const handleSelectParty = (party: Party) => {
        setSupplierNumber(party.number);
        setSupplierName(party.name);
        // Close both
        setIsPartyDropdownOpen(false);
        setIsNameDropdownOpen(false);
    };

    const handleToggleReturnItem = (itemId: string) => {
        setSelectedReturnIds(prevIds => {
            const newIds = new Set(prevIds);
            if (newIds.has(itemId)) {
                newIds.delete(itemId);
            } else {
                newIds.add(itemId);
            }
            return newIds;
        });
    };

    const handleClear = () => {
        setSelectedPurchase(null);
        setSupplierName('');
        setSupplierNumber('');
        setSupplierAddress('');
        setSupplierGstin('');
        setSelectedReturnIds(new Set());
        setNewItemsReceived([]);
        setSearchQuery('');
        setNewItemsSearchQuery('');
        setReturnItemSearchQuery('');
        navigate(ROUTES.PURCHASE_RETURN);
    };

    const handleItemChange = (
        listSetter: React.Dispatch<React.SetStateAction<TransactionItem[]>>,
        id: string,
        field: keyof TransactionItem,
        value: string | number
    ) => {
        listSetter(prev => prev.map(item => {
            if (item.id === id) {
                let updatedValue = value;

                // --- VALIDATION LOGIC ---
                if (field === 'quantity') {
                    const maxQty = item.maxReturnQuantity || 0;
                    const newQty = Number(value);

                    if (newQty > maxQty) {
                        setModal({
                            message: `Cannot return ${newQty} items. Only ${maxQty} were purchased.`,
                            type: State.ERROR
                        });
                        updatedValue = maxQty;
                    } else if (newQty < 1) {
                        updatedValue = 1;
                    }
                }

                const updatedItem = { ...item, [field]: updatedValue };

                // Recalculate Amount
                if (field === 'quantity' || field === 'unitPrice') {
                    updatedItem.amount = Number(updatedItem.quantity) * Number(updatedItem.unitPrice);
                }

                return updatedItem;
            }
            return item;
        }));
    };

    return {
        supplierName, setSupplierName,
        supplierNumber, setSupplierNumber,
        supplierAddress, setSupplierAddress,
        supplierGstin, setSupplierGstin,
        originalPurchaseItems, setOriginalPurchaseItems,
        selectedReturnIds,
        purchaseList, selectedPurchase,
        searchQuery, setSearchQuery,
        isDropdownOpen, setIsDropdownOpen, dropdownRef,
        availableParties,
        isPartyDropdownOpen, setIsPartyDropdownOpen, partyDropdownRef,
        isNameDropdownOpen, setIsNameDropdownOpen, nameDropdownRef,
        availableItems, setAvailableItems,
        isLoading, setIsLoading, error,
        returnItemSearchQuery, setReturnItemSearchQuery,
        itemsToReturn, filteredReturnItems, filteredList,
        filteredPartiesByNumber, filteredPartiesByName,
        handleSelectPurchase, handleSelectParty, handleToggleReturnItem,
        handleClear, handleItemChange,
    };
};
