import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAuth, useDatabase } from '../context/auth-context';
import type { Item, ItemGroup } from '../constants/models'; // Import ItemGroup
import { FiSearch, FiEdit, FiStar, FiCheckSquare, FiLoader, FiEye, FiPackage } from 'react-icons/fi';
import { ItemEditDrawer } from '../Components/ItemDrawer';
import { Spinner } from '../constants/Spinner';

// --- StockIndicator (Unchanged) ---
const StockIndicator: React.FC<{ stock: number }> = ({ stock }) => {
    let colorClass = 'text-green-600 bg-green-100';
    if (stock <= 10 && stock > 0) colorClass = 'text-yellow-600 bg-yellow-100';
    if (stock <= 0) colorClass = 'text-red-600 bg-red-100';

    return (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
            {stock} in stock
        </span>
    );
};

// --- QuickListedToggle (Unchanged) ---
interface QuickListedToggleProps {
    itemId: string;
    isListed: boolean;
    onToggle: (itemId: string, newState: boolean) => Promise<void>;
    disabled?: boolean;
}
const QuickListedToggle: React.FC<QuickListedToggleProps> = ({ itemId, isListed, onToggle, disabled }) => {
    const [isLoading, setIsLoading] = useState(false);

    const handleClick = async () => {
        if (disabled || isLoading) return;
        setIsLoading(true);
        try {
            await onToggle(itemId, !isListed);
        } catch (error) {
            console.error("Error toggling listed status:", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <button
            onClick={handleClick}
            disabled={disabled || isLoading}
            className={`flex-1 p-3 text-sm font-medium flex items-center justify-center gap-1 md:gap-2 border-l transition-colors disabled:opacity-50 ${isListed
                ? 'bg-green-50 text-green-700 hover:bg-green-100'
                : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                }`}
            title={isListed ? "Unlist Item" : "List Item"}
        >
            {isLoading ? (
                <FiLoader className="h-4 w-4 animate-spin" />
            ) : isListed ? (
                <FiCheckSquare className="h-4 w-4 text-green-600" />
            ) : (
                <FiStar className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">{isListed ? 'Listed' : 'List'}</span>
        </button>
    );
};


const ITEMS_PER_BATCH_RENDER = 24;
const MyShopPage: React.FC = () => {
    const { currentUser, loading: authLoading } = useAuth();
    const dbOperations = useDatabase();

    const [isViewMode, setIsViewMode] = useState(false);
    const [allItems, setAllItems] = useState<Item[]>([]);

    // --- Store the full ItemGroup objects, including duplicates ---
    const [allItemGroups, setAllItemGroups] = useState<ItemGroup[]>([]);

    const [selectedCategory, setSelectedCategory] = useState('All'); // Will store 'All' or a group ID
    const [searchQuery, setSearchQuery] = useState('');
    const [pageIsLoading, setPageIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [updateError, setUpdateError] = useState<string | null>(null);
    const [listAllLoading, setListAllLoading] = useState(false);
    const [itemsToRenderCount, setItemsToRenderCount] = useState(ITEMS_PER_BATCH_RENDER);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [selectedItemForEdit, setSelectedItemForEdit] = useState<Item | null>(null);
    const observerRef = useRef<IntersectionObserver | null>(null);
    const loadMoreRef = useRef<HTMLDivElement | null>(null);

   useEffect(() => {
        if (authLoading || !currentUser || !dbOperations) {
            setPageIsLoading(authLoading || !dbOperations);
            return;
        }

        const fetchData = async () => {
            try {
                setPageIsLoading(true); 
                setError(null); 
                // Don't clear items immediately (setAllItems([])) if you want to avoid a "flash"
                // But if you prefer a clean state, keeping it is fine.
                setAllItems([]); 
                setItemsToRenderCount(ITEMS_PER_BATCH_RENDER);

                // OPTIMIZATION: Use syncItems() instead of getItems()
                const [fetchedItemGroups, fetchedItems] = await Promise.all([
                    dbOperations.getItemGroups(),
                    dbOperations.syncItems() // <--- The magic change
                ]);

                setAllItemGroups(fetchedItemGroups);
                setAllItems(fetchedItems);

            } catch (err: any) {
                setError(err.message || 'Failed to load initial data.'); 
                console.error("Fetch Error:", err);
            } finally {
                setPageIsLoading(false);
            }
        };
        fetchData();
    }, [authLoading, currentUser, dbOperations]);

    // --- FIX: Create a DE-DUPLICATED list of groups for the filter buttons ---
    const uniqueCategories = useMemo(() => {
        const map = new Map<string, ItemGroup>();
        allItemGroups.forEach(group => {
            if (!map.has(group.name.toLowerCase())) { // Use lowercase name as the unique key
                map.set(group.name.toLowerCase(), group);
            }
        });
        const uniqueGroups = Array.from(map.values());
        uniqueGroups.sort((a, b) => a.name.localeCompare(b.name)); // Sort them
        return uniqueGroups;
    }, [allItemGroups]);


    const filteredItems = useMemo(() => {
        return allItems.filter(item => {
            if (isViewMode && !item.isListed) {
                return false;
            }

            // --- FIX: Filter by ID, not by name ---
            // Get the group object that matches the selectedCategory ID
            const selectedGroup = allItemGroups.find(g => g.id === selectedCategory);

            const matchesCategory =
                selectedCategory === 'All' || // "All" is selected
                item.itemGroupId === selectedCategory || // Item's ID matches selected ID
                (selectedGroup && item.itemGroupId === selectedGroup.name); // Legacy: Item's ID (which is a name) matches selected group's name

            const matchesSearch =
                item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (item.barcode && item.barcode.includes(searchQuery));
            return matchesCategory && matchesSearch;
        });
    }, [allItems, selectedCategory, searchQuery, isViewMode, allItemGroups]); // Added allItemGroups

    const unlistedFilteredCount = useMemo(() => {
        return filteredItems.filter(item => !item.isListed).length;
    }, [filteredItems]);

    const itemsToDisplay = useMemo(() => {
        return filteredItems.slice(0, itemsToRenderCount);
    }, [filteredItems, itemsToRenderCount]);

    const hasMoreItems = useMemo(() => {
        return itemsToRenderCount < filteredItems.length;
    }, [itemsToRenderCount, filteredItems.length]);

    const loadMoreItems = useCallback(() => {
        if (!hasMoreItems) return;
        setItemsToRenderCount(prevCount => prevCount + ITEMS_PER_BATCH_RENDER);
    }, [hasMoreItems]);

    useEffect(() => {
        if (observerRef.current) observerRef.current.disconnect();

        observerRef.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasMoreItems) {
                loadMoreItems();
            }
        });

        const currentLoadMoreRef = loadMoreRef.current;
        if (currentLoadMoreRef) {
            observerRef.current.observe(currentLoadMoreRef);
        }

        return () => {
            if (currentLoadMoreRef) {
                observerRef.current?.unobserve(currentLoadMoreRef);
            }
            observerRef.current?.disconnect();
        };
    }, [loadMoreItems, hasMoreItems]);

    const handleOpenEditDrawer = (item: Item) => {
        setSelectedItemForEdit(item);
        setIsDrawerOpen(true);
    };
    const handleCloseEditDrawer = () => {
        setIsDrawerOpen(false);
        setTimeout(() => setSelectedItemForEdit(null), 300);
    };
    const handleSaveSuccess = (updatedItemData: Partial<Item>) => {
        setAllItems(prevItems => prevItems.map(item =>
            item.id === selectedItemForEdit?.id
                ? { ...item, ...updatedItemData, id: item.id } as Item
                : item
        ));
        setUpdateError(null);
        console.log("Item updated successfully.");
    };

    const handleToggleListed = async (itemId: string, newState: boolean) => {
        if (!dbOperations) return;
        setUpdateError(null);
        try {
            await dbOperations.updateItem(itemId, { isListed: newState });
            setAllItems(prevItems => prevItems.map(item =>
                item.id === itemId ? { ...item, isListed: newState } as Item : item
            ));
        } catch (err: any) {
            setUpdateError(err.message || "Failed to update item status."); throw err;
        }
    };

    const handleListAllFiltered = async () => {
        if (!dbOperations) return;
        const itemsToList = filteredItems.filter(item => !item.isListed && item.id);
        if (itemsToList.length === 0) return;
        setListAllLoading(true); setUpdateError(null);
        try {
            const updatePromises = itemsToList.map(item => dbOperations.updateItem(item.id!, { isListed: true }));
            await Promise.all(updatePromises);
            const updatedItemIds = new Set(itemsToList.map(item => item.id));
            setAllItems(prevItems => prevItems.map(item => updatedItemIds.has(item.id) ? { ...item, isListed: true } as Item : item));
        } catch (err: any) {
            setUpdateError(err.message || "Failed to list all filtered items."); console.error("List All Error:", err);
        } finally {
            setListAllLoading(false);
        }
    };

    if (authLoading || !dbOperations) {
        return <div className="flex items-center justify-center h-screen"><Spinner /> <span className="ml-2">Initializing...</span></div>;
    }

    if (pageIsLoading && allItems.length === 0) {
        return <div className="flex items-center justify-center h-screen"><Spinner /> <span className="ml-2">Loading catalogue...</span></div>;
    }

    if (error && allItems.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-screen text-red-500 p-4">
                <p className="text-center mb-4">{error}</p>
                <button onClick={() => window.location.reload()} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-gray-100 w-full">
            <div className="flex-shrink-0 p-4 bg-white shadow-sm border-b sticky top-0 z-20">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-gray-800">
                            {isViewMode ? 'Public Catalogue Preview' : 'My Shop Catalogue'}
                        </h1>
                        <p className="text-gray-500 text-sm md:text-base">
                            {isViewMode ? 'This is how customers see your listed items.' : 'Manage items and toggle listing status.'}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        {!isViewMode && (
                            <button
                                onClick={handleListAllFiltered}
                                disabled={listAllLoading || filteredItems.length === 0 || unlistedFilteredCount === 0}
                                className="font-semibold py-2 px-3 rounded-lg shadow-sm transition-colors flex items-center gap-2 text-sm bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                            >
                                {listAllLoading ? (<FiLoader className="h-4 w-4 animate-spin" />) : (<FiCheckSquare size={16} />)}
                                List {unlistedFilteredCount > 0 ? `(${unlistedFilteredCount}) ` : ''}Filtered
                            </button>
                        )}
                        <button
                            onClick={() => setIsViewMode(!isViewMode)}
                            className={`font-semibold py-2 px-3 rounded-lg shadow-sm transition-colors flex items-center gap-2 text-sm ${isViewMode
                                ? 'bg-gray-700 text-white hover:bg-gray-800'
                                : 'bg-green-600 text-white hover:bg-green-700'
                                }`}
                        >
                            {isViewMode ? <FiEdit size={16} /> : <FiEye size={16} />}
                            {isViewMode ? 'Edit Mode' : 'Preview'}
                        </button>
                    </div>
                </div>

                {updateError && <p className="text-red-500 bg-red-100 p-2 rounded text-sm mt-2">{updateError}</p>}
                {error && allItems.length > 0 && <p className="text-red-500 text-sm mt-2">{error}</p>}
            </div>

            {/* --- SEARCH & FILTER BAR --- */}
            <div className="flex-shrink-0 p-3 bg-white border-b sticky top-[88px] z-10 flex flex-col md:flex-row gap-2">
                <div className="relative flex-grow">
                    <input type="text" placeholder="Search by name or barcode..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full p-3 pl-10 border rounded-lg text-sm md:text-base" />
                    <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                </div>

                {/* --- FIX: This is your button filter, now using uniqueCategories --- */}
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    <button
                        key="All" // Unique key for "All"
                        onClick={() => setSelectedCategory('All')}
                        className={`px-3 md:px-4 py-1.5 text-xs md:text-sm font-medium rounded-full flex-shrink-0 transition-colors ${selectedCategory === 'All'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                    >
                        All
                    </button>
                    {/* Map over the DE-DUPLICATED list */}
                    {uniqueCategories.map(group => (
                        <button
                            key={group.id!} // <-- Use the UNIQUE ID for the key
                            onClick={() => setSelectedCategory(group.id!)} // <-- Set the UNIQUE ID
                            className={`px-3 md:px-4 py-1.5 text-xs md:text-sm font-medium rounded-full flex-shrink-0 transition-colors ${selectedCategory === group.id
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                }`}
                        >
                            {group.name} {/* Display the name */}
                        </button>
                    ))}
                </div>
                {/* --- END FIX --- */}
            </div>

            {/* --- ITEM GRID --- */}
            <div className="flex-1 overflow-y-auto p-3 md:p-4">
                <p className="text-xs md:text-sm text-gray-600 mb-3 px-1 md:px-0">
                    Showing {itemsToDisplay.length} of {filteredItems.length} filtered items ({allItems.length} total)
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
                    {itemsToDisplay.map(item => (
                        <div key={item.id} className="bg-white rounded-lg shadow-sm overflow-hidden flex flex-col border border-gray-200 transition-shadow hover:shadow-lg" >
                            <div className="relative h-40 w-full bg-gray-200 flex items-center justify-center text-gray-400">
                                {item.imageUrl ? (
                                    <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                                ) : (
                                    <FiPackage className="h-12 w-12" />
                                )}
                                {item.isListed && (
                                    <div className="absolute top-2 left-2 bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                                        <FiStar size={10} /> Listed
                                    </div>
                                )}
                            </div>

                            <div className="p-3 md:p-4 flex-grow flex flex-col">
                                <div>
                                    <p className="font-semibold text-gray-800 break-words mb-2 text-sm md:text-base line-clamp-2 h-10 md:h-12">{item.name}</p>
                                    <StockIndicator stock={item.stock || 0} />
                                </div>
                                <p className="text-base md:text-lg font-bold text-gray-900 mt-auto pt-2">₹{item.mrp.toFixed(2)}</p>
                            </div>

                            {!isViewMode && (
                                <div className="flex border-t">
                                    <button onClick={() => handleOpenEditDrawer(item)} className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 p-3 text-sm font-medium flex items-center justify-center gap-1 md:gap-2 border-r" >
                                        <FiEdit className="h-4 w-4" /> Edit
                                    </button>
                                    <QuickListedToggle itemId={item.id!} isListed={item.isListed ?? false} onToggle={handleToggleListed} disabled={listAllLoading} />
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {hasMoreItems && (
                    <div ref={loadMoreRef} className="h-20 flex justify-center items-center mt-4">
                        <Spinner />
                    </div>
                )}
                {!hasMoreItems && filteredItems.length > 0 && (
                    <p className="text-center text-gray-500 text-sm mt-8">You've reached the end of the list.</p>
                )}

                {filteredItems.length === 0 && !pageIsLoading && (
                    <div className="text-center text-gray-500 mt-10 p-4">
                        <p>No items found matching '{searchQuery}' in category '{selectedCategory}'.</p>
                        {isViewMode && <p className="text-sm">Only listed items are shown in preview mode.</p>}
                    </div>
                )}
            </div>

            {/* --- DRAWER --- */}
            <ItemEditDrawer item={selectedItemForEdit} isOpen={isDrawerOpen} onClose={handleCloseEditDrawer} onSaveSuccess={handleSaveSuccess} />
        </div>
    );
};

export default MyShopPage;