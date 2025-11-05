import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAuth, useDatabase } from '../context/Auth-Context';
import type { Item } from '../constants/models';
// --- CHANGED --- Added FiPackage for the image placeholder
import { FiSearch, FiEdit, FiStar, FiCheckSquare, FiLoader, FiEye, FiPackage } from 'react-icons/fi';
import { ItemEditDrawer } from '../Components/ItemDrawer';
import { Spinner } from '../constants/Spinner';

// ... (StockIndicator component remains the same)
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

// ... (QuickListedToggle component remains the same)
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
            className={`flex-1 p-2 text-xs md:text-sm font-medium flex items-center justify-center gap-1 md:gap-2 border-l transition-colors disabled:opacity-50 ${isListed
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
        </button>
    );
};


const ITEMS_PER_BATCH_RENDER = 24;
const MyShopPage: React.FC = () => {
    const { currentUser, loading: authLoading } = useAuth();
    const dbOperations = useDatabase();

    const [isViewMode, setIsViewMode] = useState(false);
    const [allItems, setAllItems] = useState<Item[]>([]);
    const [categories, setCategories] = useState<string[]>(['All']);
    const [selectedCategory, setSelectedCategory] = useState('All');
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

    // ... (useEffect for fetchData remains the same) ...
    useEffect(() => {
        if (authLoading || !currentUser || !dbOperations) {
            setPageIsLoading(authLoading);
            return;
        }

        const fetchData = async () => {
            try {
                setPageIsLoading(true); setError(null); setAllItems([]);
                setItemsToRenderCount(ITEMS_PER_BATCH_RENDER);

                const fetchedItemGroups = await dbOperations.getItemGroups();
                const categoryNames = fetchedItemGroups.map(group => group.name);
                setCategories(['All', ...categoryNames]);

                const fetchedItems = await dbOperations.getItems();
                setAllItems(fetchedItems);

            } catch (err: any) {
                setError(err.message || 'Failed to load initial data.'); console.error("Fetch Error:", err);
            } finally {
                setPageIsLoading(false);
            }
        };
        fetchData();
    }, [authLoading, currentUser, dbOperations]);

    // ... (useMemo for filteredItems remains the same) ...
    const filteredItems = useMemo(() => {
        return allItems.filter(item => {
            if (isViewMode && !item.isListed) {
                return false;
            }
            const matchesCategory = selectedCategory === 'All' || item.itemGroupId === selectedCategory;
            const matchesSearch =
                item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (item.barcode && item.barcode.includes(searchQuery));
            return matchesCategory && matchesSearch;
        });
    }, [allItems, selectedCategory, searchQuery, isViewMode]);

    // ... (useMemo for itemsToDisplay remains the same) ...
    const itemsToDisplay = useMemo(() => {
        return filteredItems.slice(0, itemsToRenderCount);
    }, [filteredItems, itemsToRenderCount]);

    // ... (useMemo for hasMoreItems remains the same) ...
    const hasMoreItems = useMemo(() => {
        return itemsToRenderCount < filteredItems.length;
    }, [itemsToRenderCount, filteredItems.length]);

    // ... (useCallback for loadMoreItems remains the same) ...
    const loadMoreItems = useCallback(() => {
        if (!hasMoreItems) return;
        setItemsToRenderCount(prevCount => prevCount + ITEMS_PER_BATCH_RENDER);
    }, [hasMoreItems]);

    // ... (useEffect for IntersectionObserver remains the same) ...
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

    // ... (All handler functions: handleOpenEditDrawer, handleCloseEditDrawer, handleSaveSuccess, handleToggleListed, handleListAllFiltered remain the same) ...
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

    // ... (Loading and Error states remain the same) ...
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

    const unlistedFilteredCount = filteredItems.filter(item => !item.isListed).length;

    return (
        <div className="flex flex-col h-screen bg-gray-100 w-full">
            {/* --- HEADER --- */}
            <div className="flex-shrink-0 p-4 bg-white shadow-sm">
                <div className="flex justify-between items-center mb-2">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-gray-800">
                            {isViewMode ? 'Public Catalogue Preview' : 'My Shop Catalogue'}
                        </h1>
                        <p className="text-gray-500 text-sm md:text-base">
                            {isViewMode ? 'This is how customers see your listed items.' : 'Manage items and toggle listing status.'}
                        </p>
                    </div>

                    <button
                        onClick={() => setIsViewMode(!isViewMode)}
                        className={`font-semibold py-2 px-4 rounded-lg shadow-sm transition-colors flex items-center gap-2 text-sm ${isViewMode
                            ? 'bg-gray-700 text-white hover:bg-gray-800' // "View" mode
                            : 'bg-green-600 text-white hover:bg-green-700' // "Edit" mode
                            }`}
                    >
                        {isViewMode ? <FiEdit size={16} /> : <FiEye size={16} />}
                        {isViewMode ? 'Switch to Edit Mode' : 'Preview Public Page'}
                    </button>
                </div>

                {updateError && <p className="text-red-500 bg-red-100 p-2 rounded text-sm mt-2">{updateError}</p>}
                {error && allItems.length > 0 && <p className="text-red-500 text-sm mt-2">{error}</p>}
            </div>

            {/* --- SEARCH & FILTER BAR --- */}
            <div className="flex-shrink-0 p-2 bg-white border-b sticky top-0 z-10">
                <div className="relative mb-2"> <input type="text" placeholder="Search by name or barcode..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full p-3 pl-10 border rounded-lg text-sm md:text-base" /> <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" /> </div>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide"> {categories.map(category => (<button key={category} onClick={() => setSelectedCategory(category)} className={`px-3 md:px-4 py-1.5 text-xs md:text-sm font-medium rounded-full flex-shrink-0 transition-colors ${selectedCategory === category ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`} > {category} </button>))} </div>

                {!isViewMode && (
                    <div className="pt-2 mt-2 border-t">
                        <button onClick={handleListAllFiltered} disabled={listAllLoading || filteredItems.length === 0 || unlistedFilteredCount === 0} className="w-full bg-blue-500 text-white font-semibold py-2 px-4 rounded-md text-sm hover:bg-blue-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2" >
                            {listAllLoading ? (<Spinner />) : (<FiCheckSquare size={16} />)}
                            {listAllLoading ? 'Listing...' : `List ${unlistedFilteredCount > 0 ? `(${unlistedFilteredCount}) ` : ''}Filtered Items`}
                        </button>
                    </div>
                )}
            </div>

            {/* --- ITEM GRID --- */}
            <div className="flex-1 overflow-y-auto p-2 md:p-4">
                <p className="text-xs md:text-sm text-gray-600 mb-3 px-2 md:px-0">
                    Showing {itemsToDisplay.length} of {filteredItems.length} filtered items ({allItems.length} total)
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 md:gap-4">
                    {itemsToDisplay.map(item => (
                        <div key={item.id} className="bg-white rounded-lg shadow-sm overflow-hidden flex flex-col border border-gray-200 transition-shadow hover:shadow-md" >

                            {/* --- CHANGED --- Added Image display section */}
                            <div className="h-40 w-full bg-gray-200 flex items-center justify-center text-gray-400">
                                {item.imageUrl ? (
                                    <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                                ) : (
                                    <FiPackage className="h-12 w-12" />
                                )}
                            </div>
                            {/* --- End of Image Section --- */}

                            <div className="p-3 md:p-4 flex-grow relative">
                                <p className="font-semibold text-gray-800 break-words mb-2 text-sm md:text-base line-clamp-2 h-10 md:h-12">{item.name}</p>
                                <p className="text-base md:text-lg font-bold text-gray-900 mb-3">₹{item.mrp.toFixed(2)}</p>
                                <StockIndicator stock={item.stock || 0} />
                                {item.isListed && (<div className="absolute top-2 right-2 bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm"> <FiStar size={10} /> Listed </div>)}
                            </div>

                            {!isViewMode && (
                                <div className="flex border-t">
                                    <button onClick={() => handleOpenEditDrawer(item)} className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 p-2 text-xs md:text-sm font-medium flex items-center justify-center gap-1 md:gap-2 border-r" > <FiEdit className="h-3 w-3 md:h-4 md:w-4" /> Edit </button>
                                    <QuickListedToggle itemId={item.id!} isListed={item.isListed ?? false} onToggle={handleToggleListed} disabled={listAllLoading} />
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {hasMoreItems && (
                    <div ref={loadMoreRef} className="h-10 flex justify-center items-center mt-4">
                        {/* Loader for infinite scroll */}
                    </div>
                )}
                {!hasMoreItems && filteredItems.length > 0 && (
                    <p className="text-center text-gray-500 text-sm mt-4">You've reached the end of the list.</p>
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