import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Item } from '../constants/models';
import { useAuth, useDatabase } from '../context/auth-context';
import { useCatalogueData } from '../context/CatalogueDataContext';
import { useItemSettings } from '../context/SettingsContext';
import { doc, getDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db, storage } from '../lib/Firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import {
    FiSave, FiX, FiPackage, FiCamera, FiUpload, FiTag, FiFileText, FiBox, FiGrid, FiAlertTriangle,
} from 'react-icons/fi';
import { Spinner } from '../constants/Spinner';
import imageCompression from 'browser-image-compression';
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import ShowWrapper from '../context/ShowWrapper';
import { Permissions, State } from '../enums';
import { Modal } from '../constants/Modal';
import { VariantPicker } from './VariantPicker';
import type { PriceTier, QuantitySlab, AddOnGroup } from '../constants/models';
import { validateQuantitySlabs, buildAddOnPicks } from '../constants/models';
import { useAddOnTemplates } from '../lib/addOnTemplates';

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
            return `https://lh3.googleusercontent.com/d/${fileId}`;
        }
    }

    if (cleanUrl.includes('dropbox.com')) {
        return cleanUrl.replace('dl=0', 'raw=1').replace('www.dropbox.com', 'dl.dropboxusercontent.com');
    }

    return cleanUrl;
};

/* ------------------------------------------------------------------ */
/*  UI-only helpers (SELLAR design system: Edit item drawer)           */
/* ------------------------------------------------------------------ */

// Shared control styles — border-control outline, 8px radius, brand-blue focus ring
const INPUT_CLS =
    'flex h-10 w-full min-w-0 rounded-lg border border-[#7a8aa3] bg-white px-3 text-sm text-[#0f172b] ' +
    'placeholder:text-[#5b6b86] focus-visible:outline-none focus-visible:border-[#155dfc] ' +
    'focus-visible:ring-2 focus-visible:ring-[#155dfc]/40 disabled:cursor-not-allowed disabled:opacity-45';
const INPUT_WARN_CLS = '!border-[#bb4d00]';
const SMALL_INPUT_CLS =
    'w-full h-9 rounded-lg border border-[#7a8aa3] bg-white px-2 py-1 text-sm text-[#0f172b] outline-none ' +
    'focus:border-[#155dfc] focus:ring-2 focus:ring-[#155dfc]/40 disabled:opacity-45';
