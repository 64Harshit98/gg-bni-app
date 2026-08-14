import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Item, ItemGroup } from '../constants/models';
import { useDatabase } from '../context/auth-context';
import { doc, getDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db, storage } from '../lib/Firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { FiSave, FiX, FiPackage, FiCamera } from 'react-icons/fi';
import { Spinner } from '../constants/Spinner';
import imageCompression from 'browser-image-compression';
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import ShowWrapper from '../context/ShowWrapper';
import { Permissions, State } from '../enums';
import { Modal } from '../constants/Modal';
import { VariantPicker } from './VariantPicker';

interface ItemEditDrawerProps {
    item: Item | null;
    isOpen: boolean;
    onClose: () => void;
    onSaveSuccess: (updatedItem: Partial<Item>) => void;
    itemGroupRoute?: string;
}

// Brought over the formatImageUrl function from ItemAdd to ensure Drive/Dropbox links work seamlessly
const formatImageUrl = (url: string | null | undefined): string | null => {
    if (!url) return null;
    let cleanUrl = url.trim();

    if (cleanUrl.includes('drive.google.com')) {
        let fileId = null;
        const matchFileD = cleanUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);

        if (matchFileD) {
            fileId = matchFileD[1];
        } else {
            const matchIdParam = cleanUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
            if (matchIdParam) fileId = matchIdParam[1];
        }

        if (fileId) {
            return `https://lh3.googleusercontent.com/d/$${fileId}`;
        }
    }

    if (cleanUrl.includes('dropbox.com')) {
        return cleanUrl.replace('dl=0', 'raw=1').replace('www.dropbox.com', 'dl.dropboxusercontent.com');
    }

    return cleanUrl;
};

