import { useCallback, useEffect, useMemo, useState } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import type { Item } from '../../constants/models';
import { getSlabForQty } from '../../constants/models';
import type { CatalogueSalesSettings } from '../Settings/CatalogueSalesSetting';
import { getEffectivePriceInfo, hasQuantitySlabs } from '../../Pages/utils/pricingUtils';
import { buildUpcomingSyncPayload, deriveTaxContext } from '../CheckOut/checkOut.calculations';
import type { CartItem } from '../CheckOut/checkOut.types';
import { ensurePendingApprovalEntry } from '../hooks/ensureApprovalEntry';
import { getLeadData, type CartLineItem } from './storefront.utils';

export type CartLine = { item: Item; quantity: number };

// Quantity-slab pricing for a cart line. `source` = the ORIGINAL catalogue item
// (its salesPrice isn't overwritten by a slab price), `cartItem` = the line stored in cart.
// - qty inside a slab  -> slab price becomes the line's salesPrice (discount % auto = MRP vs slab price)
// - qty outside slabs  -> back to the normal base price logic
// discount is set to 0 on slab lines so later getEffectivePriceInfo() calls
// (cartTotal / syncToUpcoming) don't apply the preset discount a second time.
export const repriceForQty = (cartItem: Item, qty: number, source: Item): Item => {
    if (!hasQuantitySlabs(source)) return cartItem;
    const slab = getSlabForQty(source, qty);
    if (slab) {
        return { ...cartItem, mrp: Number(source.mrp || 0), salesPrice: slab.salesPrice, discount: 0 };
    }
    const { salePrice, mrp } = getEffectivePriceInfo(source);
    return { ...cartItem, mrp, salesPrice: salePrice, discount: source.discount };
};

const cartKey = (i: Item) => `${i.id}__${(i as CartLineItem).tierId || '__base__'}`;

const readCart = (): CartLine[] => {
    try { return JSON.parse(localStorage.getItem('temp_cart') || '[]'); } catch { return []; }
};

const getGuestKey = () => {
    let key = localStorage.getItem('guest_uid');
    if (!key) {
        key = crypto.randomUUID();
        localStorage.setItem('guest_uid', key);
    }
    return key;
};

interface Options {
    companyId: string | null;
    settings: CatalogueSalesSettings | null;
    allItems: Item[];
    currentUser?: { uid?: string; name?: string } | null;
}

