import React, { useState, useEffect, useRef } from 'react';
import type { Item, ItemGroup } from '../constants/models';
import { useDatabase } from '../context/auth-context';
import { doc, getDoc } from 'firebase/firestore';
import { db, storage } from '../lib/Firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { FiSave, FiX, FiPackage, FiCamera } from 'react-icons/fi';
import { Spinner } from '../constants/Spinner';
import imageCompression from 'browser-image-compression';

interface ItemEditDrawerProps {
    item: Item | null;
    isOpen: boolean;
    onClose: () => void;
    onSaveSuccess: (updatedItem: Partial<Item>) => void;
}

const ImagePreview: React.FC<{ imageUrl: string | null; alt: string }> = ({ imageUrl, alt }) => {
    if (!imageUrl) {
        return (
            <div className="w-full h-40 bg-gray-200 rounded-lg flex items-center justify-center text-gray-400">
                <FiPackage size={40} />
            </div>
        );
    }
    return (
        <img
            src={imageUrl}
            alt={alt}
            className="w-full h-40 object-cover rounded-lg border border-gray-300"
        />
    );
};
const UNIT_OPTIONS = [
    { value: '', label: 'Select Unit' },
    { value: 'pcs', label: 'Pieces (1)' },
    { value: 'box', label: 'Box (10)' },
    { value: 'pkt', label: 'Packet (Custom)' },
    { value: 'doz', label: 'Dozen (12)' },
    { value: 'qt', label: 'Quintal (100)' },
    { value: 'ton', label: 'Ton (1000)' },
];

