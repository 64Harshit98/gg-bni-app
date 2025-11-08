import React, { useState, useEffect, useRef } from 'react';
import type { Item } from '../constants/models'; // Adjust path as needed
import { useDatabase } from '../context/auth-context'; // Adjust path as needed
import { FieldValue, Timestamp } from 'firebase/firestore';
import { storage } from '../lib/Firebase'; // <-- Make sure this path is correct
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { FiSave, FiX, FiPackage } from 'react-icons/fi';
import { Spinner } from '../constants/Spinner'; // Adjust path as needed

// --- ADD THIS IMPORT ---
import imageCompression from 'browser-image-compression';

// Interface for props
interface ItemEditDrawerProps {
    item: Item | null; // Item to edit (or null if none)
    isOpen: boolean;
    onClose: () => void;
    onSaveSuccess: (updatedItem: Partial<Item>) => void; // Callback with updated data
}

// Type for the update payload
type ItemUpdatePayload = Partial<Omit<Item, 'id' | 'createdAt' | 'companyId'>> & {
    updatedAt?: FieldValue | Timestamp | number | null;
    imageUrl?: string | null; // <-- FIX: Allow null
};
// --- Image preview component ---
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


export const ItemEditDrawer: React.FC<ItemEditDrawerProps> = ({ item, isOpen, onClose, onSaveSuccess }) => {
    const dbOperations = useDatabase();
    const [formData, setFormData] = useState<Partial<Item>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const firstInputRef = useRef<HTMLInputElement>(null);

    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);

    // Effect to populate form when item changes or drawer opens
    useEffect(() => {
        if (isOpen && item) {
            setFormData({
                name: item.name || '',
                mrp: item.mrp ?? undefined,
                purchasePrice: item.purchasePrice ?? undefined,
                stock: item.stock ?? undefined,
                itemGroupId: item.itemGroupId || '',
                barcode: item.barcode || '',
                tax: item.tax ?? undefined,
                discount: item.discount ?? undefined,
                isListed: item.isListed ?? false,
                imageUrl: item.imageUrl || '',
            });
            setImagePreview(item.imageUrl || null);
            setImageFile(null);
            setUploadProgress(null);
            setError(null);

            const timer = setTimeout(() => {
                firstInputRef.current?.focus();
            }, 100);
            return () => clearTimeout(timer);

        } else if (!isOpen) {
            // Clear form and state when closing
            setFormData({});
            setError(null);
            setIsSaving(false);
            setImageFile(null);
            setImagePreview(null);
            setUploadProgress(null);
        }
    }, [isOpen, item]);

    // Handle input changes
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const isCheckbox = type === 'checkbox';
        const checked = (e.target as HTMLInputElement).checked;
        const isNumericField = ['mrp', 'purchasePrice', 'stock', 'tax', 'discount'].includes(name);

        setFormData(prev => ({
            ...prev,
            [name]: isCheckbox
                ? checked
                : (value === '' && isNumericField ? '' : (isNumericField ? parseFloat(value) : value))
        }));
    };

    // --- THIS FUNCTION IS NOW ASYNC AND COMPRESSES THE IMAGE ---
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        console.log(`Original file size: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
        setError(null); // Clear previous errors

        // Compression options
        const options = {
            maxSizeMB: 5,       // Max size in MB
            maxWidthOrHeight: 1920, // Max dimensions
            useWebWorker: true,     // Use a web worker for better performance
        };

        try {
            // This line compresses the file in the browser
            const compressedFile = await imageCompression(file, options);

            console.log(`Compressed file size: ${(compressedFile.size / 1024 / 1024).toFixed(2)} MB`);

            // Now, you use the *compressed* file
            setImageFile(compressedFile);
            // Create a temporary local URL for preview
            if (imagePreview && imagePreview.startsWith('blob:')) {
                URL.revokeObjectURL(imagePreview); // Revoke old blob URL to prevent memory leaks
            }
            setImagePreview(URL.createObjectURL(compressedFile));

        } catch (error) {
            console.error("Image compression failed:", error);
            setError("Image compression failed. Please try a different file.");
        }
    };

    // Handle save action
    const handleSave = async () => {
        if (!item || !item.id || !dbOperations) return; // <-- Added check for dbOperations

        setIsSaving(true);
        setError(null);
        setUploadProgress(null);

        try {
            let newImageUrl = formData.imageUrl || null; // Will be '' or a URL, then becomes null or a URL

            // Step 1: Upload image if a new one is selected
            if (imageFile) {
                // The 'imageFile' is already the compressed version from handleFileChange
                const storageRef = ref(storage, `items/${item.id}/${Date.now()}_${imageFile.name}`);
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
                            reject(new Error("Image upload failed. Please try again."));
                        },
                        async () => {
                            newImageUrl = await getDownloadURL(uploadTask.snapshot.ref);
                            setUploadProgress(null);
                            resolve();
                        }
                    );
                });
            }

            // Step 2: Prepare data for Firestore
            const dataToUpdate: ItemUpdatePayload = {
                name: String(formData.name || ''),
                mrp: Number(formData.mrp || 0),
                purchasePrice: Number(formData.purchasePrice || 0),
                stock: Number(formData.stock || 0),
                tax: Number(formData.tax || 0),
                discount: Number(formData.discount || 0),
                itemGroupId: String(formData.itemGroupId || ''),
                barcode: String(formData.barcode || ''),
                isListed: formData.isListed ?? false,
                // --- THIS IS THE FIX ---
                // newImageUrl will be a URL string or null. Both are valid Firestore values.
                imageUrl: newImageUrl,
            };

            // Step 3: Update Firestore
            await dbOperations.updateItem(item.id, dataToUpdate);

            // Step 4: Update local state
            const dataForLocalState: Partial<Item> = {
                ...dataToUpdate,
                updatedAt: undefined // Remove serverTimestamp for local state
            };

            onSaveSuccess(dataForLocalState);
            onClose();

        } catch (err: any) {
            console.error("Failed to save item:", err); // This is line 210
            setError(err.message || "Failed to save changes. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };

    // --- CSS Transition Classes ---
    const drawerClasses = isOpen
        ? 'translate-y-0 opacity-100'
        : 'translate-y-full opacity-0 pointer-events-none';
    const overlayClasses = isOpen
        ? 'opacity-100 bg-black/60'
        : 'opacity-0 bg-transparent pointer-events-none';

    // --- Render ---
    return (
        <div
            className={`fixed inset-0 z-40 flex justify-center items-end transition-opacity duration-300 ease-in-out ${overlayClasses}`}
            onClick={onClose}
        >
            <div
                className={`bg-white rounded-t-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden transform transition-all duration-300 ease-in-out ${drawerClasses}`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 text-center relative border-b">
                    <div className="absolute left-1/2 top-2 -translate-x-1/2">
                        <div className="w-12 h-1.5 bg-gray-300 rounded-full"></div>
                    </div>
                    <h2 className="text-lg font-semibold leading-none tracking-tight pt-4">
                        Edit Item
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1 text-gray-500">
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

                {/* Scrollable Content Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {error && <p className="text-red-600 bg-red-100 p-3 rounded text-sm">{error}</p>}

                    {/* Image Upload Section */}
                    <div>
                        <label className="text-sm font-medium leading-none mb-1 block">Item Image</label>
                        <ImagePreview imageUrl={imagePreview} alt={formData.name || "Item Preview"} />
                        <input
                            type="file"
                            accept="image/png, image/jpeg"
                            onChange={handleFileChange}
                            className="mt-2 text-sm w-full file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                            disabled={isSaving}
                        />
                        {uploadProgress !== null && (
                            <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2 overflow-hidden">
                                <div
                                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                                    style={{ width: `${uploadProgress}%` }}
                                ></div>
                            </div>
                        )}
                        {isSaving && uploadProgress !== null && <p className="text-sm text-gray-600 mt-1">Uploading image...</p>}
                    </div>

                    {/* Form Fields */}
                    <div>
                        <label htmlFor="edit-name" className="text-sm font-medium leading-none mb-1 block">Name</label>
                        <input
                            ref={firstInputRef}
                            type="text" id="edit-name" name="name"
                            value={formData.name || ''} onChange={handleChange}
                            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isSaving}
                        />
                    </div>
                    <div>
                        <label htmlFor="edit-itemGroupId" className="text-sm font-medium leading-none mb-1 block">Category</label>
                        <input
                            type="text" id="edit-itemGroupId" name="itemGroupId"
                            value={formData.itemGroupId || ''} onChange={handleChange}
                            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="e.g., TY, DE"
                            disabled={isSaving}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="edit-mrp" className="text-sm font-medium leading-none mb-1 block">MRP (₹)</label>
                            <input
                                type="number" id="edit-mrp" name="mrp" step="0.01"
                                value={formData.mrp ?? ''}
                                onChange={handleChange}
                                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={isSaving}
                            />
                        </div>
                        <div>
                            <label htmlFor="edit-purchasePrice" className="text-sm font-medium leading-none mb-1 block">Purchase (₹)</label>
                            <input
                                type="number" id="edit-purchasePrice" name="purchasePrice" step="0.01"
                                value={formData.purchasePrice ?? ''}
                                onChange={handleChange}
                                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={isSaving}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="edit-stock" className="text-sm font-medium leading-none mb-1 block">Stock</label>
                            <input
                                type="number" id="edit-stock" name="stock" step="1"
                                value={formData.stock ?? ''}
                                onChange={handleChange}
                                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={isSaving}
                            />
                        </div>
                        <div>
                            <label htmlFor="edit-tax" className="text-sm font-medium leading-none mb-1 block">Tax (%)</label>
                            <input
                                type="number" id="edit-tax" name="tax" step="0.01"
                                value={formData.tax ?? ''}
                                onChange={handleChange}
                                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={isSaving}
                            />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="edit-discount" className="text-sm font-medium leading-none mb-1 block">Discount (%)</label>
                        <input
                            type="number" id="edit-discount" name="discount" step="0.01"
                            value={formData.discount ?? ''}
                            onChange={handleChange}
                            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isSaving}
                        />
                    </div>
                    <div>
                        <label htmlFor="edit-barcode" className="text-sm font-medium leading-none mb-1 block">Barcode</label>
                        <input
                            type="text" id="edit-barcode" name="barcode"
                            value={formData.barcode || ''} onChange={handleChange}
                            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <label
                            htmlFor={`edit-isListed-${item?.id}`}
                            className="text-sm font-medium text-gray-700 select-none cursor-pointer"
                        >
                            List this item on Ordering Page
                        </label>
                    </div>
                </div>

                {/* Footer with Actions */}
                <div className="mt-auto border-t p-4 flex gap-3">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-black text-white hover:bg-gray-800 h-10 px-4 py-2 flex-1 gap-2 disabled:bg-gray-400"
                    >
                        {isSaving ? <Spinner /> : <FiSave size={16} />}
                        {isSaving ? (uploadProgress !== null ? 'Uploading...' : 'Saving...') : 'Save Changes'}
                    </button>
                    <button
                        onClick={onClose}
                        disabled={isSaving}
                        className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-gray-300 bg-white hover:bg-gray-100 hover:text-gray-900 h-10 px-4 py-2 flex-1"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};