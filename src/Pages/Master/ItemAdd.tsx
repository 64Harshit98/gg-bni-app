import React, { useState, useEffect } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { createItem, getItemGroups } from '../../lib/items_firebase';
import type { Item, ItemGroup } from '../../constants/models';
import { ROUTES } from '../../constants/routes.constants';

const ItemAdd: React.FC = () => {
    const navigate = useNavigate();
    const [itemName, setItemName] = useState<string>('');
    const [itemMRP, setItemMRP] = useState<string>('');
    const [itemPurchasePrice, setItemPurchasePrice] = useState<string>('');
    const [itemDiscount, setItemDiscount] = useState<string>('');
    const [itemTax, setItemTax] = useState<string>('');
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState('Item Add');

    useEffect(() => {
        const fetchGroups = async () => {
            try {
                setLoading(true);
                const groups = await getItemGroups();
                setItemGroups(groups);
                if (groups.length > 0) {
                    setSelectedCategory(groups[0].id!);
                }
            } catch (err) {
                console.error('Failed to fetch item groups:', err);
                setError('Failed to load item categories. Please try again.');
            } finally {
                setLoading(false);
            }
        };
        fetchGroups();
    }, []);

    const handleAddItem = async () => {
        setError(null);

        if (!itemName.trim() || !itemMRP.trim() || !selectedCategory) {
            setError('Please fill in all required fields: Item Name, MRP, and Category.');
            return;
        }

        const mrp = parseFloat(itemMRP);
        const purchasePrice = parseFloat(itemPurchasePrice);
        const discount = parseFloat(itemDiscount);
        const tax = parseFloat(itemTax);

        if (isNaN(mrp) || mrp <= 0) {
            setError('Please enter a valid MRP (a positive number).');
            return;
        }
        if (itemPurchasePrice.trim() !== '' && (isNaN(purchasePrice) || purchasePrice < 0)) {
            setError('Please enter a valid Purchase Price (a non-negative number).');
            return;
        }
        if (itemDiscount.trim() !== '' && (isNaN(discount) || discount < 0 || discount > 100)) {
            setError('Please enter a valid Discount percentage (0-100).');
            return;
        }
        if (itemTax.trim() !== '' && (isNaN(tax) || tax < 0)) {
            setError('Please enter a valid Tax percentage (a non-negative number).');
            return;
        }

        const itemGroupId = selectedCategory;

        if (!itemGroupId) {
            setError('Selected category is invalid. Please select a valid category.');
            return;
        }

        try {
            const newItemData: Omit<Item, 'id' | 'createdAt' | 'updatedAt'> = {
                name: itemName.trim(),
                mrp: mrp,
                purchasePrice: purchasePrice || 0,
                discount: discount || 0,
                tax: tax || 0,
                itemGroupId: itemGroupId,
            };

            const newItemId = await createItem(newItemData);
            alert(`Item "${itemName}" added successfully with ID: ${newItemId}`);
            console.log('New Item added:', newItemData);

            setItemName('');
            setItemMRP('');
            setItemPurchasePrice('');
            setItemDiscount('');
            setItemTax('');

            navigate(ROUTES.MASTERS);
        } catch (err) {
            console.error('Error adding item:', err);
            setError('Failed to add item. Please try again.');
        }
    };

    return (
        <div className="flex flex-col min-h-screen bg-white w-full">
            <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200 shadow-sm sticky top-0 z-1000">
                <button onClick={() => navigate(ROUTES.HOME)} className="text-2xl font-bold text-gray-600 bg-transparent border-none cursor-pointer p-1">
                    &times;
                </button>
                <div className="flex-1 flex justify-center items-center gap-6">
                    <NavLink
                        to={`${ROUTES.MASTERS}/${ROUTES.ITEM_ADD}`}
                        className={`flex-1 cursor-pointer border-b-2 py-3 text-center text-base font-medium transition hover:text-slate-700 ${
                            activeTab === 'Item Add'
                                ? 'border-blue-600 font-semibold text-blue-600'
                                : 'border-transparent text-slate-500'
                        }`}
                        onClick={() => setActiveTab('Item Add')}
                    >
                        Item Add
                    </NavLink>
                    <NavLink
                        to={`${ROUTES.MASTERS}/${ROUTES.ITEM_GROUP}`}
                        className={`flex-1 cursor-pointer border-b-2 py-3 text-center text-base font-medium transition hover:text-slate-700 ${
                            activeTab === 'Item Groups'
                                ? 'border-blue-600 font-semibold text-blue-600'
                                : 'border-transparent text-slate-500'
                        }`}
                        onClick={() => setActiveTab('Item Groups')}
                    >
                        Item Groups
                    </NavLink>
                </div>
                <div className="w-6"></div>
            </div>

            <div className="flex-grow p-4 bg-white w-full overflow-y-auto box-border">
                {error && (
                    <div className="mb-4 text-center p-4 bg-red-100 rounded-lg shadow-sm border border-red-200">
                        <p className="text-red-700 font-semibold">{error}</p>
                    </div>
                )}
                <div className="p-6 bg-white rounded-lg shadow-md">
                    <div className="mb-4">
                        <label htmlFor="itemName" className="block text-gray-700 text-lg font-medium mb-2">Item Name</label>
                        <input
                            type="text"
                            id="itemName"
                            value={itemName}
                            onChange={(e) => setItemName(e.target.value)}
                            placeholder="e.g., Laptop, Keyboard"
                            className="w-full p-3 border border-gray-300 rounded-lg bg-blue-50 text-gray-800 text-base pl-4 box-border placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                        />
                    </div>

                    <div className="mb-4">
                        <label htmlFor="itemMRP" className="block text-gray-700 text-lg font-medium mb-2">MRP</label>
                        <input
                            type="number"
                            id="itemMRP"
                            value={itemMRP}
                            onChange={(e) => setItemMRP(e.target.value)}
                            placeholder="e.g., 999.99"
                            className="w-full p-3 border border-gray-300 rounded-lg bg-blue-50 text-gray-800 text-base pl-4 box-border placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                        />
                    </div>
                    <div className="mb-4">
                        <label htmlFor="itemPurchasePrice" className="block text-gray-700 text-lg font-medium mb-2">Item Purchase Price</label>
                        <input
                            type="number"
                            id="itemPurchasePrice"
                            value={itemPurchasePrice}
                            onChange={(e) => setItemPurchasePrice(e.target.value)}
                            placeholder="e.g., 899.99"
                            className="w-full p-3 border border-gray-300 rounded-lg bg-blue-50 text-gray-800 text-base pl-4 box-border placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                        />
                    </div>
                    <div className="mb-4">
                        <label htmlFor="itemDiscount" className="block text-gray-700 text-lg font-medium mb-2">Item Discount (%)</label>
                        <input
                            type="number"
                            id="itemDiscount"
                            value={itemDiscount}
                            onChange={(e) => setItemDiscount(e.target.value)}
                            placeholder="e.g., 10 (for 10%)"
                            className="w-full p-3 border border-gray-300 rounded-lg bg-blue-50 text-gray-800 text-base pl-4 box-border placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                        />
                    </div>

                    <div className="mb-4">
                        <label htmlFor="itemCategory" className="block text-gray-700 text-lg font-medium mb-2">Category</label>
                        {loading ? (
                            <p className="text-gray-500">Loading categories...</p>
                        ) : error ? (
                            <p className="text-red-600 font-semibold">Error loading categories.</p>
                        ) : (
                            <select
                                id="itemCategory"
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                className="w-full p-3 border border-gray-300 rounded-lg bg-blue-50 text-gray-800 text-base focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                            >
                                <option value="">Select a category</option>
                                {itemGroups.map((group) => (
                                    <option key={group.id} value={group.id!}>
                                        {group.name}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    <div className="mb-4">
                        <label htmlFor="itemTax" className="block text-gray-700 text-lg font-medium mb-2">Tax (%)</label>
                        <input
                            type="number"
                            id="itemTax"
                            value={itemTax}
                            onChange={(e) => setItemTax(e.target.value)}
                            placeholder="e.g., 18 (for 18%)"
                            className="w-full p-3 border border-gray-300 rounded-lg bg-blue-50 text-gray-800 text-base pl-4 box-border placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                        />
                    </div>
                </div>
            </div>

            <div className="sticky bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-up flex justify-center items-center z-10 w-full box-border">
                <button onClick={handleAddItem} className="w-full max-w-xs py-3 px-6 bg-blue-600 text-white rounded-lg text-lg font-semibold shadow-md transition hover:bg-blue-700">
                    Add Item
                </button>
            </div>
        </div>
    );
};

export default ItemAdd;