export const ItemEditDrawer: React.FC<ItemEditDrawerProps> = ({ item, isOpen, onClose, onSaveSuccess }) => {
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const dbOperations = useDatabase();
    const [formData, setFormData] = useState<Partial<Item>>({});
    const [isSaving, setIsSaving] = useState(false);

    const [isFetching, setIsFetching] = useState(false);

    const [error, setError] = useState<string | null>(null);
    const firstInputRef = useRef<HTMLInputElement>(null);
    const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
    const [loadingGroups, setLoadingGroups] = useState(false);

    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);

    useEffect(() => {
        const fetchGroups = async () => {
            if (isOpen && dbOperations) {
                setLoadingGroups(true);
                try {
                    const groups = await dbOperations.getItemGroups();
                    setItemGroups(groups);
                } catch (err) {
                    console.error("Failed to load groups", err);
                } finally {
                    setLoadingGroups(false);
                }
            }
        };
        fetchGroups();
    }, [isOpen, dbOperations]);

    useEffect(() => {
        const fetchLiveItemData = async () => {
            if (isOpen && item && item.id && item.companyId) {
                setIsFetching(true);
                setError(null);

                try {
                    const itemRef = doc(db, 'companies', item.companyId, 'items', item.id);
                    const itemSnap = await getDoc(itemRef);

                    let liveData: Partial<Item> = {};

                    if (itemSnap.exists()) {
                        liveData = itemSnap.data() as Partial<Item>;
                    } else {
                        liveData = { ...item };
                    }

                    setFormData({
                        name: liveData.name || '',
                        mrp: liveData.mrp ?? undefined,
                        salesPrice: liveData.salesPrice ?? undefined,
                        stock: liveData.stock ?? (liveData as any).Stock ?? undefined,
                        itemGroupId: liveData.itemGroupId || '',
                        barcode: liveData.barcode || '',
                        hsnSac: liveData.hsnSac || '',
                        tax: liveData.tax ?? undefined,
                        purchasePrice: liveData.purchasePrice ?? undefined,
                        discount: liveData.discount ?? undefined,
                        purchasediscount: liveData.purchasediscount ?? undefined,
                        isListed: liveData.isListed ?? false,
                        imageUrl: liveData.imageUrl || '',
                        description: liveData.description || '',
                        unit: liveData.unit || '', // ADDED
                        packetSize: (liveData as any).packetSize ?? undefined,
                    });

                    setImagePreview(liveData.imageUrl || null);
                    setImageFile(null);
                    setUploadProgress(null);

                    setTimeout(() => {
                        firstInputRef.current?.focus();
                    }, 100);

                } catch (err) {
                    console.error("Error fetching live item data:", err);
                    setError("Failed to load latest item details.");
                } finally {
                    setIsFetching(false);
                }

            } else if (!isOpen) {
                setFormData({});
                setError(null);
                setIsSaving(false);
                setImageFile(null);
                setImagePreview(null);
                setUploadProgress(null);
            }
        };

        fetchLiveItemData();
    }, [isOpen, item]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const isCheckbox = type === 'checkbox';
        const checked = (e.target as HTMLInputElement).checked;

        // Added 'salesPrice' to numeric fields
        const isNumericField = ['mrp', 'purchasePrice', 'stock', 'tax', 'discount', 'salesPrice', 'packetSize'].includes(name);

        setFormData(prev => ({
            ...prev,
            [name]: isCheckbox
                ? checked
                : (value === '' && isNumericField ? '' : (isNumericField ? parseFloat(value) : value))
        }));
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setError(null);
        setUploadProgress(null);

        const options = {
            maxSizeMB: 0.05,
            maxWidthOrHeight: 1920,
            useWebWorker: true,
        };

        try {
            const compressedFile = await imageCompression(file, options);
            const newFile = new File([compressedFile], compressedFile.name || file.name, { type: compressedFile.type });
            setImageFile(newFile);

            if (imagePreview && imagePreview.startsWith('blob:')) {
                URL.revokeObjectURL(imagePreview);
            }
            setImagePreview(URL.createObjectURL(newFile));

        } catch (error) {
            console.error("Image compression failed:", error);
            setError("Image compression failed. Please try a different file.");
        }
    };

    const handleSave = async () => {
        const companyId = item?.companyId;

        if (!item || !item.id || !dbOperations || !companyId) {
            setError("Cannot save: Missing item, item ID, or company ID.");
            setIsSaving(false);
            return;
        }
        if (formData.unit === 'pkt' && (!formData.packetSize || Number(formData.packetSize) <= 0)) {
            setError("Please enter a valid quantity for the Packet.");
            return;
        }

        setIsSaving(true);
        setError(null);
        setUploadProgress(null);

        try {
            let newImageUrl = formData.imageUrl || null;

            if (imageFile) {
                if (!storage) throw new Error("Firebase Storage is not initialized.");

                const storagePath = `companies/${companyId}/items/${item.id}/${Date.now()}_${imageFile.name}`;
                const storageRef = ref(storage, storagePath);
                const uploadTask = uploadBytesResumable(storageRef, imageFile);

                await new Promise<void>((resolve, reject) => {
                    uploadTask.on(
                        'state_changed',
                        (snapshot) => {
                            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                            setUploadProgress(progress);
                        },
                        (error) => {
                            console.error("Upload failed:", error);
                            reject(new Error("Image upload failed. Please check network and security rules."));
                        },
                        async () => {
                            newImageUrl = await getDownloadURL(uploadTask.snapshot.ref);
                            setUploadProgress(null);
                            resolve();
                        }
                    );
                });
            }

            let currentMultiplier = 1;
            if (formData.unit === 'box') currentMultiplier = 10;
            if (formData.unit === 'doz') currentMultiplier = 12;
            if (formData.unit === 'qt') currentMultiplier = 100;
            if (formData.unit === 'ton') currentMultiplier = 1000;
            if (formData.unit === 'pkt') currentMultiplier = parseInt(String(formData.packetSize), 10) || 1;

            // Change ItemUpdatePayload to 'any' to bypass the strict TypeScript error
            const dataToUpdate: any = {
                name: String(formData.name || ''),
                mrp: Number(formData.mrp || 0),
                salesPrice: Number(formData.salesPrice || 0),
                purchasePrice: Number(formData.purchasePrice || 0),
                purchasediscount: Number(formData.purchasediscount || 0),
                stock: Number(formData.stock ?? (formData as any).Stock ?? 0),
                tax: Number(formData.tax || 0),
                taxRate: Number(formData.tax || 0),
                hsnSac: String(formData.hsnSac || ''),
                discount: Number(formData.discount || 0),
                itemGroupId: String(formData.itemGroupId || ''),
                barcode: String(formData.barcode || ''),
                isListed: formData.isListed ?? false,
                imageUrl: newImageUrl,
                description: String(formData.description || ''),
                unit: String(formData.unit || ''),
                unitMultiplier: currentMultiplier,
                // Pass null to Firebase if not a packet, it safely clears the field
                packetSize: formData.unit === 'pkt' ? parseInt(String(formData.packetSize), 10) : null,
            };

            await dbOperations.updateItem(item.id, dataToUpdate);

            const dataForLocalState: Partial<Item> = {
                ...dataToUpdate,
                companyId: companyId,
                updatedAt: undefined
            };

            onSaveSuccess(dataForLocalState);
            onClose();

        } catch (err: any) {
            console.error("Failed to save item:", err);
            setError(err.message || "Failed to save changes. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };

    const drawerClasses = isOpen
        ? 'translate-y-0 opacity-100'
        : 'translate-y-full opacity-0 pointer-events-none';
    const overlayClasses = isOpen
        ? 'opacity-100 bg-black/60'
        : 'opacity-0 bg-transparent pointer-events-none';

    return (
        <div
            className={`fixed inset-0 z-1000 flex justify-center items-end transition-opacity duration-300 ease-in-out ${overlayClasses}`}
            onClick={onClose}
        >
            <div
                className={`bg-white rounded-t-lg shadow-xl w-full max-w-md h-[80vh] flex flex-col transform transition-all duration-300 ease-in-out ${drawerClasses}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-4 text-center relative border-b">
                    <div className="absolute left-1/2 top-2 -translate-x-1/2">
                        <div className="w-12 h-1.5 bg-gray-300 rounded-full"></div>
                    </div>
                    <h2 className="text-lg font-semibold leading-none tracking-tight pt-4">
                        Edit Item
                    </h2>
                    <p className="text-sm mt-1 text-gray-500">
                        {item?.name || 'Item details'}
                    </p>
                    <button
                        onClick={onClose}
                        className="absolute right-3 top-3 rounded-sm p-1 text-gray-500 hover:bg-gray-100 opacity-70"
                        aria-label="Close"
                    >
                        <FiX size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {isFetching ? (
                        <div className="flex flex-col items-center justify-center h-40 space-y-2">
                            <Spinner />
                            <p className="text-gray-500 text-sm">Loading latest details...</p>
                        </div>
                    ) : (
                        <>
                            {error && <p className="text-red-600 bg-red-100 p-3 rounded text-sm">{error}</p>}

                            <div>
                                <label className="text-sm font-medium leading-none mb-1 block">Item Image</label>

                                <ImagePreview imageUrl={imagePreview} alt={formData.name || "Item Preview"} />

                                {/* CAMERA INPUT (HIDDEN) */}
                                <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    onChange={handleFileChange}
                                    ref={cameraInputRef}
                                    className="hidden"
                                />

                                <div className='flex'>
                                    <input
                                        type="file"
                                        accept="image/png, image/jpeg"
                                        onChange={handleFileChange}
                                        className="mt-2 text-sm w-full file:mr-4 file:py-2 file:px-4 file:rounded-sm file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                        disabled={isSaving}
                                    />

                                    <button
                                        type="button"
                                        onClick={() => cameraInputRef.current?.click()}
                                        className="p-2 rounded bg-green-100 hover:bg-green-200 mt-2 cursor-pointer"
                                    >
                                        <FiCamera size={20} />
                                    </button>

                                </div>
                            </div>

                            <div>
                                <label htmlFor="edit-name" className="text-sm font-medium leading-none mb-1 block">Name</label>
                                <input
                                    ref={firstInputRef}
                                    type="text" id="edit-name" name="name"
                                    value={formData.name || ''} onChange={handleChange}
                                    className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    disabled={isSaving}
                                />
                            </div>


                            {/* --- Pricing Row --- */}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="edit-mrp" className="text-sm font-medium leading-none mb-1 block">MRP (₹)</label>
                                    <input
                                        type="number" id="edit-mrp" name="mrp" step="0.01"
                                        value={formData.mrp ?? ''}
                                        onChange={handleChange}
                                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        disabled={isSaving}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="edit-itemGroupId" className="text-sm font-medium leading-none mb-1 block">Category</label>
                                    {loadingGroups ? (
                                        <p className="text-xs text-gray-500">Loading categories...</p>
                                    ) : (
                                        <select
                                            id="edit-itemGroupId"
                                            name="itemGroupId"
                                            value={formData.itemGroupId || ''}
                                            onChange={handleChange}
                                            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                            disabled={isSaving}
                                        >
                                            <option value="" disabled>Select a category</option>
                                            {itemGroups.map((group) => (
                                                <option key={group.id} value={group.id}>
                                                    {group.name}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                                <div>
                                    <label htmlFor="edit-salesPrice" className="text-sm font-medium leading-none mb-1 block">Sales Price (₹)</label>
                                    <input
                                        type="number" id="edit-salesPrice" name="salesPrice" step="0.01"
                                        value={formData.salesPrice ?? ''}
                                        onChange={handleChange}
                                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        disabled={isSaving}
                                        placeholder="Optional"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="edit-purchasePrice" className="text-sm font-medium leading-none mb-1 block">Purchase (₹)</label>
                                    <input
                                        type="number" id="edit-purchasePrice" name="purchasePrice" step="0.01"
                                        value={formData.purchasePrice ?? ''}
                                        onChange={handleChange}
                                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        disabled={isSaving}
                                    />
                                </div>

                            </div>

                            {/* --- Purchase & Stock Row --- */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="edit-discount" className="text-sm font-medium leading-none mb-1 block">Sale Disc (%)</label>
                                    <input
                                        type="number" id="edit-discount" name="discount" step="0.01"
                                        value={formData.discount ?? ''}
                                        onChange={handleChange}
                                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        disabled={isSaving}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="edit-purchasediscount" className="text-sm font-medium leading-none mb-1 block">Purchase Disc (%)</label>
                                    <input
                                        type="number" id="edit-purchasediscount" name="purchasediscount" step="0.01"
                                        value={formData.purchasediscount ?? ''}
                                        onChange={handleChange}
                                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        disabled={isSaving}
                                    />
                                </div>
                            </div>

                            {/* --- Tax & HSN Row --- */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="edit-tax" className="text-sm font-medium leading-none mb-1 block">Tax (%)</label>
                                    <input
                                        type="number" id="edit-tax" name="tax" step="0.01"
                                        value={formData.tax ?? ''}
                                        onChange={handleChange}
                                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        disabled={isSaving}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="edit-hsnSac" className="text-sm font-medium leading-none mb-1 block">HSN Code</label>
                                    <input
                                        type="text" id="edit-hsnSac" name="hsnSac"
                                        value={formData.hsnSac || ''}
                                        onChange={handleChange}
                                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        disabled={isSaving}
                                        placeholder="e.g. 123456"
                                    />
                                </div>
                            </div>
                            <div>
                                <label htmlFor="edit-unit" className="text-sm font-medium leading-none mb-1 block">Unit</label>
                                <div className="flex gap-2">
                                    <select
                                        id="edit-unit"
                                        name="unit"
                                        value={formData.unit || ''}
                                        onChange={(e) => {
                                            handleChange(e);
                                            // Clear the packet size if they switch away from 'pkt'
                                            if (e.target.value !== 'pkt') {
                                                setFormData(prev => ({ ...prev, packetSize: undefined }));
                                            }
                                        }}
                                        className={`flex h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50 ${formData.unit === 'pkt' ? 'w-1/2' : 'w-full'}`}
                                        disabled={isSaving}
                                    >
                                        {UNIT_OPTIONS.map(u => (
                                            <option key={u.value} value={u.value} disabled={u.value === ''}>
                                                {u.label}
                                            </option>
                                        ))}
                                    </select>

                                    {formData.unit === 'pkt' && (
                                        <input
                                            type="number"
                                            name="packetSize"
                                            value={formData.packetSize ?? ''}
                                            onChange={handleChange}
                                            placeholder="Qty per pkt"
                                            className="flex h-10 w-1/2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                                            disabled={isSaving}
                                            min="1"
                                        />
                                    )}
                                </div>
                            </div>
                            {/* --- Discount & Barcode Row --- */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="edit-barcode" className="text-sm font-medium leading-none mb-1 block">Barcode</label>
                                    <input
                                        type="text" id="edit-barcode" name="barcode"
                                        value={formData.barcode || ''} onChange={handleChange}
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        disabled={isSaving}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="edit-stock" className="text-sm font-medium leading-none mb-1 block">Stock</label>
                                    <input
                                        type="number"
                                        id="edit-stock"
                                        name="stock"
                                        step="1"
                                        value={formData.stock ?? ''}
                                        onChange={handleChange}
                                        onWheel={(e) => (e.target as HTMLInputElement).blur()}  
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        disabled={isSaving}
                                    />
                                </div>
                            </div>
                            <div>
                                <label htmlFor="edit-description" className="text-sm font-medium leading-none mb-1 block">Description</label>
                                <input
                                    type="text" id="edit-description" name="description"
                                    value={formData.description || ''} onChange={handleChange}
                                    className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    disabled={isSaving}
                                />
                            </div>

                            <div className="flex items-center space-x-2 pt-2">
                                <input
                                    type="checkbox"
                                    id={`edit-isListed-${item?.id}`}
                                    name="isListed"
                                    checked={formData.isListed ?? false}
                                    onChange={handleChange}
                                    disabled={isSaving}
                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-sky-500 cursor-pointer"
                                />
                                <label
                                    htmlFor={`edit-isListed-${item?.id}`}
                                    className="text-sm font-medium text-gray-700 select-none cursor-pointer"
                                >
                                    List this item on Ordering Page
                                </label>
                            </div>
                        </>
                    )}
                    <div className="border-t p-4 flex gap-3 bg-white md:sticky md:bottom-0">
                        <button
                            onClick={handleSave}
                            disabled={isSaving || isFetching}
                            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-sky-500 text-white hover:bg-gray-800 h-10 px-4 py-2 flex-1 gap-2 disabled:bg-gray-400"
                        >
                            {isSaving ? <Spinner /> : <FiSave size={16} />}
                            {isSaving ? (uploadProgress !== null ? 'Uploading...' : 'Saving...') : 'Save Changes'}
                        </button>
                        <button
                            onClick={onClose}
                            disabled={isSaving}
                            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-gray-300 bg-white hover:bg-gray-100 hover:text-gray-900 h-10 px-4 py-2 flex-1"
                        >
                            Cancel
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
};