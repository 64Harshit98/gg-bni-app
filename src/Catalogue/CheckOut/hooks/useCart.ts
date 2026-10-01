import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import type { CartItem, CatalogueSalesSettings } from '../checkOut.types';
import { deriveTaxContext, buildUpcomingSyncPayload } from '../checkOut.calculations';
import { getSlabForQty } from '../../../constants/models';

// Quantity-slab pricing for a checkout line.
// - qty inside a slab  -> slab price
// - qty outside slabs  -> base price saved when the item was added in the catalogue
const repriceCartLine = (line: CartItem, qty: number): CartItem => {
    if (!line.quantitySlabs || line.quantitySlabs.length === 0) return line;
    const slab = getSlabForQty({ quantitySlabs: line.quantitySlabs }, qty);
    if (slab) return { ...line, salesPrice: slab.salesPrice };
    return { ...line, salesPrice: line.baseSalesPrice ?? line.salesPrice };
};

export const useCart = (
    effectiveCompanyId: string | null,
    salesSettings: CatalogueSalesSettings | null
) => {
    const [cartItems, setCartItems] = useState<CartItem[]>([]);

    useEffect(() => {
        const savedCart = localStorage.getItem('temp_cart');
        console.log("Saved:", savedCart)
        if (savedCart) {
            try {
                const parsedCart = JSON.parse(savedCart);
                const formattedItems: CartItem[] = parsedCart.map((entry: any) => ({
                    id: entry.item.id,
                    name: entry.item.name,
                    category: entry.item.groupId || entry.item.groupid || entry.item.category || 'Product',
                    groupId: entry.item.groupId || entry.item.groupid || '',
                    mrp: entry.item.mrp || 0,
                    salesPrice: entry.item.salesPrice || entry.item.mrp || 0,
                    quantity: entry.quantity,
                    imageUrl: entry.item.imageUrl || '',
                    moq: entry.item.moq || 1,
                    tax: entry.item.tax || 0,
                    note: '',
                    unit: entry.item.unit ?? "pcs",
                    unitMultiplier: entry.item.unitMultiplier ?? entry.item.multiplier ?? 1,
                                        tierId: entry.item.tierId || undefined,        // 👈 NEW
                    tierLabel: entry.item.tierLabel || undefined,  // 👈 NEW
                    quantitySlabs: entry.item.quantitySlabs || undefined,
                    baseSalesPrice: entry.item.baseSalesPrice ?? undefined,
                } as any));
                setCartItems(formattedItems);
            } catch (error) {
                console.error(error);
            }
        }
    }, []);

    const syncToUpcoming = async (updatedCart: CartItem[]) => {
        if (!effectiveCompanyId || updatedCart.length === 0) return;

        const leadSubmittedCheck = localStorage.getItem("leadSubmitted") === "true";
        if (!leadSubmittedCheck) return;

        try {
            const userKey = localStorage.getItem("upcoming_user_key");
            if (!userKey) return;

            const orderRef = doc(
                db,
                "companies",
                effectiveCompanyId,
                "Orders",
                `upcoming_${userKey}`
            );

            const snap = await getDoc(orderRef);
            if (!snap.exists()) return;

            const { scheme: syncScheme, taxType: syncTaxType } = deriveTaxContext(salesSettings);
            const { itemsForFirebase, totalAmount: roundedTotalAmount, roundOff: roundOffAmt } = buildUpcomingSyncPayload(updatedCart, syncScheme, syncTaxType);

            await setDoc(
                orderRef,
                {
                    items: itemsForFirebase,
                    totalAmount: roundedTotalAmount, // Save rounded amount
                    roundOff: roundOffAmt,           // Save round off difference
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );

        } catch (err) {
            console.error("CartPage syncToUpcoming error:", err);
        }
    };

    const updateItemNote = (id: string | number, note: string) => {
        setCartItems(prev => prev.map(item => item.id === id ? { ...item, note } : item));
    };

    const updateQuantity = (id: string | number, delta: number) => {
        const updatedItems = cartItems
            .map(item => {
                if (item.id === id) {
                    const moqQty = item.moq || 1;
                    let newQty = item.quantity + delta;
                                        newQty = Math.max(moqQty, newQty);
                    return repriceCartLine({ ...item, quantity: newQty }, newQty);
                }
                return item;
            })
            .filter(item => item.quantity > 0);

        setCartItems(updatedItems);
        localStorage.setItem('temp_cart', JSON.stringify(updatedItems.map(i => ({
            item: { ...i },
            quantity: i.quantity
        }))));
        syncToUpcoming(updatedItems);
    };

    const removeFromCart = (id: string | number) => {
        const updatedCart = cartItems.filter(item => item.id !== id);
        setCartItems(updatedCart);
        localStorage.setItem('temp_cart', JSON.stringify(updatedCart.map(i => ({
            item: { ...i },
            quantity: i.quantity
        }))));

        syncToUpcoming(updatedCart);
    };

    return { cartItems, setCartItems, updateItemNote, updateQuantity, removeFromCart, syncToUpcoming };
};