/** The customer's cart (kept in localStorage as temp_cart) plus the "Upcoming" draft order the owner sees. */
export const useStorefrontCart = ({ companyId, settings, allItems, currentUser }: Options) => {
    const [cart, setCart] = useState<CartLine[]>(readCart);
    const approvalEnabled = settings?.requireApproval === true;

    // Another tab (or the checkout page) changed the cart
    useEffect(() => {
        const onStorage = (e: StorageEvent) => { if (e.key === 'temp_cart') setCart(readCart()); };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    const syncToUpcoming = useCallback(async (updatedCart: CartLine[]) => {
        if (!companyId || updatedCart.length === 0) return;
        const leadSubmittedCheck = localStorage.getItem('leadSubmitted') === 'true';
        if (approvalEnabled && !leadSubmittedCheck) return;

        try {
            const leadData = getLeadData();
            const cleanNumber = (leadData.number || '').replace(/\D/g, '').trim();

            let userKey: string = localStorage.getItem('upcoming_user_key') || '';
            if (!userKey) {
                userKey = cleanNumber || currentUser?.uid || getGuestKey();
                localStorage.setItem('upcoming_user_key', userKey);
            }
            const loginName = currentUser?.name || 'Guest User';

            // Same tax-aware calculation the real checkout uses, so the draft total matches placeOrder()
            const { scheme, taxType } = deriveTaxContext(settings);
            const cartItemsForTax: CartItem[] = updatedCart.map((c) => {
                const { salePrice, mrp } = getEffectivePriceInfo(c.item);
                return {
                    id: c.item.id ?? '', name: c.item.name, category: '', mrp, salesPrice: salePrice,
                    quantity: c.quantity, image: '', note: '', unit: c.item.unit,
                    unitMultiplier: c.item.unitMultiplier ?? 1, tax: c.item.tax,
                };
            });
            const { itemsForFirebase: taxedItems, totalAmount } = buildUpcomingSyncPayload(cartItemsForTax, scheme, taxType);

            const items = updatedCart.map((c, idx) => {
                const line: Record<string, unknown> = {
                    id: String(c.item.id),
                    docId: c.item.firestoreDocId || c.item.id,
                    name: c.item.name,
                    quantity: c.quantity,
                    mrp: taxedItems[idx].mrp,
                    salesPrice: taxedItems[idx].salesPrice,
                    unit: c.item.unit,
                    unitMultiplier: c.item.unitMultiplier ?? 1,
                    finalPrice: taxedItems[idx].finalPrice,
                };
                Object.keys(line).forEach((k) => line[k] === undefined && delete line[k]);
                return line;
            });

            const orderRef = doc(db, 'companies', companyId, 'Orders', `upcoming_${userKey}`);
            const snap = await getDoc(orderRef);
            const leadSubmitted = localStorage.getItem('leadSubmitted') === 'true';
            const leadJustSubmitted = localStorage.getItem('leadJustSubmitted') === 'true';
            // Block only when it's an old lead and no upcoming doc exists
            if (!leadSubmitted && !leadJustSubmitted && !snap.exists()) return;

            const invoiceNumber = snap.exists() ? snap.data().invoiceNumber : `DRAFT-${userKey}`;
            const existing = snap.exists() ? snap.data() : {};
            const payload: Record<string, unknown> = {
                orderId: invoiceNumber,
                invoiceNumber,
                userId: userKey,
                userName: existing.userName || leadData.name || loginName || 'Guest User',
                userLoginPhone: existing.userLoginPhone || cleanNumber || '',
                status: 'Upcoming',
                isLead: true,
                items,
                totalAmount,
                paidAmount: 0,
                updatedAt: serverTimestamp(),
            };
            if (!snap.exists()) payload.createdAt = serverTimestamp();
            await setDoc(orderRef, payload, { merge: true });
            localStorage.removeItem('leadJustSubmitted');
        } catch (err) {
            console.error('Sync Upcoming Error:', err);
        }
    }, [companyId, approvalEnabled, settings, currentUser]);

    useEffect(() => {
        if (cart.length > 0) syncToUpcoming(cart);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cart]);

    /** Adds `qty` (default: one MOQ step), capped at stock unless negative inventory is allowed. Callers check the lead form first (see needsLead). */
    const addToCart = useCallback((item: Item, tierId?: string, groupId?: string, qty?: number) => {
        if (companyId) {
            const leadData = getLeadData();
            const cleanNumber = (leadData.number || '').replace(/\D/g, '').trim();
            if (cleanNumber) ensurePendingApprovalEntry(companyId, leadData.name || 'Guest User', cleanNumber);
        }
        setCart((prev) => {
            const newTierId = tierId || '__base__';
            const existing = prev.find((i) => cartKey(i.item) === `${item.id}__${newTierId}`);
            const moq = Math.max(1, Number(item.moq) || 1);
            const step = existing ? Math.max(1, Math.round(qty ?? moq)) : Math.max(moq, Math.round(qty ?? moq));
            // Packs (tiers) hold several pieces each, so only single-piece lines are capped at stock
            const cap = !settings?.allowNegativeInventory && newTierId === '__base__' ? Number(item.stock || 0) : Infinity;
            const moqQty = Math.min(step, cap - (existing?.quantity ?? 0));
            if (moqQty <= 0) return prev;
            const { salePrice, mrp } = getEffectivePriceInfo(item);
            const itemWithPrice = {
                ...item,
                tax: Number(item.tax ?? 0),
                unit: item.unit,
                unitMultiplier: item.unitMultiplier || 1,
                mrp,
                salesPrice: salePrice,
                groupid: groupId || item.itemGroupId,
                tierId: newTierId === '__base__' ? undefined : newTierId,
                tierLabel: newTierId === '__base__' ? undefined : (item as CartLineItem).tierLabel,
                baseSalesPrice: salePrice, // price outside any quantity slab (used by checkout to reprice)
            };
            const newCart = existing
                ? prev.map((i) => cartKey(i.item) === `${item.id}__${newTierId}`
                    ? { ...i, item: repriceForQty(i.item, i.quantity + moqQty, item), quantity: i.quantity + moqQty }
                    : i)
                : [...prev, { item: repriceForQty(itemWithPrice as Item, moqQty, item), quantity: moqQty }];

            localStorage.setItem('temp_cart', JSON.stringify(newCart.map((c) => ({
                item: { ...c.item, groupId: (c.item as CartLineItem).groupid || c.item.itemGroupId },
                quantity: c.quantity,
            }))));
            return newCart;
        });
    }, [companyId, settings]);

    const updateQuantity = useCallback((itemId: string, delta: number) => {
        setCart((prev) => {
            const newCart = prev.map((i) => {
                if (i.item.id !== itemId) return i;
                const moqQty = Number(i.item.moq) > 0 ? Number(i.item.moq) : 1;
                const newQty = i.quantity + (delta > 0 ? 1 : -1);
                if (newQty < moqQty) return null;
                const source = allItems.find((a) => a.id === i.item.id) ?? i.item;
                const isPack = !!(i.item as CartLineItem).tierId;
                if (delta > 0 && !settings?.allowNegativeInventory && !isPack && newQty > Number(source.stock || 0)) return i;
                return { ...i, item: repriceForQty(i.item, newQty, source), quantity: newQty };
            }).filter(Boolean) as CartLine[];
            localStorage.setItem('temp_cart', JSON.stringify(newCart));
            return newCart;
        });
    }, [allItems, settings]);

    const cartCount = useMemo(() => cart.reduce((a, c) => a + c.quantity, 0), [cart]);
    const cartTotal = useMemo(() => cart.reduce((a, c) => a + getEffectivePriceInfo(c.item).salePrice * c.quantity, 0), [cart]);
    const quantityOf = useCallback((itemId?: string) => cart.filter((c) => c.item.id === itemId).reduce((a, c) => a + c.quantity, 0), [cart]);

    return { cart, addToCart, updateQuantity, cartCount, cartTotal, quantityOf };
};

/** The storefront always asks for a name and number before the first add to cart. */
export const needsLead = () => localStorage.getItem('leadSubmitted') !== 'true';