const ImagePreview: React.FC<{ imageUrl: string | null; alt: string }> = ({ imageUrl, alt }) => {
    if (!imageUrl) {
        return (
            <div className="w-full h-40 bg-gray-200 rounded-sm flex items-center justify-center text-gray-400">
                <FiPackage size={40} />
            </div>
        );
    }
    return (
        <img
            src={imageUrl}
            alt={alt}
            className="w-full h-40 object-cover rounded-sm border border-gray-300"
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

export const ItemEditDrawer: React.FC<ItemEditDrawerProps> = ({ item, isOpen, onClose, onSaveSuccess, itemGroupRoute = '/item-group' }) => {
    const navigate = useNavigate();
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null); // Added ref for the standard file input
    const dbOperations = useDatabase();
    const [formData, setFormData] = useState<Partial<Item>>({});
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [isFetching, setIsFetching] = useState(false);

    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
    const firstInputRef = useRef<HTMLInputElement>(null);
    const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
    const [_loadingGroups, setLoadingGroups] = useState(false);

    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);
    const [unitChangeWarning, setUnitChangeWarning] = useState(false);
    const [variantIds, setVariantIds] = useState<string[]>([]);
    const [allItemsForVariants, setAllItemsForVariants] = useState<any[]>([]);
    const [showCropModal, setShowCropModal] = useState(false);
    const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
    const [crop, setCrop] = useState<Crop>();
    const [completedCrop, setCompletedCrop] = useState<Crop | null>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const pendingRawFile = useRef<File | null>(null);

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
        const loadAllItems = async () => {
            if (isOpen && dbOperations) {
                try {
                    const items = await dbOperations.syncItems();
                    setAllItemsForVariants(items || []);
                } catch (e) {
                    console.error("Failed to load items for variant picker", e);
                }
            }
        };
        loadAllItems();
    }, [isOpen, dbOperations]);

    useEffect(() => {
        const fetchLiveItemData = async () => {
            if (isOpen && item && item.id && item.companyId) {
                setIsFetching(true);
                setModal(null);

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
                        unit: liveData.unit || '',
                        packetSize: (liveData as any).packetSize ?? undefined,
                        moq: (liveData as any).moq ?? 1,
                    });

                    const rawVariants: string[] = (liveData as any).variants || [];
                    const visited = new Set<string>([item.id!]);
                    const fullGroupSet = new Set<string>();
                    const queue: string[] = [...rawVariants];

                    allItemsForVariants.forEach((candidate: any) => {
                        const candidateVariants: string[] = candidate.variants || [];
                        if (
                            candidate.id &&
                            candidate.id !== item.id &&
                            candidateVariants.map(String).includes(String(item.id))
                        ) {
                            if (!visited.has(String(candidate.id))) {
                                queue.push(String(candidate.id));
                            }
                        }
                    });

                    if (queue.length > 0 && item.companyId) {
                        while (queue.length > 0) {
                            const batch = queue.splice(0, queue.length);
                            await Promise.all(batch.map(async (vid: string) => {
                                if (visited.has(vid)) return;
                                visited.add(vid);

                                try {
                                    const vRef = doc(db, 'companies', item.companyId!, 'items', vid);
                                    const vSnap = await getDoc(vRef);
                                    if (!vSnap.exists()) return;

                                    fullGroupSet.add(vid);

                                    const vVariants: string[] = vSnap.data().variants || [];
                                    vVariants.forEach((id: string) => {
                                        if (!visited.has(id)) queue.push(id);
                                    });

                                    allItemsForVariants.forEach((candidate: any) => {
                                        const candidateVariants: string[] = (candidate.variants || []).map(String);
                                        if (
                                            candidate.id &&
                                            !visited.has(String(candidate.id)) &&
                                            candidateVariants.includes(vid)
                                        ) {
                                            queue.push(String(candidate.id));
                                        }
                                    });
                                } catch (e) {
                                    console.error("Failed to fetch variant doc", vid, e);
                                }
                            }));
                        }
                    }

                    setVariantIds(Array.from(fullGroupSet));
                    setImagePreview(liveData.imageUrl || null);
                    setImageFile(null);
                    setUploadProgress(null);
                    const existingIds: string[] = liveData.itemGroupIds as string[] ||
                        (liveData.itemGroupId ? [liveData.itemGroupId as string] : []);
                    setSelectedCategories(existingIds);
                    setTimeout(() => {
                        firstInputRef.current?.focus();
                    }, 100);

                } catch (err) {
                    console.error("Error fetching live item data:", err);
                    setModal({ message: "Failed to load latest item details.", type: State.ERROR });
                } finally {
                    setIsFetching(false);
                }

            } else if (!isOpen) {
                setFormData({});
                setModal(null);
                setIsSaving(false);
                setImageFile(null);
                setImagePreview(null);
                setUploadProgress(null);
                setUnitChangeWarning(false);
                setSelectedCategories([]);
                setShowCategoryDropdown(false);
                setVariantIds([]);
            }
        };

        fetchLiveItemData();
    }, [isOpen, item]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const isCheckbox = type === 'checkbox';
        const checked = (e.target as HTMLInputElement).checked;

        const isNumericField = ['stock', 'tax', 'packetSize', 'moq'].includes(name);

        setFormData(prev => ({
            ...prev,
            [name]: isCheckbox
                ? checked
                : (value === '' && isNumericField ? '' : (isNumericField ? parseFloat(value) : value))
        }));
    };

    const getCroppedBlob = (image: HTMLImageElement, crop: Crop): Promise<Blob> => {
        const canvas = document.createElement('canvas');
        const scaleX = image.naturalWidth / image.width;
        const scaleY = image.naturalHeight / image.height;
        canvas.width = crop.width;
        canvas.height = crop.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(
            image,
            crop.x * scaleX, crop.y * scaleY,
            crop.width * scaleX, crop.height * scaleY,
            0, 0,
            crop.width, crop.height
        );
        return new Promise((resolve, reject) => {
            canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas is empty')), 'image/jpeg', 0.95);
        });
    };

    const applyCompression = async (file: File) => {
        setModal(null);
        setUploadProgress(null);
        const options = { maxSizeMB: 0.05, maxWidthOrHeight: 1920, useWebWorker: true };
        try {
            const compressedFile = await imageCompression(file, options);
            const newFile = new File([compressedFile], compressedFile.name || file.name, { type: compressedFile.type });
            setImageFile(newFile);
            if (imagePreview && imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
            setImagePreview(URL.createObjectURL(newFile));
        } catch (error) {
            console.error("Image compression failed:", error);
            setModal({ message: "Image compression failed. Please try a different file.", type: State.ERROR });
        }
    };

    const handleImageLoaded = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const { width, height } = e.currentTarget;
        const centeredCrop = centerCrop(
            makeAspectCrop({ unit: '%', width: 80 }, 1, width, height),
            width, height
        );
        setCrop(centeredCrop);
    };

    const handleCropConfirm = async () => {
        if (!imgRef.current || !completedCrop || completedCrop.width === 0 || completedCrop.height === 0) {
            if (pendingRawFile.current) await applyCompression(pendingRawFile.current);
            setShowCropModal(false);
            return;
        }
        try {
            const croppedBlob = await getCroppedBlob(imgRef.current, completedCrop);
            const croppedFile = new File([croppedBlob], pendingRawFile.current?.name || 'cropped.jpg', { type: 'image/jpeg' });
            await applyCompression(croppedFile);
        } catch {
            setModal({ message: 'Failed to crop image.', type: State.ERROR });
        } finally {
            setShowCropModal(false);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const objectUrl = URL.createObjectURL(file);
        pendingRawFile.current = file;
        setRawImageSrc(objectUrl);
        setCrop(undefined);
        setCompletedCrop(null);
        setShowCropModal(true);
    };

    const handleSave = async () => {
        const companyId = item?.companyId;

        if (!item || !item.id || !dbOperations || !companyId) {
            setModal({ message: "Cannot save: Missing item, item ID, or company ID.", type: State.ERROR });
            setIsSaving(false);
            return;
        }

        const currentMRP = Number(formData.mrp || 0);
        const currentSalesPrice = Number(formData.salesPrice || 0);

        if (currentMRP === 0 && currentSalesPrice === 0) {
            setModal({ message: "Both MRP and Sales Price cannot be 0. Please enter at least one.", type: State.ERROR });
            setIsSaving(false);
            return;
        }

        if (formData.unit === 'pkt' && (!formData.packetSize || Number(formData.packetSize) <= 0)) {
            setModal({ message: "Please enter a valid quantity for the Packet.", type: State.ERROR });
            return;
        }
        const newBarcode = String(formData.barcode || '').trim();
        const oldBarcode = String((item as any).barcode || '').trim();

        if (!newBarcode) {
            setModal({ message: "Barcode is required and cannot be empty.", type: State.ERROR });
            return;
        }
        setIsSaving(true);
        setModal(null);
        setUploadProgress(null);

        try {
            // --- DUPLICATE BARCODE CHECK ---
            // Only check if the barcode was actually changed, to avoid unnecessary reads
            if (newBarcode !== oldBarcode) {
                const itemsRef = collection(db, 'companies', companyId, 'items');
                const dupQuery = query(itemsRef, where('barcode', '==', newBarcode), limit(1));
                const dupSnapshot = await getDocs(dupQuery);

                if (!dupSnapshot.empty) {
                    const existingDoc = dupSnapshot.docs[0];
                    const existingData = existingDoc.data();
                    const isSameItem = existingDoc.id === item.id;
                    const isDeleted = existingData.isDeleted || existingData.deleted;

                    if (!isSameItem && !isDeleted) {
                        setModal({ message: `Barcode ${newBarcode} already exists on another item.`, type: State.ERROR });
                        setIsSaving(false);
                        return;
                    }
                }
            }

            // Apply formatting logic in case user pasted a raw Drive/Dropbox link
            let newImageUrl = formData.imageUrl ? formatImageUrl(formData.imageUrl) : null;

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
                            setModal({ message: "Image upload failed. Please check network and security rules.", type: State.ERROR });
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
                itemGroupId: selectedCategories[0] || '',
                itemGroupIds: selectedCategories,
                barcode: String(formData.barcode || ''),
                isListed: formData.isListed ?? false,
                imageUrl: newImageUrl,
                description: String(formData.description || ''),
                unit: String(formData.unit || ''),
                unitMultiplier: currentMultiplier,
                packetSize: formData.unit === 'pkt' ? parseInt(String(formData.packetSize), 10) : null,
                moq: Number(formData.moq || 1),
                variants: variantIds,
            };

            await dbOperations.updateItem(item.id, dataToUpdate);

            const previousVariantIds: string[] = (item as any).variants || [];
            const allVariantIds = Array.from(new Set([...variantIds, ...previousVariantIds]));
            const fullGroup = Array.from(new Set([item.id, ...variantIds]));

            for (const variantId of allVariantIds) {
                if (variantId === item.id) continue;

                const variantRef = doc(db, 'companies', companyId, 'items', variantId);
                const variantSnap = await getDoc(variantRef);
                if (!variantSnap.exists()) continue;

                const variantData = variantSnap.data();
                const existingVariants: string[] = variantData.variants || [];

                let updatedVariants: string[];

                if (variantIds.includes(variantId)) {
                    const groupForThisVariant = fullGroup.filter(id => id !== variantId);
                    updatedVariants = groupForThisVariant;
                } else {
                    updatedVariants = existingVariants.filter(id => !fullGroup.includes(id));
                }

                await dbOperations.updateItem(variantId, { variants: updatedVariants });
            }
            const dataForLocalState: Partial<Item> = {
                ...dataToUpdate,
                companyId: companyId,
                updatedAt: undefined
            };

            onSaveSuccess(dataForLocalState);
            onClose();

        } catch (err: any) {
            console.error("Failed to save item:", err);
            setModal({ message: err.message || "Failed to save changes. Please try again.", type: State.ERROR });
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

    const getUnitLabel = () => {
        if (formData.unit === 'box') return '10 pcs';
        if (formData.unit === 'doz') return '12 pcs';
        if (formData.unit === 'qt') return '100 pcs';
        if (formData.unit === 'ton') return '1000 pcs';
        if (formData.unit === 'pkt') return `${formData.packetSize || 1} pcs`;
        return '1 pcs';
    };

    return (
        <div
            className={`fixed inset-0 z-1000 flex justify-center items-end transition-opacity duration-300 ease-in-out ${overlayClasses}`}
            onClick={onClose}
        >
            <div
                className={`bg-white rounded-t-lg shadow-xl w-full max-w-md h-[80vh] flex flex-col transform transition-all duration-300 ease-in-out ${drawerClasses}`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* CROP MODAL */}
                {showCropModal && rawImageSrc && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 rounded-t-lg px-4">
                        <div className="bg-white rounded-lg shadow-xl w-full p-4 flex flex-col gap-3">
                            <h3 className="text-base font-bold text-gray-800">Crop Image</h3>
                            <p className="text-xs text-gray-500">Drag to select crop area. Tap <strong>Use Full Image</strong> to skip.</p>
                            <div className="flex justify-center overflow-hidden" style={{ maxHeight: 'calc(80vh - 180px)' }}>
                                <ReactCrop
                                    crop={crop}
                                    onChange={(c) => setCrop(c)}
                                    onComplete={(c) => setCompletedCrop(c)}
                                    aspect={undefined}
                                >
                                    <img
                                        ref={imgRef}
                                        src={rawImageSrc}
                                        alt="Crop preview"
                                        onLoad={handleImageLoaded}
                                        className="max-w-full object-contain"
                                        style={{ maxHeight: 'calc(80vh - 180px)', maxWidth: '100%', width: '100%' }}
                                    />
                                </ReactCrop>
                            </div>
                            <div className="flex justify-end gap-2 mt-1">
                                <button
                                    onClick={() => {
                                        setShowCropModal(false);
                                        pendingRawFile.current = null;
                                        if (cameraInputRef.current) cameraInputRef.current.value = '';
                                        if (fileInputRef.current) fileInputRef.current.value = '';
                                    }}
                                    className="px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 rounded-sm hover:bg-gray-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={async () => { if (pendingRawFile.current) await applyCompression(pendingRawFile.current); setShowCropModal(false); }}
                                    className="px-3 py-2 text-xs font-medium text-gray-700 bg-gray-200 rounded-sm hover:bg-gray-300"
                                >
                                    Use Full Image
                                </button>
                                <button
                                    onClick={handleCropConfirm}
                                    className="px-4 py-2 text-xs font-bold text-white bg-sky-500 rounded-sm hover:bg-sky-600"
                                >
                                    Crop & Use
                                </button>
                            </div>
                        </div>
                    </div>
                )}

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
                            {modal && (
                                <div onClick={(e) => e.stopPropagation()}>
                                    <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />
                                </div>
                            )}
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

                                <div className='flex items-center gap-2'>
                                    <input
                                        type="file"
                                        accept="image/png, image/jpeg"
                                        onChange={handleFileChange}
                                        ref={fileInputRef}
                                        className="mt-2 text-sm w-full file:mr-4 file:py-2 file:px-4 file:rounded-sm file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                        disabled={isSaving}
                                    />

                                    <button
                                        type="button"
                                        onClick={() => cameraInputRef.current?.click()}
                                        className="p-2 rounded bg-green-100 hover:bg-green-200 mt-2 cursor-pointer shrink-0"
                                    >
                                        <FiCamera size={20} />
                                    </button>
                                </div>

                                {/* NEW URL INPUT SECTION */}
                                <div className="mt-4">
                                    <label className="text-sm font-medium leading-none mb-1 block">Or paste Image URL</label>
                                    <input
                                        type="text"
                                        name="imageUrl"
                                        value={formData.imageUrl || ''}
                                        onChange={(e) => {
                                            const url = e.target.value;
                                            setFormData(prev => ({ ...prev, imageUrl: url }));
                                            if (!imageFile) {
                                                setImagePreview(url);
                                            }
                                        }}
                                        disabled={!!imageFile || isSaving}
                                        className="flex h-10 w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        placeholder="https://example.com/image.jpg"
                                    />
                                </div>

                                {/* OPTION TO REMOVE LOCAL FILE IF SELECTED */}
                                {imageFile && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setImageFile(null);
                                            setImagePreview(formData.imageUrl || null);
                                            if (cameraInputRef.current) cameraInputRef.current.value = '';
                                            if (fileInputRef.current) fileInputRef.current.value = '';
                                        }}
                                        className="text-xs text-red-500 hover:underline mt-2 block"
                                    >
                                        Remove Selected File
                                    </button>
                                )}
                            </div>

                            <div>
                                <label htmlFor="edit-name" className="text-sm font-medium leading-none mb-1 block">Name</label>
                                <input
                                    ref={firstInputRef}
                                    type="text" id="edit-name" name="name"
                                    value={formData.name || ''} onChange={handleChange}
                                    className="flex h-10 w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    disabled={isSaving}
                                />
                            </div>

                            {/* --- Pricing Row --- */}

                            <div className="grid grid-cols-2 gap-4">
                                {/* --- MRP --- */}
                                <div>
                                    <label className="text-sm font-medium mb-1 block">
                                        {`MRP (for ${getUnitLabel()})`}
                                    </label>
                                    <input
                                        type="number"
                                        name="mrp"
                                        value={formData.mrp ?? ''}
                                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                        onChange={handleChange}
                                        className="flex h-10 w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="edit-barcode" className="text-sm font-medium mb-1 block">Barcode</label>
                                    <input
                                        type="text" id="edit-barcode" name="barcode"
                                        value={formData.barcode || ''} onChange={handleChange}
                                        className="flex h-10 w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        disabled={isSaving}
                                    />
                                </div>

                                {/* --- Sales Price --- */}
                                <div>
                                    <label className="text-sm font-medium mb-1 block">
                                        {`Sales Price (for ${getUnitLabel()})`}
                                    </label>
                                    <input
                                        type="number"
                                        name="salesPrice"
                                        value={formData.salesPrice ?? ''}
                                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                        onChange={handleChange}
                                        className="flex h-10 w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    />
                                </div>

                                {/* --- Purchase Price --- */}
                                <div>
                                    <label className="text-sm font-medium mb-1 block">Purchase Price (₹)</label>
                                    <input
                                        type="number"
                                        name="purchasePrice"
                                        value={formData.purchasePrice ?? ''}
                                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                        onChange={handleChange}
                                        className="flex h-10 w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    />
                                </div>
                            </div>

                            {/* --- Purchase & Stock Row --- */}
                            <div className="grid grid-cols-2 gap-4">
                                {/* --- Sale Disc (%) --- */}
                                <div>
                                    <label htmlFor="edit-discount" className="text-sm font-medium leading-none mb-1 block">Sale Disc (%)</label>
                                    <input
                                        type="number" id="edit-discount" name="discount" step="0.01"
                                        value={formData.discount ?? ''}
                                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                        onChange={handleChange}
                                        className="flex h-10 w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        disabled={isSaving}
                                    />
                                </div>
                                {/* --- Purchase Disc (%) --- */}
                                <div>
                                    <label htmlFor="edit-purchasediscount" className="text-sm font-medium leading-none mb-1 block">Purchase Disc (%)</label>
                                    <input
                                        type="number" id="edit-purchasediscount" name="purchasediscount" step="0.01"
                                        value={formData.purchasediscount ?? ''}
                                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                        onChange={handleChange}
                                        className="flex h-10 w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
                                        className="flex h-10 w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
                                        className="flex h-10 w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        disabled={isSaving}
                                        placeholder="e.g. 123456"
                                    />
                                </div>
                            </div>
                            {unitChangeWarning && (
                                <div className="mb-2 flex items-start gap-2 rounded-sm border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
                                    <span>⚠️</span>
                                    <span>Unit changed — MRP and Sales Price are still the same values. Please review and update them for the new unit.</span>
                                    <button onClick={() => setUnitChangeWarning(false)} className="ml-auto text-yellow-600 hover:text-yellow-900">
                                        <FiX size={14} />
                                    </button>
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium leading-none mb-1 block">MOQ</label>
                                    <input
                                        type="number"
                                        name="moq"
                                        value={formData.moq ?? ''}
                                        onChange={handleChange}
                                        className="flex h-10 w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        disabled={isSaving}
                                    />
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
                                                if (e.target.value !== 'pkt') {
                                                    setFormData(prev => ({ ...prev, packetSize: undefined }));
                                                }
                                                if (e.target.value && e.target.value !== '') {
                                                    setUnitChangeWarning(true);
                                                }
                                            }}
                                            className={`flex h-10 rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50 ${formData.unit === 'pkt' ? 'w-1/2' : 'w-full'}`}
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
                                                className="flex h-10 w-1/2 rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                                                disabled={isSaving}
                                                min="1"
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>
                            {/* --- Stock & Description Row --- */}
                            <div className="grid grid-cols-2 gap-4">

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
                                        className="flex h-10 w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        disabled={isSaving}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="edit-description" className="text-sm font-medium leading-none mb-1 block">Description</label>
                                    <input
                                        type="text" id="edit-description" name="description"
                                        value={formData.description || ''} onChange={handleChange}
                                        className="flex h-10 w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        disabled={isSaving}
                                    />
                                </div>
                            </div>

                            {/* --- Category --- */}
                            <div>
                                <label className="text-sm font-medium mb-1 block">Category</label>

                                {/* Primary category dropdown */}
                                <select
                                    value={selectedCategories[0] || ''}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === 'ADD_NEW_GROUP') {
                                            onClose();
                                            navigate(itemGroupRoute);
                                            return;
                                        }
                                        setSelectedCategories(prev => {
                                            const rest = prev.slice(1);
                                            return val ? [val, ...rest] : rest;
                                        });
                                    }}
                                    disabled={isSaving}
                                    className="flex h-10 w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <option value="ADD_NEW_GROUP" className="font-semibold bg-gray-100">+ Add New Group</option>
                                    <option value="">Uncategorized</option>
                                    {itemGroups.map((group) => (
                                        <option key={group.id} value={group.id}>
                                            {group.name}
                                        </option>
                                    ))}
                                </select>

                                {/* Extra category chips */}
                                {selectedCategories.length > 1 && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {selectedCategories.slice(1).map((catId) => {
                                            const group = itemGroups.find(g => g.id === catId);
                                            if (!group) return null;
                                            return (
                                                <span key={catId} className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-700 text-xs px-2 py-1 rounded-full">
                                                    {group.name}
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedCategories(prev => prev.filter(id => id !== catId))}
                                                        className="ml-1 text-blue-400 hover:text-red-500 font-bold leading-none"
                                                    >×</button>
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Add more category */}
                                {!showCategoryDropdown ? (
                                    <button
                                        type="button"
                                        onClick={() => setShowCategoryDropdown(true)}
                                        className="mt-2 text-sm text-sky-500 hover:underline"
                                    >
                                        + Add more category
                                    </button>
                                ) : (
                                    <div className="mt-2 flex gap-2 items-center">
                                        <select
                                            defaultValue=""
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                if (!val) return;
                                                if (val === 'ADD_NEW_GROUP') {
                                                    onClose();
                                                    navigate(itemGroupRoute);
                                                    return;
                                                }
                                                if (!selectedCategories.includes(val)) {
                                                    setSelectedCategories(prev => [...prev, val]);
                                                }
                                                setShowCategoryDropdown(false);
                                            }}
                                            className="flex-1 min-w-0 h-10 rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                                            disabled={isSaving}
                                        >
                                            <option value="ADD_NEW_GROUP" className="font-semibold bg-gray-100">+ Add New Group</option>
                                            {/* <option value="">Add more</option> */}
                                            {itemGroups
                                                .filter(g => !selectedCategories.includes(g.id!))
                                                .map(g => (
                                                    <option key={g.id} value={g.id!}>{g.name}</option>
                                                ))}
                                        </select>
                                        <button
                                            type="button"
                                            onClick={() => setShowCategoryDropdown(false)}
                                            className="text-xs text-gray-400 hover:text-gray-600"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="text-sm font-medium leading-none mb-1 block">Variants</label>
                                <VariantPicker
                                    allItems={allItemsForVariants}
                                    selectedIds={variantIds}
                                    currentItemBarcode={formData.barcode || ''}
                                    onChange={setVariantIds}
                                    activeTheme={{ text: 'text-sky-500', border: 'border-sky-500', primaryBg: 'bg-sky-500', focusRing: 'focus:ring-sky-500' } as any}
                                />
                            </div>
                            <ShowWrapper requiredPermission={Permissions.ViewCatalogue}>
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
                                        List this item on Catalog
                                    </label>
                                </div>
                            </ShowWrapper>
                        </>
                    )}
                    <div className="border-t p-4 flex gap-3 bg-white sticky bottom-0">
                        <button
                            onClick={handleSave}
                            disabled={isSaving || isFetching}
                            className="inline-flex items-center justify-center whitespace-nowrap rounded-sm text-sm font-medium ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-sky-500 text-white hover:bg-gray-800 h-10 px-4 py-2 flex-1 gap-2 disabled:bg-gray-400"
                        >
                            {isSaving ? <Spinner /> : <FiSave size={16} />}
                            {isSaving ? (uploadProgress !== null ? 'Uploading...' : 'Saving...') : 'Save Changes'}
                        </button>
                        <button
                            onClick={onClose}
                            disabled={isSaving}
                            className="inline-flex items-center justify-center whitespace-nowrap rounded-sm text-sm font-medium ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-gray-300 bg-white hover:bg-gray-100 hover:text-gray-900 h-10 px-4 py-2 flex-1"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};