const LABEL_CLS = 'text-xs font-medium text-[#45556c]';
const SMALL_LABEL_CLS = 'text-[10px] font-medium text-[#5b6b86] block mb-1';
const BTN_SECONDARY =
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[#7a8aa3] bg-white ' +
    'px-3 h-8 text-xs font-medium text-[#0f172b] hover:bg-[#f5f7ff] ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#155dfc] focus-visible:ring-offset-2 ' +
    'disabled:pointer-events-none disabled:opacity-45';

type Tone = 'blue' | 'green' | 'amber' | 'magenta';
const TONE_CLS: Record<Tone, string> = {
    blue: 'bg-[#e6eeff] text-[#155dfc]',
    green: 'bg-[#e9faef] text-[#008236]',
    amber: 'bg-[#fff3dd] text-[#bb4d00]',
    magenta: 'bg-[#ffe8f8] text-[#c4009a]',
};

const SectionCard: React.FC<{
    icon: React.ReactNode;
    tone?: Tone;
    title: string;
    hint?: string;
    children: React.ReactNode;
}> = ({ icon, tone = 'blue', title, hint, children }) => (
    <section className="rounded-xl border border-[#dfe6fb] bg-white shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)] overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#dfe6fb]">
            <span className={`grid h-8 w-8 place-items-center rounded-lg ${TONE_CLS[tone]}`}>{icon}</span>
            <b className="text-[15px] font-semibold text-[#0f172b]">{title}</b>
            {hint && <small className="ml-auto text-xs text-[#5b6b86]">{hint}</small>}
        </div>
        <div className="p-4">{children}</div>
    </section>
);

const FieldWrap: React.FC<{
    label: React.ReactNode;
    htmlFor?: string;
    hint?: string;
    warn?: string;
    className?: string;
    children: React.ReactNode;
}> = ({ label, htmlFor, hint, warn, className = '', children }) => (
    <div className={`grid gap-1 min-w-0 content-start ${className}`}>
        <label htmlFor={htmlFor} className={LABEL_CLS}>{label}</label>
        {children}
        {warn ? (
            <small className="flex items-start gap-1 text-[11px] leading-[15px] font-medium text-[#bb4d00]">
                <FiAlertTriangle size={12} className="mt-px shrink-0" />
                {warn}
            </small>
        ) : hint ? (
            <small className="text-[11px] leading-[15px] text-[#5b6b86]">{hint}</small>
        ) : null}
    </div>
);

const ImagePreview: React.FC<{ imageUrl: string | null; alt: string }> = ({ imageUrl, alt }) => {
    if (!imageUrl) {
        return (
            <div className="w-full h-[110px] md:h-44 bg-[#f5f7ff] flex items-center justify-center text-[#5b6b86] border-r md:border-r-0 md:border-b border-[#dfe6fb]">
                <FiPackage size={40} />
            </div>
        );
    }
    return (
        <img
            src={imageUrl}
            alt={alt}
            className="w-full h-[110px] md:h-44 object-cover block border-r md:border-r-0 md:border-b border-[#dfe6fb]"
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
    const { currentUser } = useAuth();
    const { itemSettings } = useItemSettings();
    const enablePriceTiers = !!itemSettings?.enablePriceTiers;
    const enableQuantitySlabs = !!itemSettings?.enableQuantitySlabs;
    const enableAddOns = !!(itemSettings as any)?.enableAddOns;
    const { templates: addOnTemplates, loaded: addOnsLoaded } =
        useAddOnTemplates(enableAddOns ? currentUser?.companyId : undefined);
    const [formData, setFormData] = useState<Partial<Item>>({});
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [isFetching, setIsFetching] = useState(false);

    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
    const firstInputRef = useRef<HTMLInputElement>(null);
    // Groups/items for the category picker + VariantPicker now come straight
    // from the shared CatalogueDataContext instead of this drawer re-fetching
    // them every time it opens (it's opened from many pages, many times).
    const { items: allItemsForVariants, itemGroups } = useCatalogueData();

    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);
    const [additionalImageFiles, setAdditionalImageFiles] = useState<File[]>([]);
    const [additionalImagePreviews, setAdditionalImagePreviews] = useState<string[]>([]);
    const [existingAdditionalUrls, setExistingAdditionalUrls] = useState<string[]>([]);
    const [unitChangeWarning, setUnitChangeWarning] = useState(false);
    const [variantIds, setVariantIds] = useState<string[]>([]);
    const [priceTiers, setPriceTiers] = useState<PriceTier[]>([]);
    const [quantitySlabs, setQuantitySlabs] = useState<QuantitySlab[]>([]);
    const [addOnGroupIds, setAddOnGroupIds] = useState<string[]>([]);
    // Older items saved their add-ons inside the item; kept working, removable here
    const [legacyAddOnGroups, setLegacyAddOnGroups] = useState<AddOnGroup[]>([]);
    // groupId -> option ids this item shows. Missing key = all options of the group
    const [addOnPick, setAddOnPick] = useState<Record<string, string[]>>({});
    const [addOnOpenId, setAddOnOpenId] = useState<string | null>(null);
    // groupId -> max choices for THIS item. Missing/0 = the group's own limit
    const [addOnLimit, setAddOnLimit] = useState<Record<string, number>>({});
    const toggleAddOnOption = (g: AddOnGroup, optionId: string) =>
        setAddOnPick(prev => {
            const cur = prev[g.id] ?? g.options.map(o => o.id);
            const next = cur.includes(optionId) ? cur.filter(id => id !== optionId) : [...cur, optionId];
            return next.length === 0 ? prev : { ...prev, [g.id]: next }; // at least one option stays checked
        });
    const selectAllAddOnOptions = (g: AddOnGroup) =>
        setAddOnPick(prev => ({ ...prev, [g.id]: g.options.map(o => o.id) }));
    const [showCropModal, setShowCropModal] = useState(false);
    const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
    const [crop, setCrop] = useState<Crop>();
    const [completedCrop, setCompletedCrop] = useState<Crop | null>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const pendingRawFile = useRef<File | null>(null);

    useEffect(() => {
        const fetchLiveItemData = async () => {
            const resolvedCompanyId = item?.companyId || currentUser?.companyId;
            if (isOpen && item && item.id && resolvedCompanyId) {
                setIsFetching(true);
                setModal(null);

                try {
                    const itemRef = doc(db, 'companies', resolvedCompanyId, 'items', item.id);
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

                    setPriceTiers((liveData as any).priceTiers || []);   // 👈 NEW
                    setQuantitySlabs(liveData.quantitySlabs || []);
                    setAddOnGroupIds(liveData.addOnGroupIds || []);
                    setLegacyAddOnGroups(liveData.addOnGroups || []);
                    setAddOnPick(Object.fromEntries((liveData.addOnPicks || []).filter(p => p.optionIds).map(p => [p.groupId, p.optionIds as string[]])));
                    setAddOnLimit(Object.fromEntries((liveData.addOnPicks || []).filter(p => Number(p.maxSelect) > 0).map(p => [p.groupId, Number(p.maxSelect)])));
                    setAddOnOpenId(null);

                    // NEW — existing additional photos (imageUrls minus the cover photo)
                    const savedImageUrls: string[] = (liveData as any).imageUrls || [];
                    setExistingAdditionalUrls(savedImageUrls.filter((u: string) => u && u !== liveData.imageUrl));
                    setAdditionalImageFiles([]);
                    setAdditionalImagePreviews([]);

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

                    if (queue.length > 0) {
                        while (queue.length > 0) {
                            const batch = queue.splice(0, queue.length);
                            await Promise.all(batch.map(async (vid: string) => {
                                if (visited.has(vid)) return;
                                visited.add(vid);

                                try {
                                    const vRef = doc(db, 'companies', resolvedCompanyId, 'items', vid);
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
                setPriceTiers([]);
                setQuantitySlabs([]);
                setAddOnGroupIds([]);
                setLegacyAddOnGroups([]);
                setAddOnPick({});
                setAddOnLimit({});
                setAddOnOpenId(null);
                setAdditionalImageFiles([]);
                setAdditionalImagePreviews([]);
                setExistingAdditionalUrls([]);
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

    const addPriceTier = () => {
        setPriceTiers(prev => [
            ...prev,
            {
                id: crypto.randomUUID(),
                label: '',
                quantity: 1,
                mrp: 0,
                salesPrice: 0,
                purchasePrice: 0,
                discount: 0,
                purchasediscount: 0,
                barcode: '',
            },
        ]);
    };

    const updatePriceTier = (id: string, field: keyof PriceTier, value: string | number) => {
        setPriceTiers(prev => prev.map(t => (t.id === id ? { ...t, [field]: value } : t)));
    };

    const removePriceTier = (id: string) => {
        setPriceTiers(prev => prev.filter(t => t.id !== id));
    };

    const addQuantitySlab = () => {
        setQuantitySlabs(prev => {
            const last = prev[prev.length - 1];
            const nextMin = prev.length === 0 ? 1 : (last.maxQty !== null ? last.maxQty + 1 : last.minQty + 1);
            return [...prev, { id: crypto.randomUUID(), minQty: nextMin, maxQty: null, salesPrice: 0 }];
        });
    };

    const updateQuantitySlab = (id: string, field: 'minQty' | 'maxQty' | 'salesPrice', raw: string) => {
        setQuantitySlabs(prev =>
            prev.map(s => {
                if (s.id !== id) return s;
                if (field === 'maxQty') return { ...s, maxQty: raw === '' ? null : (parseInt(raw, 10) || 0) };
                if (field === 'minQty') return { ...s, minQty: parseInt(raw, 10) || 0 };
                return { ...s, salesPrice: parseFloat(raw) || 0 };
            })
        );
    };

    const removeQuantitySlab = (id: string) => {
        setQuantitySlabs(prev => prev.filter(s => s.id !== id));
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
    const handleAdditionalFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        try {
            const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1024, useWebWorker: true };
            const compressed = await Promise.all(files.map(f => imageCompression(f, options)));
            setAdditionalImageFiles(prev => [...prev, ...compressed]);
            setAdditionalImagePreviews(prev => [...prev, ...compressed.map(f => URL.createObjectURL(f))]);
        } catch {
            setModal({ message: 'Failed to process one or more images.', type: State.ERROR });
        } finally {
            if (e.target) e.target.value = '';
        }
    };

    const removeNewAdditionalImage = (idx: number) => {
        setAdditionalImageFiles(prev => prev.filter((_, i) => i !== idx));
        setAdditionalImagePreviews(prev => prev.filter((_, i) => i !== idx));
    };

    const removeExistingAdditionalImage = (url: string) => {
        setExistingAdditionalUrls(prev => prev.filter(u => u !== url));
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
        const companyId = item?.companyId || currentUser?.companyId;

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

        // 👇 NEW — same validation jaisi ItemAdd.tsx mein hai
        const activeTiers = enablePriceTiers ? priceTiers : [];
        for (const tier of activeTiers) {
            if (!tier.label.trim()) {
                setModal({ message: 'Every pricing option needs a label (e.g. "Box of 10").', type: State.ERROR });
                return;
            }
            if (!tier.quantity || tier.quantity <= 0) {
                setModal({ message: `Pricing option "${tier.label}" needs a valid quantity.`, type: State.ERROR });
                return;
            }
            if (tier.mrp === 0 && tier.salesPrice === 0) {
                setModal({ message: `Pricing option "${tier.label}" needs either MRP or Sales Price.`, type: State.ERROR });
                return;
            }
        }
        const allTierBarcodes = activeTiers.map(t => t.barcode?.trim()).filter(Boolean);
        if (new Set(allTierBarcodes).size !== allTierBarcodes.length) {
            setModal({ message: 'Two pricing options cannot share the same barcode.', type: State.ERROR });
            return;
        }
        if (allTierBarcodes.includes(String(formData.barcode || '').trim())) {
            setModal({ message: 'A pricing option barcode cannot be the same as the item barcode.', type: State.ERROR });
            return;
        }

        const activeSlabs = enableQuantitySlabs ? quantitySlabs : [];
        if (activeSlabs.length > 0 && activeTiers.length > 0) {
            setModal({ message: 'Use either Pricing Options or Quantity Pricing, not both.', type: State.ERROR });
            return;
        }
        const slabError = validateQuantitySlabs(activeSlabs, currentMRP);
        if (slabError) {
            setModal({ message: slabError, type: State.ERROR });
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

            // NEW — upload any newly added additional photos
            const newlyUploadedAdditionalUrls: string[] = [];
            for (const file of additionalImageFiles) {
                const extraPath = `companies/${companyId}/items/${item.id}/extra_${Date.now()}_${Math.random().toString(36).slice(2)}`;
                const extraRef = ref(storage, extraPath);
                await new Promise<void>((resolve, reject) => {
                    const task = uploadBytesResumable(extraRef, file);
                    task.on('state_changed', undefined, reject, async () => {
                        newlyUploadedAdditionalUrls.push(await getDownloadURL(task.snapshot.ref));
                        resolve();
                    });
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
                imageUrls: [newImageUrl, ...existingAdditionalUrls, ...newlyUploadedAdditionalUrls].filter((u): u is string => Boolean(u)),
                description: String(formData.description || ''),
                unit: String(formData.unit || ''),
                unitMultiplier: currentMultiplier,
                packetSize: formData.unit === 'pkt' ? parseInt(String(formData.packetSize), 10) : null,
                moq: Number(formData.moq || 1),
                variants: variantIds,
                // When feature is disabled, don't touch existing tiers saved on the item
                ...(enablePriceTiers ? { priceTiers } : {}),
                // Same rule as tiers: if feature is disabled, don't touch existing slabs on the item
                ...(enableQuantitySlabs
                    ? { quantitySlabs: [...activeSlabs].sort((a, b) => a.minQty - b.minQty) }
                    : {}),
                ...(enableAddOns ? {
                    addOnGroupIds,
                    addOnPicks: buildAddOnPicks(addOnGroupIds, addOnPick, addOnLimit, addOnTemplates),
                    addOnGroups: legacyAddOnGroups,
                } : {}),
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

    /* ---------------- UI-only derived values (display only) ---------------- */

    // Drawer now slides in from the right (was a bottom sheet)
    const drawerClasses = isOpen
        ? 'translate-x-0 opacity-100'
        : 'translate-x-full opacity-0 pointer-events-none';
    const overlayClasses = isOpen
        ? 'opacity-100 bg-[#020618]/50'
        : 'opacity-0 bg-transparent pointer-events-none';

    const getUnitLabel = () => {
        if (formData.unit === 'box') return '10 pcs';
        if (formData.unit === 'doz') return '12 pcs';
        if (formData.unit === 'qt') return '100 pcs';
        if (formData.unit === 'ton') return '1000 pcs';
        if (formData.unit === 'pkt') return `${formData.packetSize || 1} pcs`;
        return '1 pcs';
    };

    const fmtINR = (n: number) =>
        `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const uiMrp = Number(formData.mrp || 0);
    const uiSales = Number(formData.salesPrice || 0);
    const uiPurchase = Number(formData.purchasePrice || 0);
    const uiDiscount = Number(formData.discount || 0);
    const uiStock = Number(formData.stock ?? 0);
    const uiCustomerPays = uiSales - (uiSales * uiDiscount) / 100;
    const uiProfit = uiPurchase > 0 ? uiCustomerPays - uiPurchase : null;
    const GST_SLABS = [0, 0.25, 3, 5, 12, 18, 28];

    const mrpWarn = uiMrp > 0 && uiSales > uiMrp ? 'Sale price is above MRP — check the printed MRP' : uiMrp === 0 && uiSales > 0 ? 'Below sale price — enter the printed MRP' : '';
    const purchaseWarn = uiPurchase === 0 ? 'Add cost to see profit' : '';
    const taxWarn = formData.tax !== undefined && formData.tax !== ('' as any) && Number.isFinite(Number(formData.tax)) && !GST_SLABS.includes(Number(formData.tax))
        ? `${formData.tax}% isn’t a GST slab` : '';
    const stockWarn = uiStock < 0 ? `${Math.abs(uiStock)} more sold than in stock` : '';

    const uiIssueNames = [
        mrpWarn && 'MRP',
        purchaseWarn && 'purchase price',
        taxWarn && 'GST rate',
        stockWarn && 'stock',
    ].filter(Boolean) as string[];
    const uiIssueCount = uiIssueNames.length;

    return (
        <div
            className={`fixed inset-0 z-1000 flex justify-end items-stretch transition-opacity duration-300 ease-in-out ${overlayClasses}`}
            onClick={onClose}
        >
            <div
                className={`relative bg-[#eef2ff] shadow-[0_10px_28px_rgba(21,48,140,0.14),0_2px_6px_rgba(21,48,140,0.08)] w-full max-w-[780px] h-full flex flex-col transform transition-all duration-300 ease-in-out ${drawerClasses}`}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-label="Edit item"
            >
                {/* CROP MODAL */}
                {showCropModal && rawImageSrc && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#020618]/70 px-4">
                        <div className="bg-white rounded-xl shadow-[0_10px_28px_rgba(21,48,140,0.14)] w-full max-w-md p-4 flex flex-col gap-3">
                            <h3 className="text-base font-semibold text-[#0f172b]">Crop Image</h3>
                            <p className="text-xs text-[#45556c]">Drag to select crop area. Tap <strong>Use Full Image</strong> to skip.</p>
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
                                    className="px-3 h-9 text-xs font-medium text-[#45556c] rounded-lg hover:bg-[#f5f7ff]"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={async () => { if (pendingRawFile.current) await applyCompression(pendingRawFile.current); setShowCropModal(false); }}
                                    className="px-3 h-9 text-xs font-medium text-[#0f172b] bg-white border border-[#7a8aa3] rounded-lg hover:bg-[#f5f7ff]"
                                >
                                    Use Full Image
                                </button>
                                <button
                                    onClick={handleCropConfirm}
                                    className="px-4 h-9 text-xs font-medium text-white bg-[#155dfc] rounded-lg hover:bg-[#1447e6]"
                                >
                                    Crop & Use
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ---------- HEADER ---------- */}
                <div className="flex items-center gap-3 md:gap-3.5 px-3 md:px-5 pb-3 md:py-4 pt-[max(12px,env(safe-area-inset-top))] md:pt-4 bg-white border-b border-[#dfe6fb]">
                    <div className="hidden md:grid h-[52px] w-[52px] shrink-0 place-items-center overflow-hidden rounded-[10px] bg-[#f5f7ff] text-[#5b6b86]">
                        {imagePreview ? (
                            <img src={imagePreview} alt="" className="h-full w-full object-cover" />
                        ) : (
                            <FiPackage size={22} />
                        )}
                    </div>
                    <div className="min-w-0 flex-1 order-2 md:order-none">
                        {/* Mobile title: "Edit item" + item name caption */}
                        <h2 className="md:hidden text-base font-semibold leading-5 text-[#0f172b]">Edit item</h2>
                        <div className="md:hidden truncate text-xs text-[#5b6b86]">{item?.name || 'Item details'}</div>
                        {/* Desktop title */}
                        <div className="hidden md:block text-xs text-[#5b6b86]">Edit item</div>
                        <h2 className="hidden md:block truncate text-lg font-semibold leading-6 text-[#0f172b]">
                            {item?.name || 'Item details'}
                        </h2>
                        <div className="mt-1 hidden md:flex flex-wrap gap-1.5">
                            {formData.barcode ? (
                                <span className="inline-flex h-[22px] items-center rounded-full bg-[#f5f7ff] px-2.5 text-[11px] font-medium text-[#45556c] border border-[#dfe6fb]">
                                    {formData.barcode}
                                </span>
                            ) : null}
                            {formData.stock !== undefined && formData.stock !== ('' as any) ? (
                                <span
                                    className={`inline-flex h-[22px] items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold uppercase ${uiStock < 0 ? 'bg-[#ffeef0] text-[#d5000c]' : 'bg-[#f5f7ff] text-[#45556c] border border-[#dfe6fb]'}`}
                                >
                                    <span className={`h-1.5 w-1.5 rounded-full ${uiStock < 0 ? 'bg-[#d5000c]' : 'bg-[#5b6b86]'}`} />
                                    {uiStock} in stock
                                </span>
                            ) : null}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="order-1 md:order-none grid h-10 w-10 place-items-center rounded-lg text-[#45556c] hover:bg-[#f5f7ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#155dfc]"
                        aria-label="Close"
                    >
                        <FiX size={20} />
                    </button>
                </div>

                {/* ---------- BODY ---------- */}
                <div className="flex-1 overflow-y-auto px-3 py-3 md:px-5 md:py-4">
                    {isFetching ? (
                        <div className="flex flex-col items-center justify-center h-40 space-y-2">
                            <Spinner />
                            <p className="text-[#45556c] text-sm">Loading latest details...</p>
                        </div>
                    ) : (
                        <>
                            {modal && (
                                <div className="mb-4" onClick={(e) => e.stopPropagation()}>
                                    <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />
                                </div>
                            )}

                            <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)] items-start">
                                {/* ===== LEFT COLUMN: photo + summary ===== */}
                                <div className="grid gap-3 content-start">
                                    <div className="rounded-xl border border-[#dfe6fb] bg-white shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)] overflow-hidden">
                                        <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center md:block">
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
                                            {/* FILE INPUT (HIDDEN — opened by Replace button) */}
                                            <input
                                                type="file"
                                                accept="image/png, image/jpeg"
                                                onChange={handleFileChange}
                                                ref={fileInputRef}
                                                className="hidden"
                                                disabled={isSaving}
                                            />

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 p-2.5">
                                                <button
                                                    type="button"
                                                    onClick={() => fileInputRef.current?.click()}
                                                    disabled={isSaving}
                                                    className={BTN_SECONDARY}
                                                >
                                                    <FiUpload size={14} /> <span className="md:hidden">Replace photo</span><span className="hidden md:inline">Replace</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => cameraInputRef.current?.click()}
                                                    disabled={isSaving}
                                                    className={BTN_SECONDARY}
                                                >
                                                    <FiCamera size={14} /> <span className="md:hidden">Take photo</span><span className="hidden md:inline">Camera</span>
                                                </button>
                                            </div>
                                        </div>

                                        {/* OPTION TO REMOVE LOCAL FILE IF SELECTED */}
                                        {imageFile && (
                                            <div className="px-3 pb-2.5 -mt-1">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setImageFile(null);
                                                        setImagePreview(formData.imageUrl || null);
                                                        if (cameraInputRef.current) cameraInputRef.current.value = '';
                                                        if (fileInputRef.current) fileInputRef.current.value = '';
                                                    }}
                                                    className="text-xs font-medium text-[#d5000c] hover:underline"
                                                >
                                                    Remove Selected File
                                                </button>
                                            </div>
                                        )}

                                        {/* URL INPUT */}
                                        <div className="border-t border-[#dfe6fb] px-3 py-3">
                                            <label htmlFor="edit-imageUrl" className={`${LABEL_CLS} mb-1 block`}>Or paste Image URL</label>
                                            <input
                                                id="edit-imageUrl"
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
                                                className={INPUT_CLS}
                                                placeholder="https://example.com/image.jpg"
                                            />
                                        </div>

                                        {/* Additional photos for catalogue slider */}
                                        <div className="border-t border-[#dfe6fb] px-3 py-3">
                                            <span className={`${LABEL_CLS} mb-1 block`}>Additional photos</span>
                                            <p className="text-[11px] text-[#5b6b86] mb-2">Shown in the catalogue slider</p>
                                            <label className={`${BTN_SECONDARY} w-full cursor-pointer ${isSaving ? 'pointer-events-none opacity-45' : ''}`}>
                                                <FiUpload size={14} /> Add photos
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    multiple
                                                    onChange={handleAdditionalFilesChange}
                                                    disabled={isSaving}
                                                    className="hidden"
                                                />
                                            </label>
                                            {(existingAdditionalUrls.length > 0 || additionalImagePreviews.length > 0) && (
                                                <div className="flex gap-2 mt-3 flex-wrap">
                                                    {existingAdditionalUrls.map((url) => (
                                                        <div key={url} className="relative w-16 h-16">
                                                            <img src={url} className="w-full h-full object-cover rounded-lg border border-[#dfe6fb]" />
                                                            <button
                                                                type="button"
                                                                onClick={() => removeExistingAdditionalImage(url)}
                                                                disabled={isSaving}
                                                                aria-label="Remove photo"
                                                                className="absolute -top-1.5 -right-1.5 grid place-items-center bg-[#0f172b] text-white rounded-full w-5 h-5 text-[10px] leading-none"
                                                            >✕</button>
                                                        </div>
                                                    ))}
                                                    {additionalImagePreviews.map((src, idx) => (
                                                        <div key={src + idx} className="relative w-16 h-16">
                                                            <img src={src} className="w-full h-full object-cover rounded-lg border border-[#dfe6fb]" />
                                                            <button
                                                                type="button"
                                                                onClick={() => removeNewAdditionalImage(idx)}
                                                                disabled={isSaving}
                                                                aria-label="Remove photo"
                                                                className="absolute -top-1.5 -right-1.5 grid place-items-center bg-[#0f172b] text-white rounded-full w-5 h-5 text-[10px] leading-none"
                                                            >✕</button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* AT THE COUNTER summary (display only) */}
                                    <div className="hidden md:grid rounded-xl border border-[#dfe6fb] bg-white p-3.5 gap-2 shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)]">
                                        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5b6b86]">At the counter</div>
                                        <div>
                                            <span className="text-2xl font-semibold tabular-nums text-[#0f172b]">{fmtINR(uiCustomerPays)}</span>{' '}
                                            <span className="text-xs text-[#5b6b86]">per {getUnitLabel()}</span>
                                        </div>
                                        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-[13px]">
                                            <dt className="text-[#45556c]">Sale price</dt>
                                            <dd className="m-0 text-right font-semibold tabular-nums">{fmtINR(uiSales)}</dd>
                                            <dt className="text-[#45556c]">Discount {uiDiscount}%</dt>
                                            <dd className="m-0 text-right font-semibold tabular-nums">− {fmtINR((uiSales * uiDiscount) / 100)}</dd>
                                            <dt className="text-[#45556c]">Profit</dt>
                                            <dd className={`m-0 text-right font-semibold tabular-nums ${uiProfit === null ? 'text-[#5b6b86] font-normal' : uiProfit < 0 ? 'text-[#d5000c]' : 'text-[#008236]'}`}>
                                                {uiProfit === null ? 'needs cost' : fmtINR(uiProfit)}
                                            </dd>
                                            <dt className="text-[#45556c]">In stock</dt>
                                            <dd className={`m-0 text-right font-semibold tabular-nums ${uiStock < 0 ? 'text-[#d5000c]' : ''}`}>{uiStock} pcs</dd>
                                        </dl>
                                    </div>

                                    {uiIssueCount > 0 && (
                                        <div className="flex items-start gap-2 rounded-lg bg-[#fff3dd] px-3 py-2 text-xs text-[#bb4d00]">
                                            <FiAlertTriangle size={14} className="mt-px shrink-0" />
                                            <span><b>{uiIssueCount} {uiIssueCount === 1 ? 'thing' : 'things'} to check</b> — {uiIssueNames.join(', ')}. You can still save.</span>
                                        </div>
                                    )}
                                </div>

                                {/* ===== RIGHT COLUMN: grouped form cards ===== */}
                                <div className="grid gap-3 content-start min-w-0">

                                    {/* ---------- DETAILS ---------- */}
                                    <SectionCard icon={<FiTag size={16} />} title="Details" hint="Name is required">
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                            <FieldWrap className="col-span-2" label={<>Item name <em className="not-italic text-[#d5000c]">*</em></>} htmlFor="edit-name">
                                                <input
                                                    ref={firstInputRef}
                                                    type="text" id="edit-name" name="name"
                                                    value={formData.name || ''} onChange={handleChange}
                                                    className={`${INPUT_CLS} font-semibold`}
                                                    disabled={isSaving}
                                                />
                                            </FieldWrap>

                                            {/* --- Category --- */}
                                            <FieldWrap className="col-span-2" label="Category" htmlFor="edit-category" hint="An item can be in more than one category">
                                                {/* Primary category dropdown */}
                                                <select
                                                    id="edit-category"
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
                                                    className={INPUT_CLS}
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
                                                    <div className="mt-1 flex flex-wrap gap-1.5">
                                                        {selectedCategories.slice(1).map((catId) => {
                                                            const group = itemGroups.find(g => g.id === catId);
                                                            if (!group) return null;
                                                            return (
                                                                <span key={catId} className="inline-flex h-7 items-center gap-1 rounded-full bg-[#e6eeff] pl-2.5 pr-1.5 text-xs font-medium text-[#155dfc]">
                                                                    {group.name}
                                                                    <button
                                                                        type="button"
                                                                        aria-label={`Remove ${group.name}`}
                                                                        onClick={() => setSelectedCategories(prev => prev.filter(id => id !== catId))}
                                                                        className="grid h-4 w-4 place-items-center rounded-full text-[#155dfc] hover:bg-white"
                                                                    ><FiX size={12} /></button>
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
                                                        className="mt-1 w-fit text-xs font-semibold text-[#155dfc] hover:underline"
                                                    >
                                                        + Add more category
                                                    </button>
                                                ) : (
                                                    <div className="mt-1 flex gap-2 items-center">
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
                                                            className={`${INPUT_CLS} flex-1`}
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
                                                            className="px-2 h-10 text-xs font-medium text-[#45556c] rounded-lg hover:bg-[#f5f7ff]"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                )}
                                            </FieldWrap>

                                            <FieldWrap label="Barcode" htmlFor="edit-barcode">
                                                <input
                                                    type="text" id="edit-barcode" name="barcode"
                                                    value={formData.barcode || ''} onChange={handleChange}
                                                    className={INPUT_CLS}
                                                    disabled={isSaving}
                                                />
                                            </FieldWrap>

                                            <FieldWrap label="Unit" htmlFor="edit-unit">
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
                                                        className={`${INPUT_CLS} ${formData.unit === 'pkt' ? 'w-1/2' : 'w-full'}`}
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
                                                            className={`${INPUT_CLS} w-1/2`}
                                                            disabled={isSaving}
                                                            min="1"
                                                        />
                                                    )}
                                                </div>
                                            </FieldWrap>

                                            {unitChangeWarning && (
                                                <div className="col-span-2 flex items-start gap-2 rounded-lg bg-[#fff3dd] px-3 py-2 text-[13px] text-[#bb4d00]">
                                                    <FiAlertTriangle size={14} className="mt-0.5 shrink-0" />
                                                    <span>Unit changed — MRP and Sales Price are still the same values. Please review and update them for the new unit.</span>
                                                    <button onClick={() => setUnitChangeWarning(false)} aria-label="Dismiss" className="ml-auto text-[#bb4d00] hover:opacity-70">
                                                        <FiX size={14} />
                                                    </button>
                                                </div>
                                            )}

                                            <FieldWrap className="col-span-2" label="Description" htmlFor="edit-description">
                                                <input
                                                    type="text" id="edit-description" name="description"
                                                    value={formData.description || ''} onChange={handleChange}
                                                    className={INPUT_CLS}
                                                    placeholder="e.g. Keeps clothes fresh, 500 g pack"
                                                    disabled={isSaving}
                                                />
                                            </FieldWrap>
                                        </div>
                                    </SectionCard>

                                    {/* ---------- PRICING & TAX ---------- */}
                                    <SectionCard icon={<FiFileText size={16} />} tone="green" title="Pricing & tax" hint={`For ${getUnitLabel()}`}>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 md:gap-x-4 gap-y-3">
                                            <FieldWrap label="MRP" htmlFor="edit-mrp" warn={mrpWarn}>
                                                <div className="relative">
                                                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-[#5b6b86]">₹</span>
                                                    <input
                                                        id="edit-mrp"
                                                        type="number"
                                                        name="mrp"
                                                        value={formData.mrp ?? ''}
                                                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                                        onChange={handleChange}
                                                        className={`${INPUT_CLS} pl-7 ${mrpWarn ? INPUT_WARN_CLS : ''}`}
                                                    />
                                                </div>
                                            </FieldWrap>

                                            <FieldWrap label="Sale discount" htmlFor="edit-discount">
                                                <div className="relative">
                                                    <input
                                                        type="number" id="edit-discount" name="discount" step="0.01"
                                                        value={formData.discount ?? ''}
                                                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                                        onChange={handleChange}
                                                        className={`${INPUT_CLS} pr-8`}
                                                        disabled={isSaving}
                                                    />
                                                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#5b6b86]">%</span>
                                                </div>
                                            </FieldWrap>

                                            <FieldWrap
                                                label="Sale price"
                                                htmlFor="edit-salesPrice"
                                                hint={uiSales > 0 ? `Customer pays ${fmtINR(uiCustomerPays)} after ${uiDiscount}% off` : undefined}
                                            >
                                                <div className="relative">
                                                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-[#5b6b86]">₹</span>
                                                    <input
                                                        id="edit-salesPrice"
                                                        type="number"
                                                        name="salesPrice"
                                                        value={formData.salesPrice ?? ''}
                                                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                                        onChange={handleChange}
                                                        className={`${INPUT_CLS} pl-7 font-semibold`}
                                                    />
                                                </div>
                                            </FieldWrap>

                                            <FieldWrap label="Purchase price" htmlFor="edit-purchasePrice" warn={purchaseWarn}>
                                                <div className="relative">
                                                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-[#5b6b86]">₹</span>
                                                    <input
                                                        id="edit-purchasePrice"
                                                        type="number"
                                                        name="purchasePrice"
                                                        value={formData.purchasePrice ?? ''}
                                                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                                        onChange={handleChange}
                                                        className={`${INPUT_CLS} pl-7 ${purchaseWarn ? INPUT_WARN_CLS : ''}`}
                                                    />
                                                </div>
                                            </FieldWrap>

                                            <FieldWrap label="Purchase discount" htmlFor="edit-purchasediscount">
                                                <div className="relative">
                                                    <input
                                                        type="number" id="edit-purchasediscount" name="purchasediscount" step="0.01"
                                                        value={formData.purchasediscount ?? ''}
                                                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                                        onChange={handleChange}
                                                        className={`${INPUT_CLS} pr-8`}
                                                        disabled={isSaving}
                                                    />
                                                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#5b6b86]">%</span>
                                                </div>
                                            </FieldWrap>

                                            <FieldWrap label="Your profit">
                                                <div className="flex h-10 items-center rounded-lg bg-[#f5f7ff] px-3 text-sm tabular-nums text-[#5b6b86]">
                                                    {uiProfit === null ? 'Unknown' : fmtINR(uiProfit)}
                                                </div>
                                            </FieldWrap>

                                            <FieldWrap label="Tax (%)" htmlFor="edit-tax" warn={taxWarn}>
                                                <div className="relative">
                                                    <input
                                                        type="number" id="edit-tax" name="tax" step="0.01"
                                                        value={formData.tax ?? ''}
                                                        onChange={handleChange}
                                                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                                        className={`${INPUT_CLS} pr-8 ${taxWarn ? INPUT_WARN_CLS : ''}`}
                                                        disabled={isSaving}
                                                    />
                                                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#5b6b86]">%</span>
                                                </div>
                                            </FieldWrap>

                                            <FieldWrap label="HSN code" htmlFor="edit-hsnSac" hint="Needed on GST bills">
                                                <input
                                                    type="text" id="edit-hsnSac" name="hsnSac"
                                                    value={formData.hsnSac || ''}
                                                    onChange={handleChange}
                                                    onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                                    className={INPUT_CLS}
                                                    disabled={isSaving}
                                                    placeholder="e.g. 123456"
                                                />
                                            </FieldWrap>
                                        </div>
                                    </SectionCard>

                                    {/* ---------- STOCK ---------- */}
                                    <SectionCard icon={<FiBox size={16} />} tone="amber" title="Stock">
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                            <FieldWrap label="In stock" htmlFor="edit-stock" warn={stockWarn}>
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        id="edit-stock"
                                                        name="stock"
                                                        step="1"
                                                        value={formData.stock ?? ''}
                                                        onChange={handleChange}
                                                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                                        className={`${INPUT_CLS} pr-10 font-semibold ${uiStock < 0 ? 'text-[#d5000c] ' + INPUT_WARN_CLS : ''}`}
                                                        disabled={isSaving}
                                                    />
                                                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#5b6b86]">pcs</span>
                                                </div>
                                            </FieldWrap>

                                            <FieldWrap label="MOQ" htmlFor="edit-moq" hint="Minimum order quantity">
                                                <div className="relative">
                                                    <input
                                                        id="edit-moq"
                                                        type="number"
                                                        name="moq"
                                                        value={formData.moq ?? ''}
                                                        onChange={handleChange}
                                                        className={`${INPUT_CLS} pr-10`}
                                                        disabled={isSaving}
                                                    />
                                                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#5b6b86]">pcs</span>
                                                </div>
                                            </FieldWrap>
                                        </div>
                                    </SectionCard>

                                    {/* ---------- VARIANTS & CATALOGUE ---------- */}
                                    <SectionCard icon={<FiGrid size={16} />} tone="magenta" title="Variants & catalogue">
                                        <div className="grid gap-4">
                                            <div className="grid gap-1">
                                                <span className={LABEL_CLS}>Variants</span>
                                                <VariantPicker
                                                    allItems={allItemsForVariants}
                                                    selectedIds={variantIds}
                                                    currentItemBarcode={formData.barcode || ''}
                                                    onChange={setVariantIds}
                                                    activeTheme={{ text: 'text-[#155dfc]', border: 'border-[#155dfc]', primaryBg: 'bg-[#155dfc]', focusRing: 'focus:ring-[#155dfc]' } as any}
                                                />
                                                <small className="text-[11px] leading-[15px] text-[#5b6b86]">Link other sizes or colours of the same product</small>
                                            </div>

                                            {/* Pricing Options (Tiers) */}
                                            {enablePriceTiers && (
                                                <div className="border-t border-[#dfe6fb] pt-4">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-sm font-medium leading-none text-[#0f172b]">
                                                            Pricing options <span className="text-[#5b6b86] font-normal text-xs">(e.g. Box of 10, Combo)</span>
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={addPriceTier}
                                                            disabled={quantitySlabs.length > 0}
                                                            title={quantitySlabs.length > 0 ? 'Remove Quantity Pricing slabs to use Pricing Options' : ''}
                                                            className="text-xs font-semibold text-[#155dfc] hover:underline disabled:text-[#5b6b86] disabled:opacity-45 disabled:no-underline disabled:cursor-not-allowed"
                                                        >
                                                            + Add Pricing Option
                                                        </button>
                                                    </div>

                                                    {priceTiers.length === 0 ? (
                                                        <p className="text-[11px] text-[#5b6b86] italic">
                                                            No extra pricing added. Item will only sell at the single price set above.
                                                        </p>
                                                    ) : (
                                                        <div className="space-y-3">
                                                            {priceTiers.map((tier) => (
                                                                <div key={tier.id} className="border border-[#dfe6fb] rounded-lg p-3 bg-[#f5f7ff] relative">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => removePriceTier(tier.id)}
                                                                        aria-label="Remove pricing option"
                                                                        className="absolute top-2 right-2 text-[#5b6b86] hover:text-[#d5000c]"
                                                                    >
                                                                        <FiX size={16} />
                                                                    </button>

                                                                    <div className="grid grid-cols-2 gap-3 mb-2 pr-6">
                                                                        <div>
                                                                            <label className={SMALL_LABEL_CLS}>Label</label>
                                                                            <input
                                                                                type="text"
                                                                                value={tier.label}
                                                                                onChange={(e) => updatePriceTier(tier.id, 'label', e.target.value)}
                                                                                placeholder="e.g. Box of 10"
                                                                                className={SMALL_INPUT_CLS}
                                                                            />
                                                                        </div>
                                                                        <div>
                                                                            <label className={SMALL_LABEL_CLS}>Quantity</label>
                                                                            <input
                                                                                type="number"
                                                                                value={tier.quantity}
                                                                                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                                                                onChange={(e) => updatePriceTier(tier.id, 'quantity', parseInt(e.target.value) || 1)}
                                                                                min="1"
                                                                                className={SMALL_INPUT_CLS}
                                                                            />
                                                                        </div>
                                                                    </div>

                                                                    <div className="grid grid-cols-3 gap-3 mb-2">
                                                                        <div>
                                                                            <label className={SMALL_LABEL_CLS}>MRP</label>
                                                                            <input
                                                                                type="number"
                                                                                value={tier.mrp}
                                                                                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                                                                onChange={(e) => updatePriceTier(tier.id, 'mrp', parseFloat(e.target.value) || 0)}
                                                                                className={SMALL_INPUT_CLS}
                                                                            />
                                                                        </div>
                                                                        <div>
                                                                            <label className={SMALL_LABEL_CLS}>Sales Price</label>
                                                                            <input
                                                                                type="number"
                                                                                value={tier.salesPrice}
                                                                                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                                                                onChange={(e) => updatePriceTier(tier.id, 'salesPrice', parseFloat(e.target.value) || 0)}
                                                                                className={SMALL_INPUT_CLS}
                                                                            />
                                                                        </div>
                                                                        <div>
                                                                            <label className={SMALL_LABEL_CLS}>Purchase Price</label>
                                                                            <input
                                                                                type="number"
                                                                                value={tier.purchasePrice}
                                                                                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                                                                onChange={(e) => updatePriceTier(tier.id, 'purchasePrice', parseFloat(e.target.value) || 0)}
                                                                                className={SMALL_INPUT_CLS}
                                                                            />
                                                                        </div>
                                                                    </div>

                                                                    <div>
                                                                        <label className={SMALL_LABEL_CLS}>Barcode (optional)</label>
                                                                        <input
                                                                            type="text"
                                                                            value={tier.barcode}
                                                                            onChange={(e) => updatePriceTier(tier.id, 'barcode', e.target.value)}
                                                                            placeholder="Scan or type this pack's own barcode"
                                                                            className={SMALL_INPUT_CLS}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Quantity Pricing (Volume Slabs) */}
                                            {enableQuantitySlabs && (
                                                <div className="border-t border-[#dfe6fb] pt-4">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-sm font-medium leading-none text-[#0f172b]">
                                                            Quantity pricing <span className="text-[#5b6b86] font-normal text-xs">(e.g. 1-10 @ ₹100, 11-20 @ ₹95)</span>
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={addQuantitySlab}
                                                            disabled={priceTiers.length > 0}
                                                            title={priceTiers.length > 0 ? 'Remove Pricing Options to use Quantity Pricing' : ''}
                                                            className="text-xs font-semibold text-[#155dfc] hover:underline disabled:text-[#5b6b86] disabled:opacity-45 disabled:no-underline disabled:cursor-not-allowed"
                                                        >
                                                            + Add Slab
                                                        </button>
                                                    </div>

                                                    {priceTiers.length > 0 && (
                                                        <p className="text-[11px] text-[#bb4d00] mb-2">
                                                            Pricing Options are in use. Remove them to add Quantity Pricing.
                                                        </p>
                                                    )}

                                                    {quantitySlabs.length === 0 ? (
                                                        <p className="text-[11px] text-[#5b6b86] italic">
                                                            No quantity slabs added. Item will always sell at the single price set above.
                                                        </p>
                                                    ) : (
                                                        <div className="space-y-2">
                                                            <div className="grid grid-cols-[1fr_1fr_1fr_24px] gap-2 text-[10px] font-medium text-[#5b6b86]">
                                                                <span>From Qty</span>
                                                                <span>To Qty (blank = above)</span>
                                                                <span>Price / unit</span>
                                                                <span></span>
                                                            </div>
                                                            {quantitySlabs.map((slab) => (
                                                                <div key={slab.id} className="grid grid-cols-[1fr_1fr_1fr_24px] gap-2 items-center">
                                                                    <input
                                                                        type="number"
                                                                        min="1"
                                                                        value={slab.minQty || ''}
                                                                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                                                        onChange={(e) => updateQuantitySlab(slab.id, 'minQty', e.target.value)}
                                                                        placeholder="1"
                                                                        disabled={isSaving}
                                                                        className={SMALL_INPUT_CLS}
                                                                    />
                                                                    <input
                                                                        type="number"
                                                                        min="1"
                                                                        value={slab.maxQty ?? ''}
                                                                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                                                        onChange={(e) => updateQuantitySlab(slab.id, 'maxQty', e.target.value)}
                                                                        placeholder="And above"
                                                                        disabled={isSaving}
                                                                        className={SMALL_INPUT_CLS}
                                                                    />
                                                                    <input
                                                                        type="number"
                                                                        value={slab.salesPrice || ''}
                                                                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                                                        onChange={(e) => updateQuantitySlab(slab.id, 'salesPrice', e.target.value)}
                                                                        placeholder="0.00"
                                                                        disabled={isSaving}
                                                                        className={SMALL_INPUT_CLS}
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => removeQuantitySlab(slab.id)}
                                                                        disabled={isSaving}
                                                                        aria-label="Remove slab"
                                                                        className="text-[#5b6b86] hover:text-[#d5000c]"
                                                                    >
                                                                        <FiX size={16} />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                            <p className="text-[10px] text-[#5b6b86]">
                                                                The slab price applies to the whole quantity. Quantities outside all slabs use the base Sales Price.
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Add-ons: pick from the groups created in Item groups */}
                                            {enableAddOns && (
                                                <div className="border-t border-[#dfe6fb] pt-3">
                                                    <div className="flex items-center gap-2.5">
                                                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#e6eeff] text-base font-semibold text-[#155dfc]">+</span>
                                                        <div className="min-w-0">
                                                            <b className="block text-[15px] font-semibold leading-5 text-[#0f172b]">Add-ons</b>
                                                            <small className="block text-[11px] leading-4 text-[#5b6b86]">Pick groups created in Item groups, then choose which options this item shows</small>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => { onClose(); navigate(itemGroupRoute); }}
                                                            className="ml-auto shrink-0 text-xs font-semibold text-[#155dfc] hover:underline"
                                                        >
                                                            Manage add-ons
                                                        </button>
                                                    </div>

                                                    <div className="mt-2.5">
                                                        {addOnTemplates.length === 0 ? (
                                                            <p className="m-0 text-xs text-[#5b6b86]">No add-on groups yet. Create them in Item groups → Add-ons.</p>
                                                        ) : (
                                                            <select
                                                                value=""
                                                                disabled={isSaving}
                                                                onChange={(e) => {
                                                                    const id = e.target.value;
                                                                    if (id) {
                                                                        setAddOnGroupIds(prev => (prev.includes(id) ? prev : [...prev, id]));
                                                                        setAddOnOpenId(id); // open its checklist right away
                                                                    }
                                                                }}
                                                                className={`${INPUT_CLS} !h-9`}
                                                            >
                                                                <option value="">Add an add-on group…</option>
                                                                {addOnTemplates.filter(t => !addOnGroupIds.includes(t.id)).map(t => (
                                                                    <option key={t.id} value={t.id}>{t.name}</option>
                                                                ))}
                                                            </select>
                                                        )}
                                                    </div>

                                                    {addOnGroupIds.length > 0 && (
                                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                                            {addOnGroupIds.map((gid) => {
                                                                const g = addOnTemplates.find(t => t.id === gid);
                                                                const picked = g ? (addOnPick[gid] ?? g.options.map(o => o.id)) : [];
                                                                const partial = !!g && picked.length < g.options.length;
                                                                const open = addOnOpenId === gid;
                                                                return (
                                                                    <div
                                                                        key={gid}
                                                                        className={`inline-flex h-7 items-center rounded-full border pl-2.5 pr-1 text-xs ${open ? 'border-[#155dfc] bg-[#e6eeff]' : 'border-[#dfe6fb] bg-[#f5f7ff]'}`}
                                                                    >
                                                                        <button
                                                                            type="button"
                                                                            disabled={!g}
                                                                            onClick={() => setAddOnOpenId(open ? null : gid)}
                                                                            aria-expanded={open}
                                                                            className="inline-flex items-center gap-1.5"
                                                                        >
                                                                            <span className="max-w-[140px] truncate font-semibold text-[#0f172b]">
                                                                                {g ? g.name : addOnsLoaded ? 'Removed group' : '…'}
                                                                            </span>
                                                                            {g && (
                                                                                <span className={`text-[11px] ${partial ? 'font-semibold text-[#155dfc]' : 'text-[#5b6b86]'}`}>
                                                                                    {picked.length}/{g.options.length}
                                                                                </span>
                                                                            )}
                                                                            {g && (
                                                                                <svg
                                                                                    viewBox="0 0 24 24"
                                                                                    aria-hidden="true"
                                                                                    className={`h-3 w-3 fill-none stroke-[#5b6b86] transition-transform ${open ? 'rotate-90' : ''}`}
                                                                                    strokeWidth={2.5}
                                                                                    strokeLinecap="round"
                                                                                    strokeLinejoin="round"
                                                                                >
                                                                                    <path d="M9 6l6 6-6 6" />
                                                                                </svg>
                                                                            )}
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            disabled={isSaving}
                                                                            aria-label="Remove add-on group"
                                                                            onClick={() => setAddOnGroupIds(prev => prev.filter(id => id !== gid))}
                                                                            className="ml-1 grid h-5 w-5 place-items-center rounded-full text-[#5b6b86] hover:bg-white hover:text-[#d5000c]"
                                                                        ><FiX size={12} /></button>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}

                                                    {(() => {
                                                        const g = addOnOpenId && addOnGroupIds.includes(addOnOpenId)
                                                            ? addOnTemplates.find(t => t.id === addOnOpenId)
                                                            : undefined;
                                                        if (!g) return null;
                                                        const gid = g.id;
                                                        const picked = addOnPick[gid] ?? g.options.map(o => o.id);
                                                        const partial = picked.length < g.options.length;
                                                        return (
                                                            <div className="mt-2 grid gap-1.5 rounded-lg bg-[#f5f7ff] p-2.5">
                                                                {g.multiple && (
                                                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#45556c]">
                                                                        <label htmlFor={`addon-limit-${gid}`}>Max choices</label>
                                                                        <input
                                                                            id={`addon-limit-${gid}`}
                                                                            type="number"
                                                                            min="1"
                                                                            disabled={isSaving}
                                                                            value={addOnLimit[gid] || ''}
                                                                            placeholder={Number(g.maxSelect) > 0 ? `${g.maxSelect}` : '∞'}
                                                                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                                                            onChange={(e) => setAddOnLimit(prev => ({ ...prev, [gid]: parseInt(e.target.value, 10) || 0 }))}
                                                                            className="h-7 w-14 rounded-md border border-[#7a8aa3] bg-white px-2 text-xs text-[#0f172b] outline-none focus:border-[#155dfc] focus:ring-2 focus:ring-[#155dfc]/40 disabled:opacity-45"
                                                                        />
                                                                        <span className="text-[11px] text-[#5b6b86]">Blank = group limit · 1 = choose one</span>
                                                                    </div>
                                                                )}

                                                                <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                                                                    {g.options.map((o) => (
                                                                        <label key={o.id} className="flex min-w-0 cursor-pointer items-center gap-2 text-xs text-[#0f172b]">
                                                                            <input
                                                                                type="checkbox"
                                                                                disabled={isSaving}
                                                                                checked={picked.includes(o.id)}
                                                                                onChange={() => toggleAddOnOption(g, o.id)}
                                                                                className="h-3.5 w-3.5 shrink-0 accent-[#155dfc]"
                                                                            />
                                                                            <span className="min-w-0 flex-1 truncate" title={o.name}>{o.name}{o.itemId ? ' (item)' : ''}</span>
                                                                            <small className="shrink-0 text-[11px] text-[#5b6b86]">{Number(o.price) > 0 ? `+₹${o.price}` : 'Free'}</small>
                                                                        </label>
                                                                    ))}
                                                                </div>

                                                                {partial && (
                                                                    <button type="button" onClick={() => selectAllAddOnOptions(g)} className="w-fit text-xs font-semibold text-[#155dfc] hover:underline">
                                                                        Select all
                                                                    </button>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}

                                                    {legacyAddOnGroups.length > 0 && (
                                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                                            {legacyAddOnGroups.map((g) => (
                                                                <span key={g.id} className="inline-flex h-7 items-center gap-1 rounded-full bg-[#fff3dd] pl-2.5 pr-1.5 text-xs font-medium text-[#bb4d00]">
                                                                    {g.name} (this item only)
                                                                    <button
                                                                        type="button"
                                                                        disabled={isSaving}
                                                                        aria-label="Remove add-on group"
                                                                        onClick={() => setLegacyAddOnGroups(prev => prev.filter(x => x.id !== g.id))}
                                                                        className="grid h-4 w-4 place-items-center rounded-full hover:bg-white"
                                                                    ><FiX size={12} /></button>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Catalogue listing */}
                                            <ShowWrapper requiredPermission={Permissions.ViewCatalogue}>
                                                <div className="flex items-center gap-3 border-t border-[#dfe6fb] pt-4">
                                                    <div className="flex-1 min-w-0">
                                                        <label
                                                            htmlFor={`edit-isListed-${item?.id}`}
                                                            className="block text-sm font-medium text-[#0f172b] select-none cursor-pointer"
                                                        >
                                                            List this item on Catalog
                                                        </label>
                                                        <div className="text-xs text-[#5b6b86]">Customers can see and order it from your catalogue link</div>
                                                    </div>
                                                    <input
                                                        type="checkbox"
                                                        id={`edit-isListed-${item?.id}`}
                                                        name="isListed"
                                                        checked={formData.isListed ?? false}
                                                        onChange={handleChange}
                                                        disabled={isSaving}
                                                        className="h-5 w-5 rounded border-[#7a8aa3] accent-[#155dfc] cursor-pointer"
                                                    />
                                                </div>
                                            </ShowWrapper>
                                        </div>
                                    </SectionCard>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* ---------- STICKY FOOTER ---------- */}
                <div className="flex items-center gap-2.5 px-3 md:px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] bg-white border-t border-[#dfe6fb] shadow-[0_-6px_16px_rgba(21,48,140,0.06)]">
                    <div className="md:hidden mr-auto grid">
                        <span className="text-xs text-[#45556c]">Customer pays</span>
                        <b className="text-xl leading-6 font-semibold tabular-nums text-[#0f172b]">{fmtINR(uiCustomerPays)}</b>
                    </div>
                    <span className="hidden md:block mr-auto" />
                    <button
                        onClick={onClose}
                        disabled={isSaving}
                        className="hidden md:inline-flex h-10 items-center justify-center whitespace-nowrap rounded-lg px-4 text-sm font-medium text-[#0f172b] hover:bg-[#f5f7ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#155dfc] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || isFetching}
                        className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#155dfc] px-5 text-sm font-medium text-white transition-colors hover:bg-[#1447e6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#155dfc] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45"
                    >
                        {isSaving ? <Spinner /> : <FiSave size={16} />}
                        {isSaving ? (uploadProgress !== null ? 'Uploading...' : 'Saving...') : 'Save changes'}
                    </button>
                </div>
            </div>
        </div>
    );
};