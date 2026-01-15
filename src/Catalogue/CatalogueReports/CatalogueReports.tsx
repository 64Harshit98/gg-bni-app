import React, { useState, useMemo, Fragment } from "react";
import { FiSearch, FiShoppingCart, FiX, FiPackage, FiPlus, FiMinus } from "react-icons/fi";
import { Transition } from "@headlessui/react";

/* ---------------- Dummy Data ---------------- */

const DUMMY_GROUPS = [
    { id: "all", name: "All" },
    { id: "snacks", name: "Snacks" },
    { id: "drinks", name: "Drinks" },
    { id: "grocery", name: "Grocery" },
];

const DUMMY_ITEMS = [
    { id: "1", name: "Lays Chips", mrp: 20, groupId: "snacks" },
    { id: "2", name: "Coca Cola", mrp: 40, groupId: "drinks" },
    { id: "3", name: "Pepsi", mrp: 35, groupId: "drinks" },
    { id: "4", name: "Rice 1Kg", mrp: 60, groupId: "grocery" },
];

/* ---------------- Cart Drawer ---------------- */

const CartDrawer = ({ isOpen, onClose, cart, onUpdateQty }) => {
    const total = useMemo(() => cart.reduce((a, b) => a + b.mrp * b.qty, 0), [cart]);

    return (
        <Transition.Root show={isOpen} as={Fragment}>
            <div className="fixed inset-0 z-50 bg-black bg-opacity-40 flex justify-end">
                <div className="bg-white w-80 h-full p-4">
                    <div className="flex justify-between mb-4">
                        <h2 className="font-bold text-lg">Your Cart</h2>
                        <FiX className="cursor-pointer" onClick={onClose} />
                    </div>

                    {cart.map((item) => (
                        <div key={item.id} className="flex justify-between mb-2">
                            <p>{item.name}</p>
                            <div className="flex items-center gap-2">
                                <button onClick={() => onUpdateQty(item.id, -1)}>-</button>
                                <span>{item.qty}</span>
                                <button onClick={() => onUpdateQty(item.id, 1)}>+</button>
                            </div>
                        </div>
                    ))}

                    <div className="mt-6 font-bold">Total: ₹{total}</div>
                </div>
            </div>
        </Transition.Root>
    );
};

/* ---------------- Main UI Page ---------------- */

const OrderingPageUI = () => {
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("all");
    const [cart, setCart] = useState([]);
    const [isCartOpen, setIsCartOpen] = useState(false);

    const filteredItems = useMemo(() => {
        return DUMMY_ITEMS.filter(
            (i) =>
                (category === "all" || i.groupId === category) &&
                i.name.toLowerCase().includes(search.toLowerCase())
        );
    }, [search, category]);

    const addToCart = (item) => {
        setCart((prev) => {
            const found = prev.find((x) => x.id === item.id);
            if (found) return prev.map((x) => (x.id === item.id ? { ...x, qty: x.qty + 1 } : x));
            return [...prev, { ...item, qty: 1 }];
        });
    };

    const updateQty = (id, delta) => {
        setCart((prev) =>
            prev
                .map((x) => (x.id === id ? { ...x, qty: x.qty + delta } : x))
                .filter((x) => x.qty > 0)
        );
    };

    return (
        <div className="h-screen flex flex-col bg-gray-100">
            <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} cart={cart} onUpdateQty={updateQty} />

            {/* Header */}
            <div className="bg-white p-4 flex justify-between items-center shadow">
                <h1 className="font-bold text-xl">Shop UI</h1>
                <FiShoppingCart size={24} onClick={() => setIsCartOpen(true)} className="cursor-pointer" />
            </div>

            {/* Search */}
            <div className="p-2 bg-white">
                <div className="relative">
                    <FiSearch className="absolute left-3 top-3 text-gray-400" />
                    <input
                        className="w-full p-2 pl-9 border rounded"
                        placeholder="Search items..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                {/* Categories */}
                <div className="flex gap-2 mt-2 overflow-x-auto">
                    {DUMMY_GROUPS.map((g) => (
                        <button
                            key={g.id}
                            onClick={() => setCategory(g.id)}
                            className={`px-4 py-1 rounded-full ${category === g.id ? "bg-blue-600 text-white" : "bg-gray-200"}`}
                        >
                            {g.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Items */}
            <div className="flex-1 p-2 grid grid-cols-2 gap-3 overflow-y-auto">
                {filteredItems.map((item) => (
                    <div key={item.id} className="bg-white rounded shadow p-2 flex flex-col">
                        <div className="h-24 flex items-center justify-center bg-gray-200 mb-2">
                            <FiPackage size={32} />
                        </div>
                        <p className="font-semibold text-sm">{item.name}</p>
                        <p className="font-bold">₹{item.mrp}</p>
                        <button onClick={() => addToCart(item)} className="mt-auto bg-orange-500 text-white rounded py-1">
                            Add
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default OrderingPageUI;
