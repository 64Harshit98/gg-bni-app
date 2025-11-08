import React, { useState, useEffect, useMemo, Fragment } from 'react';
import { useAuth, useDatabase } from '../context/auth-context';
import type { Item } from '../constants/models';
import { Modal } from '../constants/Modal';
import { State } from '../enums';
import { FiSearch, FiShoppingCart, FiX, FiPackage, FiPlus, FiMinus } from 'react-icons/fi';
import { Transition } from '@headlessui/react';
import { Spinner } from '../constants/Spinner';
import { ItemDetailDrawer } from '../Components/ItemDetails'; // <-- Make sure this path is correct

// --- Firebase imports for saving the order ---
import { db } from '../lib/Firebase'; // <-- Make sure this path is correct
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';


// --- Cart Item Type ---
interface CartItem {
    id: string;
    name: string;
    mrp: number;
    quantity: number;
    imageUrl?: string | null;
}

// --- Cart Drawer Component ---
interface CartDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    cart: CartItem[];
    onUpdateQuantity: (id: string, delta: number) => void;
    onPlaceOrder: () => void; // Renamed to onPlaceOrder, will trigger the customer modal
    isPlacingOrder: boolean;
}

const CartDrawer: React.FC<CartDrawerProps> = ({ isOpen, onClose, cart, onUpdateQuantity, onPlaceOrder, isPlacingOrder }) => {
    const cartTotal = useMemo(() => {
        return cart.reduce((acc, item) => acc + item.mrp * item.quantity, 0);
    }, [cart]);

    return (
        <Transition.Root show={isOpen} as={Fragment}>
            <div className="fixed inset-0 z-40 overflow-hidden">
                <div className="absolute inset-0 overflow-hidden">
                    {/* Background overlay */}
                    <Transition.Child as={Fragment} enter="ease-in-out duration-500" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in-out duration-500" leaveFrom="opacity-100" leaveTo="opacity-0">
                        <div className="absolute inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose} />
                    </Transition.Child>
                    {/* Cart Panel */}
                    <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
                        <Transition.Child as={Fragment} enter="transform transition ease-in-out duration-500 sm:duration-700" enterFrom="translate-x-full" enterTo="translate-x-0" leave="transform transition ease-in-out duration-500 sm:duration-700" leaveFrom="translate-x-0" leaveTo="translate-x-full">
                            <div className="w-screen max-w-md">
                                <div className="flex h-full flex-col overflow-y-scroll bg-white shadow-xl">
                                    {/* Header */}
                                    <div className="flex-shrink-0 bg-gray-100 p-4 border-b">
                                        <div className="flex items-start justify-between">
                                            <h2 className="text-xl font-bold text-gray-900">Your Order</h2>
                                            <button onClick={onClose} className="text-gray-500 hover:text-gray-800"> <FiX className="h-6 w-6" /> </button>
                                        </div>
                                    </div>
                                    {/* Cart Items */}
                                    <div className="flex-1 overflow-y-auto p-4">
                                        {cart.length === 0 ? (<p className="text-center text-gray-500">Your cart is empty.</p>) : (
                                            <div className="flex flex-col gap-4">
                                                {cart.map(item => (
                                                    <div key={item.id} className="flex gap-3 border-b pb-3">
                                                        <div className="h-16 w-16 rounded bg-gray-200 flex-shrink-0 flex items-center justify-center text-gray-400">
                                                            {item.imageUrl ? (<img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover rounded" />) : (<FiPackage className="h-8 w-8" />)}
                                                        </div>
                                                        <div className="flex-1">
                                                            <p className="font-semibold text-gray-800">{item.name}</p>
                                                            <p className="text-sm text-gray-600">₹{item.mrp.toFixed(2)}</p>
                                                        </div>
                                                        <div className="flex flex-col items-end justify-between">
                                                            <p className="font-bold">₹{(item.mrp * item.quantity).toFixed(2)}</p>
                                                            <div className="flex items-center gap-2 text-lg border border-gray-300 rounded-md">
                                                                <button onClick={() => onUpdateQuantity(item.id, -1)} className="px-3 text-gray-700">-</button>
                                                                <span className="font-bold text-gray-900 w-8 text-center text-base">{item.quantity}</span>
                                                                <button onClick={() => onUpdateQuantity(item.id, 1)} className="px-3 text-gray-700">+</button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    {/* Footer */}
                                    {cart.length > 0 && (
                                        <div className="border-t border-gray-200 p-4">
                                            <div className="flex justify-between text-lg font-bold mb-4">
                                                <p>Total Amount</p>
                                                <p>₹{cartTotal.toFixed(2)}</p>
                                            </div>
                                            {/* This button now just triggers the next step */}
                                            <button onClick={onPlaceOrder} disabled={isPlacingOrder} className="w-full bg-blue-600 text-white py-3 rounded-md font-bold hover:bg-blue-700 disabled:bg-gray-400" >
                                                {isPlacingOrder ? 'Loading...' : 'Place Order'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Transition.Child>
                    </div>
                </div>
            </div>
        </Transition.Root>
    );
};


// --- Quantity Control for Item Card ---
interface ItemCardQuantityControlProps {
    item: Item;
    cartItem: CartItem | undefined;
    onAddToCart: (item: Item, quantity: number) => void;
    onSetQuantity: (id: string, quantity: number) => void;
    onUpdateQuantity: (id: string, delta: number) => void;
}

const ItemCardQuantityControl: React.FC<ItemCardQuantityControlProps> = ({ item, cartItem, onAddToCart, onSetQuantity, onUpdateQuantity }) => {
    const [inputValue, setInputValue] = useState<string | number>('');

    useEffect(() => {
        setInputValue(cartItem?.quantity || '');
    }, [cartItem]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setInputValue(val);
        const num = parseInt(val, 10);
        if (!isNaN(num) && num > 0) {
            onSetQuantity(item.id!, num);
        }
    };

    const handleBlur = () => {
        setInputValue(cartItem?.quantity || '');
        if (inputValue === '' || inputValue === 0) {
            onSetQuantity(item.id!, 0);
        }
    };

    if (!cartItem) {
        return (
            <button
                onClick={() => onAddToCart(item, 1)}
                className="w-full bg-orange-500 text-white font-bold py-2 rounded-md hover:bg-orange-600 transition-colors mt-auto"
            >
                ADD TO CART
            </button>
        );
    }

    return (
        <div className="flex items-center justify-center gap-2 text-lg mt-auto">
            <button onClick={() => onUpdateQuantity(item.id!, -1)} className="px-3 py-1 rounded-md text-gray-700 border border-gray-300" >
                <FiMinus size={16} />
            </button>
            <input
                type="number"
                value={inputValue}
                onChange={handleInputChange}
                onBlur={handleBlur}
                className="font-bold text-gray-900 w-16 text-center text-base border border-gray-300 rounded-md py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="1"
            />
            <button onClick={() => onUpdateQuantity(item.id!, 1)} className="px-3 py-1 rounded-md text-gray-700 border border-gray-300" >
                <FiPlus size={16} />
            </button>
        </div>
    );
};


// --- Ordering Page Component ---
const OrderingPage: React.FC = () => {
    const { currentUser, loading: authLoading } = useAuth();
    const dbOperations = useDatabase();

    // Page state
    const [items, setItems] = useState<Item[]>([]);
    const [categories, setCategories] = useState<string[]>(['All']);
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [pageIsLoading, setPageIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Cart state
    const [cart, setCart] = useState<CartItem[]>([]);
    const [isCartOpen, setIsCartOpen] = useState(false);

    // Order state
    const [isPlacingOrder, setIsPlacingOrder] = useState(false);
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);

    // Item Detail state
    const [selectedItem, setSelectedItem] = useState<Item | null>(null);
    const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);

    // --- NEW: Customer Details State ---
    const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');


    // useEffect for fetching data
    useEffect(() => {
        if (authLoading || !currentUser || !dbOperations) {
            setPageIsLoading(authLoading);
            return;
        }
        const fetchData = async () => {
            try {
                setPageIsLoading(true);
                setError(null);
                const [fetchedItems, fetchedItemGroups] = await Promise.all([
                    dbOperations.getItems(),
                    dbOperations.getItemGroups()
                ]);
                const listedItems = fetchedItems.filter(item => item.isListed === true);
                setItems(listedItems);

                const categoryNames = fetchedItemGroups.map(group => group.name);
                const uniqueCategoryNames = [...new Set(categoryNames)];
                setCategories(['All', ...uniqueCategoryNames]);

            } catch (err: any) {
                setError(err.message || 'Failed to load shop.');
            } finally {
                setPageIsLoading(false);
            }
        };
        fetchData();
    }, [authLoading, currentUser, dbOperations]);

    // Handlers for Item Detail Drawer
    const handleItemClick = (item: Item) => {
        setSelectedItem(item);
        setIsDetailDrawerOpen(true);
    };

    const handleCloseDetailDrawer = () => {
        setIsDetailDrawerOpen(false);
        setTimeout(() => setSelectedItem(null), 300);
    };

    // --- Cart Handlers ---
    const handleAddToCart = (item: Item, quantity: number) => {
        setCart(prevCart => {
            if (!item.id || quantity <= 0) return prevCart;
            const existingItem = prevCart.find(cartItem => cartItem.id === item.id);

            if (existingItem) {
                return prevCart.map(cartItem =>
                    cartItem.id === item.id ? { ...cartItem, quantity: cartItem.quantity + quantity } : cartItem
                );
            } else {
                return [...prevCart, {
                    id: item.id,
                    name: item.name,
                    mrp: item.mrp,
                    quantity: quantity,
                    imageUrl: item.imageUrl || null // <-- THIS IS THE FIX
                }];
            }
        });
    };

    const handleUpdateCartQuantity = (id: string, delta: number) => {
        setCart(prevCart => {
            const itemToUpdate = prevCart.find(item => item.id === id);
            if (!itemToUpdate) return prevCart;
            const newQuantity = itemToUpdate.quantity + delta;
            if (newQuantity <= 0) {
                return prevCart.filter(item => item.id !== id);
            } else {
                return prevCart.map(item =>
                    item.id === id ? { ...item, quantity: newQuantity } : item
                );
            }
        });
    };

    const handleSetCartQuantity = (id: string, newQuantity: number) => {
        setCart(prevCart => {
            if (newQuantity <= 0) {
                return prevCart.filter(item => item.id !== id);
            }
            return prevCart.map(item =>
                item.id === id ? { ...item, quantity: newQuantity } : item
            );
        });
    };

    const cartCount = useMemo(() => {
        return cart.reduce((acc, item) => acc + item.quantity, 0);
    }, [cart]);

    // Filtered items for display
    const filteredItems = useMemo(() => {
        return items.filter(item => {
            const matchesCategory = selectedCategory === 'All' || item.itemGroupId === selectedCategory;
            const matchesSearch =
                item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (item.barcode && item.barcode.includes(searchQuery));
            return matchesCategory && matchesSearch;
        });
    }, [items, selectedCategory, searchQuery]);

    // --- (NEW) Step 1: Triggered by Cart Drawer "Place Order" button ---
    const handleProceedToCheckout = () => {
        if (cart.length === 0) {
            setModal({ message: "Your cart is empty.", type: State.ERROR });
            return;
        }
        setIsCartOpen(false); // Close cart
        setIsCustomerModalOpen(true); // Open customer details modal
    };

    // --- (MODIFIED) Step 2: Triggered by "Confirm Order" button in the new modal ---
    const handleConfirmAndSaveOrder = async () => {
        // 1. Validation
        if (customerName.trim() === '' || customerPhone.trim() === '') {
            setModal({ message: 'Please enter both customer name and phone number.', type: State.ERROR });
            return;
        }
        if (!currentUser) {
            setModal({ message: "User not authenticated. Please log in again.", type: State.ERROR });
            return;
        }
        if (cart.length === 0) {
            setModal({ message: "Your cart is empty.", type: State.ERROR });
            return;
        }

        setIsPlacingOrder(true);
        setModal(null);

        try {
            // 2. Calculate total
            const totalAmount = cart.reduce((acc, item) => acc + item.mrp * item.quantity, 0);

            // 3. Create the order object with customer details
            const orderToSave = {
                items: cart,
                totalAmount: totalAmount,
                status: 'Upcoming', // Default status for a new order
                createdAt: serverTimestamp(), // Use Firestore's timestamp

                // --- Customer-entered details ---
                userName: customerName.trim(),
                userPhone: customerPhone.trim(),

                // --- Internal tracking details ---
                placedByUserId: currentUser.uid, // ID of the staff who placed the order
                companyId: (currentUser as any).companyId || null, // Using 'as any' to bypass type-check for now
            };

            console.log("Placing order:", orderToSave); // This is line 372

            // 4. Save to Firestore
            const ordersCollectionRef = collection(db, 'companies', currentUser.companyId, 'Orders');
            await addDoc(ordersCollectionRef, orderToSave);

            // 5. Success feedback and cleanup
            setModal({ message: "Order placed successfully!", type: State.SUCCESS });
            setCart([]);
            setIsCustomerModalOpen(false);
            setCustomerName('');
            setCustomerPhone('');

        } catch (err: any) {
            console.error("Order Error:", err); // This is where your error is caught
            setModal({ message: err.message || "Failed to place order.", type: State.ERROR });
        } finally {
            setIsPlacingOrder(false);
        }
    };

    // --- Render ---
    if (pageIsLoading) {
        return <div className="flex items-center justify-center h-screen"><Spinner /> <span className="ml-2">Loading Shop...</span></div>;
    }
    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-screen text-red-500 p-4">
                <p className="text-center mb-4">{error}</p>
                <button onClick={() => window.location.reload()} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Retry</button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-gray-100 w-full overflow-hidden">
            {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

            {/* --- NEW: Customer Details Modal --- */}
            {isCustomerModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500 bg-opacity-75 p-4">
                    <div className="bg-white rounded-lg shadow-xl p-5 md:p-6 w-full max-w-md">
                        <h3 className="text-xl font-bold mb-4 text-gray-900">Enter Customer Details</h3>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="customerName" className="block text-sm font-medium text-gray-700">
                                    Full Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    id="customerName"
                                    value={customerName}
                                    onChange={(e) => setCustomerName(e.target.value)}
                                    className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                    placeholder="Enter customer's name"
                                />
                            </div>
                            <div>
                                <label htmlFor="customerPhone" className="block text-sm font-medium text-gray-700">
                                    Phone Number <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="tel"
                                    id="customerPhone"
                                    value={customerPhone}
                                    onChange={(e) => setCustomerPhone(e.target.value)}
                                    className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                    placeholder="Enter 10-digit phone number"
                                />
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setIsCustomerModalOpen(false)}
                                disabled={isPlacingOrder}
                                className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmAndSaveOrder}
                                disabled={isPlacingOrder}
                                className="inline-flex justify-center rounded-md border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400"
                            >
                                {isPlacingOrder ? <Spinner /> : 'Confirm Order'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* --- End of New Modal --- */}

            <CartDrawer
                isOpen={isCartOpen}
                onClose={() => setIsCartOpen(false)}
                cart={cart}
                onUpdateQuantity={handleUpdateCartQuantity}
                onPlaceOrder={handleProceedToCheckout} // <-- This now triggers the new modal
                isPlacingOrder={isPlacingOrder}
            />
            <ItemDetailDrawer
                isOpen={isDetailDrawerOpen}
                onClose={handleCloseDetailDrawer}
                item={selectedItem}
                onAddToCart={handleAddToCart}
            />

            {/* --- HEADER --- */}
            <div className="flex-shrink-0 p-4 bg-white shadow-sm flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-800">Shop</h1>
                <button onClick={() => setIsCartOpen(true)} className="relative text-gray-700 hover:text-blue-600">
                    <FiShoppingCart className="h-7 w-7" />
                    {cartCount > 0 && (
                        <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                            {cartCount}
                        </span>
                    )}
                </button>
            </div>

            {/* --- SEARCH & FILTER BAR --- */}
            <div className="flex-shrink-0 p-2 bg-white border-b sticky top-0 z-10">
                <div className="relative mb-2">
                    <input
                        type="text"
                        placeholder="Search listed items..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full p-3 pl-10 border rounded-lg"
                    />
                    <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {categories.map(category => (
                        <button
                            key={category} // This is now unique
                            onClick={() => setSelectedCategory(category)}
                            className={`px-4 py-1.5 text-sm font-medium rounded-full flex-shrink-0 transition-colors ${selectedCategory === category
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-200 text-gray-700'
                                }`}
                        >
                            {category}
                        </button>
                    ))}
                </div>
            </div>

            {/* --- ITEM GRID --- */}
            <div className="flex-1 overflow-y-auto p-2">
                <p className="text-xs md:text-sm text-gray-600 mb-3 px-2 md:px-0">
                    Showing {filteredItems.length} listed items
                </p>
                <div className="grid grid-cols-2 gap-3">
                    {filteredItems.map(item => {
                        const cartItem = cart.find(ci => ci.id === item.id);

                        return (
                            <div
                                key={item.id}
                                className="bg-white rounded-lg shadow-sm overflow-hidden flex flex-col"
                            >
                                <button
                                    onClick={() => handleItemClick(item)}
                                    className="block text-left"
                                >
                                    <div className="h-40 w-full bg-gray-200 flex items-center justify-center text-gray-400">
                                        {item.imageUrl ? (
                                            <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                                        ) : (
                                            <FiPackage className="h-12 w-12" />
                                        )}
                                    </div>
                                    <div className="p-3">
                                        <p className="font-semibold text-gray-800 break-words text-sm line-clamp-2 h-10">{item.name}</p>
                                        <p className="text-lg font-bold text-gray-900 my-2">₹{item.mrp.toFixed(2)}</p>
                                    </div>
                                </button>

                                <div className="p-3 pt-0 mt-auto">
                                    <ItemCardQuantityControl
                                        item={item}
                                        cartItem={cartItem}
                                        onAddToCart={handleAddToCart}
                                        onSetQuantity={handleSetCartQuantity}
                                        onUpdateQuantity={handleUpdateCartQuantity}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>

                {filteredItems.length === 0 && !pageIsLoading && (
                    <p className="text-center text-gray-500 mt-10 p-4">
                        No listed items found matching your filters.
                    </p>
                )}
            </div>
        </div>
    );
};

export default OrderingPage;