import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { ItemGroup } from '../../constants/models';
import { State } from '../../enums';
import XLSX from 'xlsx-js-style';
import BarcodeScanner from '../../UseComponents/BarcodeScanner';
import { useAuth, useDatabase } from '../../context/auth-context';
import { Spinner } from '../../constants/Spinner';
import { Modal } from '../../constants/Modal';
import { useItemSettings } from '../../context/SettingsContext';
import { collection, query, where, getDocs, limit, doc, runTransaction, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import ExcelJS from 'exceljs';
import { db, storage } from '../../lib/Firebase';
import imageCompression from 'browser-image-compression';
import { type Crop, centerCrop, makeAspectCrop } from 'react-image-crop';
import { Tag, X, CheckCircle2, AlertCircle, Layers } from 'lucide-react';
import { ImageUploadCard } from './components/ImageUploadCard';
import { BasicInfoSection } from './components/BasicInfoSection';
import { PricingSection } from './components/PricingSection';
import { InventorySection } from './components/InventorySection';
import { VariantsSection } from './components/VariantsSection';
import { BulkImportCard } from './components/BulkImportCard';
import { StickyActionBar } from './components/StickyActionBar';
import { CropImageModal } from './components/CropImageModal';
import { ImportSettingsModal, type ImportMode } from './components/ImportSettingsModal';
import { UploadProgressOverlay } from './components/UploadProgressOverlay';
import { PageNavToggle } from './components/PageNavToggle';

interface ItemAddProps {
  theme?: 'blue' | 'orange';
  routes?: {
    itemAdd: string;
    itemGroup: string;
  };
}

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

    // THE FIX: Use Google's lh3 image CDN endpoint
    if (fileId) {
      return `https://lh3.googleusercontent.com/d/${fileId}`;
    }
  }

  if (cleanUrl.includes('dropbox.com')) {
    return cleanUrl.replace('dl=0', 'raw=1').replace('www.dropbox.com', 'dl.dropboxusercontent.com');
  }

  return cleanUrl;
};

const DRAFT_STORAGE_KEY = 'sellar_item_add_draft';

const ItemAdd: React.FC<ItemAddProps> = ({
  routes = { itemAdd: '/item-add', itemGroup: '/item-group' }
}) => {
  // NOTE: `theme` prop is retained on ItemAddProps for backward compatibility
  // only. Styling is unified via design-system tokens regardless of theme.
  const navigate = useNavigate();
  const location = useLocation();
  const dbOperations = useDatabase();
  const { currentUser, loading: authLoading } = useAuth();
  const { itemSettings, loadingSettings: loadingItemSettings } = useItemSettings();

  const [itemName, setItemName] = useState<string>('');
  const [itemMRP, setItemMRP] = useState<string>('');
  const [itemSalesPrice, setItemSalesPrice] = useState<string>('');
  const [itemPurchasePrice, setItemPurchasePrice] = useState<string>('');
  const [itemDiscount, setItemDiscount] = useState<string>('');
  const [PurchaseDiscount, setPurchaseDiscount] = useState<string>('');
  const [itemTax, setItemTax] = useState<string>('');
  const [itemAmount, setItemAmount] = useState<string>('');
  const [restockQuantity, setRestockQuantity] = useState<string>('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState<boolean>(false);
  const [itemBarcode, setItemBarcode] = useState<string>('');
  const [fetchedAutoBarcode, setFetchedAutoBarcode] = useState<string>('');
  const [hsnCode, setHsnCode] = useState<string>('');
  const [itemUnit, setItemUnit] = useState<string>('pcs');
  const [packetSize, setPacketSize] = useState<string>('');
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
  const [allItems, setAllItems] = useState<any[]>([]);
  const [moq, setMoq] = useState<string>('1');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [itemVariants, setItemVariants] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [pageIsLoading, setPageIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);

  const [isImageCompressing, setIsImageCompressing] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<Crop | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const pendingRawFile = useRef<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importMode, setImportMode] = useState<'create_update' | 'update_only'>('create_update');
  const [updateFields, setUpdateFields] = useState({
    mrp: true,
    salesPrice: true,
    purchasePrice: true,
    stock: true,
    category: true,
    discount: true,
    tax: true,
    hsnCode: true,
    restockQuantity: true,
    moq: true,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const successBannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const draft = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        if (parsed.itemName) setItemName(parsed.itemName);
        if (parsed.itemMRP) setItemMRP(parsed.itemMRP);
        if (parsed.itemSalesPrice) setItemSalesPrice(parsed.itemSalesPrice);
        if (parsed.itemPurchasePrice) setItemPurchasePrice(parsed.itemPurchasePrice);
        if (parsed.itemDiscount) setItemDiscount(parsed.itemDiscount);
        if (parsed.PurchaseDiscount) setPurchaseDiscount(parsed.PurchaseDiscount);
        if (parsed.itemTax) setItemTax(parsed.itemTax);
        if (parsed.itemAmount) setItemAmount(parsed.itemAmount);
        if (parsed.restockQuantity) setRestockQuantity(parsed.restockQuantity);
        if (parsed.selectedCategories) setSelectedCategories(parsed.selectedCategories);
        if (parsed.itemBarcode) setItemBarcode(parsed.itemBarcode);
        if (parsed.hsnCode) setHsnCode(parsed.hsnCode);
        if (parsed.itemUnit) setItemUnit(parsed.itemUnit);
        if (parsed.packetSize) setPacketSize(parsed.packetSize);
        if (parsed.moq) setMoq(parsed.moq);
        if (parsed.imageUrl) setImageUrl(parsed.imageUrl);
      } catch (e) {
        console.error("Failed to parse draft storage", e);
      }
    }
  }, []);

  useEffect(() => {
    const draft = {
      itemName, itemMRP, itemSalesPrice, itemPurchasePrice, itemDiscount,
      PurchaseDiscount, itemTax, itemAmount, restockQuantity, selectedCategories,
      itemBarcode, hsnCode, itemUnit, packetSize, moq, imageUrl
    };
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [itemName, itemMRP, itemSalesPrice, itemPurchasePrice, itemDiscount, PurchaseDiscount, itemTax, itemAmount, restockQuantity, selectedCategories, itemBarcode, hsnCode, itemUnit, packetSize, moq, imageUrl]);

  const getUnitLabel = () => {
    if (itemUnit === 'box') return '10 pcs';
    if (itemUnit === 'doz') return '12 pcs';
    if (itemUnit === 'qt') return '100 pcs';
    if (itemUnit === 'ton') return '1000 pcs';
    if (itemUnit === 'pkt') return `${packetSize || 1} pcs`;
    return '1 pcs';
  };


  useEffect(() => {
    setPageIsLoading(authLoading || loadingItemSettings || !dbOperations);
  }, [authLoading, loadingItemSettings, dbOperations]);

  const isActive = (path: string) => location.pathname === path;

  const fetchGroups = async () => {
    if (!dbOperations) return;
    try {
      setLoading(true);
      const groups = await dbOperations.getItemGroups();
      setItemGroups(groups);
      if (groups.length === 0) setSelectedCategories([]);
      const items = await dbOperations.syncItems();
      setAllItems(items || []);
    } catch (err) {
      setError('Failed to load item categories.');
    } finally {
      setLoading(false);
    }
  };

  const fetchNextBarcode = async (forceRefresh = false) => {
    if (!currentUser?.companyId || !itemSettings?.autoGenerateBarcode) return;

    if (!forceRefresh) {
      const draft = sessionStorage.getItem(DRAFT_STORAGE_KEY);
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          if (parsed.itemBarcode) return;
        } catch (e) { }
      }
    }

    try {
      const counterRef = doc(db, 'companies', currentUser.companyId, 'counters', 'items');
      const snap = await getDoc(counterRef);
      let nextSeq = 1001;
      if (snap.exists()) {
        nextSeq = (snap.data().currentSequence || 1000) + 1;
      }
      setItemBarcode(String(nextSeq));
      setFetchedAutoBarcode(String(nextSeq));
    } catch (e) {
      console.error("Failed to fetch next barcode", e);
    }
  };

  useEffect(() => {
    if (dbOperations && currentUser && itemSettings) {
      fetchGroups();
      fetchNextBarcode();
    }
  }, [dbOperations, currentUser, itemSettings]);

  const resetForm = () => {
    setItemName('');
    setItemMRP('');
    setItemSalesPrice('');
    setItemPurchasePrice('');
    setItemDiscount('');
    setPurchaseDiscount('');
    setItemTax('');
    setItemAmount('');
    setRestockQuantity('');
    setHsnCode('');
    setItemUnit('pcs');
    setPacketSize('');
    setImageUrl('');
    setImageFile(null);
    setImagePreview(null);
    setMoq('1');
    setSelectedCategories([]);
    setShowCategoryDropdown(false);
    setItemVariants([]);
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    if (imageInputRef.current) imageInputRef.current.value = '';
    fetchNextBarcode();
  };

  const reserveSequenceBlock = async (count: number): Promise<number> => {
    if (!currentUser?.companyId) throw new Error("No Company ID");
    const counterRef = doc(db, 'companies', currentUser.companyId, 'counters', 'items');
    try {
      return await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let lastSeq = 1000;
        if (counterDoc.exists()) {
          lastSeq = counterDoc.data().currentSequence || 1000;
        }
        const nextSeq = lastSeq + count;
        transaction.set(counterRef, { currentSequence: nextSeq }, { merge: true });
        return lastSeq + 1;
      });
    } catch (e) {
      return Date.now();
    }
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
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show crop modal first before compressing
    const objectUrl = URL.createObjectURL(file);
    pendingRawFile.current = file;
    setRawImageSrc(objectUrl);
    setCrop(undefined);
    setCompletedCrop(null);
    setShowCropModal(true);
  };

  const handleCropConfirm = async () => {
    if (!imgRef.current || !completedCrop || completedCrop.width === 0 || completedCrop.height === 0) {
      // No crop selected — use original file
      if (!pendingRawFile.current) return;
      applyCompression(pendingRawFile.current);
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

  const applyCompression = async (file: File) => {
    setIsImageCompressing(true);
    try {
      const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1024, useWebWorker: true };
      const compressedFile = await imageCompression(file, options);
      setImageFile(compressedFile);
      setImagePreview(URL.createObjectURL(compressedFile));
    } catch {
      setModal({ message: 'Failed to compress image.', type: State.ERROR });
    } finally {
      setIsImageCompressing(false);
    }
  };

  const handleImageLoaded = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    // Default to a centered square crop
    const centeredCrop = centerCrop(
      makeAspectCrop({ unit: '%', width: 80 }, 1, width, height),
      width, height
    );
    setCrop(centeredCrop);
  };

  const handleAddItem = async () => {
    if (!dbOperations || !currentUser || !itemSettings) {
      setModal({ message: 'App not ready.', type: State.ERROR }); return;
    }
    setError(null); setSuccess(null); setModal(null);
    if (!itemName.trim()) {
      setModal({ message: 'Item Name is required.', type: State.ERROR }); return;
    }

    if (itemSettings.requireBarcode && !itemBarcode.trim()) {
      setModal({ message: 'Barcode is required.', type: State.ERROR }); return;
    }

    const mrpValue = parseFloat(itemMRP) || 0;
    const saleValue = parseFloat(itemSalesPrice) || 0;
    const purchaseValue = parseFloat(itemPurchasePrice) || 0;

    if (mrpValue === 0 && saleValue === 0) {
      setModal({ message: 'Please enter either MRP or Sales Price.', type: State.ERROR }); return;
    }
    if (mrpValue > 0 && saleValue > 0 && saleValue > mrpValue) {
      setModal({ message: 'Sales Price cannot be greater than MRP', type: State.ERROR }); return;
    }

    if (itemSettings.requireImage && !imageFile && !imageUrl.trim()) {
      setModal({ message: 'Product Image is required.', type: State.ERROR }); return;
    }
    if (itemSettings.requireCategory && selectedCategories.length === 0) {
      setModal({ message: 'Category is required.', type: State.ERROR }); return;
    }
    if (itemSettings.requirePurchasePrice && !itemPurchasePrice.trim()) {
      setModal({ message: 'Purchase Price is required.', type: State.ERROR }); return;
    }
    if (itemSettings.requireSaleDiscount && !itemDiscount.trim()) {
      setModal({ message: 'Sale Discount is required.', type: State.ERROR }); return;
    }
    if (itemSettings.requirePurchaseDiscount && !PurchaseDiscount.trim()) {
      setModal({ message: 'Purchase Discount is required.', type: State.ERROR }); return;
    }
    if (itemSettings.requireDiscount && !itemDiscount.trim() && !PurchaseDiscount.trim()) {
      setModal({ message: 'Discount is required.', type: State.ERROR }); return;
    }
    if (itemSettings.requireTax && !itemTax.trim()) {
      setModal({ message: 'Tax is required.', type: State.ERROR }); return;
    }
    if (itemSettings.requireHsnCode && !hsnCode.trim()) {
      setModal({ message: 'HSN Code is required.', type: State.ERROR }); return;
    }
    if (itemSettings.requireStock && !itemAmount.trim()) {
      setModal({ message: 'Opening Stock is required.', type: State.ERROR }); return;
    }
    if (itemSettings.requireRestockQuantity && !restockQuantity.trim()) {
      setModal({ message: 'Restock Level is required.', type: State.ERROR }); return;
    }
    if (itemSettings.requireMoq && !moq.trim()) {
      setModal({ message: 'MOQ is required.', type: State.ERROR }); return;
    }
    if (itemSettings.requireUnit && !itemUnit.trim()) {
      setModal({ message: 'Unit is required.', type: State.ERROR }); return;
    }

    if (itemUnit === 'pkt' && (!packetSize.trim() || parseInt(packetSize, 10) <= 0)) {
      setModal({ message: 'Please enter a valid quantity for the Packet.', type: State.ERROR }); return;
    }

    let finalSaleDiscount = parseFloat(itemDiscount) || 0;
    let finalPurchaseDiscount = parseFloat(PurchaseDiscount) || 0;
    if (mrpValue > 0 && purchaseValue > 0) finalPurchaseDiscount = 0;

    // --- FIX: Fallback to auto-generated barcode if input is empty ---
    const finalBarcode = itemBarcode.trim() || fetchedAutoBarcode;

    // --- STRICT BLOCK: Absolutely no empty strings allowed ---
    if (!finalBarcode) {
      setModal({ message: 'Barcode is required and cannot be empty.', type: State.ERROR });
      return;
    }

    setIsSaving(true);

    try {
      const itemsRef = collection(db, 'companies', currentUser.companyId, 'items');
      const q = query(itemsRef, where('barcode', '==', finalBarcode), limit(1));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const existingDoc = snapshot.docs[0].data();
        if (!existingDoc.isDeleted && !existingDoc.deleted) {
          setModal({ message: `Barcode ${finalBarcode} already exists.`, type: State.ERROR });
          setIsSaving(false);
          return;
        }
      }

      let currentMultiplier = 1;
      if (itemUnit === 'box') currentMultiplier = 10;
      if (itemUnit === 'doz') currentMultiplier = 12;
      if (itemUnit === 'qt') currentMultiplier = 100;
      if (itemUnit === 'ton') currentMultiplier = 1000;
      if (itemUnit === 'pkt') currentMultiplier = parseInt(packetSize, 10) || 1;

      let finalUploadedImageUrl = null;
      if (imageFile) {
        const storageRef = ref(storage, `companies/${currentUser.companyId}/items/${finalBarcode}_${Date.now()}`);
        await uploadBytes(storageRef, imageFile);
        finalUploadedImageUrl = await getDownloadURL(storageRef);
      } else if (imageUrl.trim()) {
        finalUploadedImageUrl = formatImageUrl(imageUrl);
      }

      const newItemData: any = {
        name: itemName.trim(),
        mrp: mrpValue,
        salesPrice: saleValue,
        purchasePrice: purchaseValue,
        discount: finalSaleDiscount,
        purchasediscount: finalPurchaseDiscount,
        tax: parseFloat(itemTax) || 0,
        hsnSac: hsnCode.trim(),
        itemGroupId: selectedCategories[0] || '',
        itemGroupIds: selectedCategories,
        stock: parseInt(itemAmount, 10) || 0,
        amount: parseInt(itemAmount, 10) || 0,
        barcode: finalBarcode,
        restockQuantity: parseInt(restockQuantity, 10) || 0,
        moq: parseInt(moq, 10) || 1,
        unit: itemUnit.trim(),
        unitMultiplier: currentMultiplier,
        packetSize: itemUnit === 'pkt' ? parseInt(packetSize, 10) : null,
        imageUrl: finalUploadedImageUrl,
        isDeleted: false,
        variants: itemVariants,
      };

      await dbOperations.createItem(newItemData, finalBarcode);

      if (finalBarcode === fetchedAutoBarcode) {
        const counterRef = doc(db, 'companies', currentUser.companyId, 'counters', 'items');
        await runTransaction(db, async (transaction) => {
          const counterDoc = await transaction.get(counterRef);
          const currentDBSeq = counterDoc.exists() ? (counterDoc.data().currentSequence || 1000) : 1000;
          transaction.set(counterRef, { currentSequence: currentDBSeq + 1 }, { merge: true });
        });
      }

      setSuccess(`Item "${itemName}" added!`);
      resetForm();
      requestAnimationFrame(() => {
        successBannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      setTimeout(() => setSuccess(null), 30000);

    } catch (err: any) {
      setError('Failed to add item.');
      setModal({ message: err.message, type: State.ERROR });
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setShowImportModal(true); // Open the modal instead of uploading right away
  };

  const executeImport = async () => {
    if (!pendingFile || !dbOperations || !currentUser || !itemSettings || !currentUser.companyId) return;

    setShowImportModal(false);
    setIsUploading(true);
    setUploadProgress(null);
    setError(null); setSuccess(null); setModal(null);

    try {
      const arrayBuffer = await pendingFile.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);

      const worksheet = workbook.worksheets[0];
      if (!worksheet) throw new Error("Excel file is empty.");

      const images = worksheet.getImages();
      const rowImageMap = new Map<number, any>();
      for (const image of images) {
        const rowIndex = image.range.tl.row;
        const imgData = workbook.getImage(Number(image.imageId));
        rowImageMap.set(rowIndex, imgData);
      }

      let headerRowNum = 1;
      for (let r = 1; r <= Math.min(worksheet.rowCount, 15); r++) {
        const firstCell = worksheet.getRow(r).getCell(1).text?.trim().toLowerCase();
        if (firstCell && (firstCell.includes('item name') || firstCell === 'name')) {
          headerRowNum = r;
          break;
        }
      }
      const dataStartRow = headerRowNum + 2;

      // --- HELPER FIX: Extracted to ensure total count perfectly matches loop evaluation ---
      const safeGetVal = (rowObj: any, colIdx: number) => {
        const val = rowObj.getCell(colIdx).value;
        if (val === null || val === undefined) return "";
        if (typeof val === 'object' && 'hyperlink' in val) return (val.hyperlink || val.text || "").toString().trim();
        if (typeof val === 'object' && 'richText' in val) return val.richText.map((rt: any) => rt.text).join('').trim();
        return val.toString().trim();
      };

      let processedCount = 0, createdCount = 0, updatedCount = 0, failedCount = 0, skippedCount = 0;
      let totalItems = 0;

      for (let r = dataStartRow; r <= worksheet.rowCount; r++) {
        const name = safeGetVal(worksheet.getRow(r), 1);
        if (name && !name.toLowerCase().includes('full product name')) totalItems++;
      }
      setUploadProgress({ current: 0, total: totalItems });

      let currentGroups = await dbOperations.getItemGroups();
      const groupMap = new Map<string, string>();
      currentGroups.forEach(g => groupMap.set(g.name.toLowerCase().trim(), g.id!));

      const allExistingItems = await dbOperations.syncItems();
      const itemMapByBarcode = new Map<string, any>();
      const itemMapByName = new Map<string, any>();

      allExistingItems.forEach(item => {
        if (item.barcode) itemMapByBarcode.set(item.barcode.trim(), item);
        if (item.name) itemMapByName.set(item.name.toLowerCase().trim(), item);
      });

      let maxImportedNumericBarcode = 0;
      for (let r = dataStartRow; r <= worksheet.rowCount; r++) {
        const rawBarcode = safeGetVal(worksheet.getRow(r), 2);
        if (rawBarcode && /^\d+$/.test(rawBarcode)) {
          maxImportedNumericBarcode = Math.max(maxImportedNumericBarcode, parseInt(rawBarcode, 10));
        }
      }

      let nextSeqNumber = 0;
      if (importMode === 'create_update') {
        let needsBarcodeCount = 0;
        for (let r = dataStartRow; r <= worksheet.rowCount; r++) {
          if (!safeGetVal(worksheet.getRow(r), 2) && safeGetVal(worksheet.getRow(r), 1)) {
            needsBarcodeCount++;
          }
        }
        if (needsBarcodeCount > 0) nextSeqNumber = await reserveSequenceBlock(needsBarcodeCount);
      }

      for (let rowNum = dataStartRow; rowNum <= worksheet.rowCount; rowNum++) {
        const row = worksheet.getRow(rowNum);
        const rawName = safeGetVal(row, 1);
        if (!rawName || rawName.toLowerCase().includes('full product name')) continue;

        await new Promise(resolve => setTimeout(resolve, 0));
        setUploadProgress({ current: processedCount + 1, total: totalItems });

        const rowBarcodeStr = safeGetVal(row, 2);
        const rowMRP = parseFloat(safeGetVal(row, 3)) || 0;
        const rowSale = parseFloat(safeGetVal(row, 4)) || 0;
        const rowPurchase = parseFloat(safeGetVal(row, 5)) || 0;
        const rowSaleDiscount = parseFloat(safeGetVal(row, 6)) || 0;
        const rowPurchaseDiscount = parseFloat(safeGetVal(row, 7)) || 0;
        const rowTax = parseFloat(safeGetVal(row, 8)) || 0;
        const rowHsn = safeGetVal(row, 9);
        let csvCategoryValue = safeGetVal(row, 10);

        if (csvCategoryValue && ['uncategorized', 'none', 'n/a', 'null'].includes(csvCategoryValue.toLowerCase())) {
          csvCategoryValue = "";
        }

        const stockVal = parseInt(safeGetVal(row, 11)) || 0;
        const rowRestock = parseInt(safeGetVal(row, 12)) || 0;
        const rowMoq = parseInt(safeGetVal(row, 13)) || 1;
        const rowImageUrlStr = safeGetVal(row, 14);

        // --- STRICT VALIDATION FIX ---
        // Catches bad data early and increments fail count properly
        let rowIsValid = true;
        if (rowMRP === 0 && rowSale === 0) rowIsValid = false; // Missing prices
        if (rowMRP > 0 && rowSale > 0 && rowSale > rowMRP) rowIsValid = false; // Invalid pricing
        if (itemSettings.requirePurchasePrice && rowPurchase <= 0) rowIsValid = false;

        // --- NEGATIVE VALUE GUARD ---
        // Reject any row containing negative numeric values
        if (
          rowMRP < 0 ||
          rowSale < 0 ||
          rowPurchase < 0 ||
          rowSaleDiscount < 0 ||
          rowPurchaseDiscount < 0 ||
          rowTax < 0 ||
          stockVal < 0 ||
          rowRestock < 0 ||
          rowMoq < 0
        ) {
          rowIsValid = false;
        }

        if (!rowIsValid) {
          failedCount++;
          processedCount++;
          continue;
        }

        let targetGroupId = "";
        if (csvCategoryValue && (importMode === 'create_update' || updateFields.category)) {
          const categoryLower = csvCategoryValue.toLowerCase();
          if (groupMap.has(categoryLower)) {
            targetGroupId = groupMap.get(categoryLower)!;
          } else {
            try {
              const newGroupId = await dbOperations.createItemGroup({ name: csvCategoryValue, description: 'Auto-created via Bulk Import' });
              if (typeof newGroupId === 'string') {
                groupMap.set(categoryLower, newGroupId);
                targetGroupId = newGroupId;
              }
            } catch (e) { /* fallback */ }
          }
        }

        let existingItem = null;
        if (rowBarcodeStr && itemMapByBarcode.has(rowBarcodeStr)) {
          existingItem = itemMapByBarcode.get(rowBarcodeStr);
        } else if (itemMapByName.has(rawName.toLowerCase())) {
          existingItem = itemMapByName.get(rawName.toLowerCase());
        }

        let finalUploadedImageUrl = null;
        const embeddedImageData = rowImageMap.get(rowNum - 1);

        if (embeddedImageData) {
          try {
            const tempBarcode = rowBarcodeStr || String(nextSeqNumber);
            const imageBlob = new Blob([embeddedImageData.buffer], { type: `image/${embeddedImageData.extension}` });
            const storageRef = ref(storage, `companies/${currentUser.companyId}/items/${tempBarcode}_${Date.now()}.${embeddedImageData.extension}`);
            await uploadBytes(storageRef, imageBlob);
            finalUploadedImageUrl = await getDownloadURL(storageRef);
          } catch (uploadErr) {
            console.error("Firebase Image Upload Failed:", uploadErr);
          }
        } else if (rowImageUrlStr) {
          finalUploadedImageUrl = formatImageUrl(rowImageUrlStr);
        }

        if (importMode === 'update_only') {
          if (!existingItem) {
            skippedCount++;
            processedCount++;
            continue;
          }

          const updates: any = {};
          if (updateFields.mrp) updates.mrp = rowMRP;
          if (updateFields.salesPrice) updates.salesPrice = rowSale;
          if (updateFields.purchasePrice) updates.purchasePrice = rowPurchase;
          if (updateFields.stock) { updates.stock = stockVal; updates.amount = stockVal; }
          if (updateFields.category && targetGroupId) {
            updates.itemGroupId = targetGroupId;
            updates.itemGroupIds = [targetGroupId];
          }
          if (updateFields.discount) { updates.discount = rowSaleDiscount; updates.purchasediscount = rowPurchaseDiscount; }
          if (finalUploadedImageUrl) updates.imageUrl = finalUploadedImageUrl;
          if (updateFields.tax) updates.tax = rowTax;
          if (updateFields.hsnCode) updates.hsnSac = rowHsn;
          if (updateFields.restockQuantity) updates.restockQuantity = rowRestock;
          if (updateFields.moq) updates.moq = rowMoq;

          try {
            await dbOperations.updateItem(existingItem.id, updates);
            updatedCount++;
          } catch (e) {
            failedCount++;
          }

        } else {
          let finalRowBarcode = rowBarcodeStr;

          if (!existingItem && !finalRowBarcode) {
            finalRowBarcode = String(nextSeqNumber);
            nextSeqNumber++;
          } else if (existingItem) {
            finalRowBarcode = existingItem.barcode;
          }

          const itemData: any = {
            name: rawName,
            mrp: rowMRP,
            salesPrice: rowSale,
            purchasePrice: rowPurchase,
            discount: rowSaleDiscount,
            purchasediscount: rowPurchaseDiscount,
            tax: rowTax,
            hsnSac: rowHsn,
            itemGroupId: targetGroupId || '',
            itemGroupIds: targetGroupId ? [targetGroupId] : [],
            stock: stockVal,
            amount: stockVal,
            barcode: finalRowBarcode,
            restockQuantity: rowRestock,
            moq: rowMoq,
            imageUrl: finalUploadedImageUrl || (existingItem ? existingItem.imageUrl : null),
            isDeleted: false,
          };

          try {
            if (existingItem) {
              await dbOperations.updateItem(existingItem.id, itemData);
              updatedCount++;
            } else {
              await dbOperations.createItem(itemData, finalRowBarcode);
              createdCount++;

              // --- MAP UPDATE FIX ---
              // Add newly created items to the maps immediately.
              // If there are duplicate barcodes in the same Excel sheet, the next one will trigger an update rather than an overwrite.
              const newItemObj = { ...itemData, id: finalRowBarcode };
              itemMapByBarcode.set(finalRowBarcode, newItemObj);
              itemMapByName.set(rawName.toLowerCase(), newItemObj);
            }
          } catch (e) {
            failedCount++;
          }
        }
        processedCount++;
      }

      if (maxImportedNumericBarcode > 0) {
        try {
          const counterRef = doc(db, 'companies', currentUser.companyId, 'counters', 'items');
          await runTransaction(db, async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            const currentSeq = counterDoc.exists() ? (counterDoc.data().currentSequence || 1000) : 1000;

            if (maxImportedNumericBarcode >= currentSeq) {
              transaction.set(counterRef, { currentSequence: maxImportedNumericBarcode }, { merge: true });
            }
          });
        } catch (e) {
          console.error("Failed to sync sequence counter:", e);
        }
      }

      await fetchGroups();
      await fetchNextBarcode(true);

      if (failedCount > 0) {
        // Now accurately captures failing items due to bad input or DB rejections
        setModal({ message: `Imported with errors. ${failedCount} rows failed due to missing prices or Name.`, type: State.ERROR });
      } else {
        setSuccess(`Completed: ${createdCount} New, ${updatedCount} Updated, ${skippedCount} Skipped.`);
      }
      setTimeout(() => setSuccess(null), 10000);

    } catch (err: any) {
      setError("File processing failed. Ensure it is a valid Excel file.");
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleBarcodeScanned = (barcode: string) => {
    setItemBarcode(barcode);
    setIsScannerOpen(false);
  };

  const handleDownloadSample = () => {
    const s = (font: any, fill?: any, alignment?: any, border?: any) => ({
      font: { name: 'Arial', ...font },
      fill: fill ?? {},
      alignment: alignment ?? { horizontal: 'center', vertical: 'center', wrapText: true },
      border: border ?? {},
    });

    const solidFill = (rgb: string) => ({ patternType: 'solid', fgColor: { rgb } });
    const thinBorder = (sides: ('top' | 'bottom' | 'left' | 'right')[]) => {
      const b: any = {};
      sides.forEach(side => { b[side] = { style: 'thin', color: { rgb: 'CBD5E1' } }; });
      return b;
    };

    const allBorders = thinBorder(['top', 'bottom', 'left', 'right']);
    const bblr = thinBorder(['bottom', 'left', 'right']);

    const COLS = [
      { header: '★ Item Name', note: 'Full product name  e.g. Amul Butter 500g', type: 'R', width: 24, field: 'name' },
      { header: '● Barcode', note: 'Optional (Leave blank to auto-generate)', type: 'O', width: 16, field: 'barcode' },
      { header: '● MRP', note: 'Max Retail Price (₹)  Required if Sale Price blank', type: 'O', width: 13, field: 'mrp' },
      { header: '★ Sales Price', note: 'Selling price (₹)  Required if MRP blank', type: 'R', width: 14, field: 'salesPrice' },
      { header: '● Purchase Price', note: 'Your cost price (₹)', type: 'O', width: 17, field: 'purchasePrice' },
      { header: '● Sale Disc (%)', note: 'Default customer discount  e.g. 5', type: 'O', width: 14, field: 'discount' },
      { header: '● Purchase Disc (%)', note: 'Supplier discount  e.g. 3', type: 'O', width: 16, field: 'purchasediscount' },
      { header: '● Tax (%)', note: 'GST/VAT rate  e.g. 18', type: 'O', width: 10, field: 'tax' },
      { header: '● HSN Code', note: '6-digit HSN / SAC code', type: 'O', width: 13, field: 'hsnCode' },
      { header: '▲ Category', note: 'Group name – new category auto-created', type: 'L', width: 18, field: 'itemGroupId' },
      { header: '● Stock', note: 'Opening stock quantity', type: 'O', width: 10, field: 'stock' },
      { header: '● Restock Level', note: 'Alert when stock falls below this', type: 'O', width: 15, field: 'restockQuantity' },
      { header: '● MOQ', note: 'Minimum Order Quantity', type: 'O', width: 10, field: 'moq' },
      { header: '● Image URL', note: 'Web link to image (Optional)', type: 'O', width: 25, field: 'imageUrl' },
    ];

    const TYPE_STYLE: Record<string, { bg: string; txt: string }> = {
      R: { bg: 'FEE2E2', txt: 'DC2626' },
      O: { bg: 'DCFCE7', txt: '15803D' },
      L: { bg: 'E0F2FE', txt: '0369A1' },
    };

    const colCount = COLS.length;
    const legendRows = [
      { bg: 'FEE2E2', txt: 'DC2626', marker: '★  Required', desc: 'Must be filled in – item will be skipped if missing' },
      { bg: 'DCFCE7', txt: '15803D', marker: '●  Optional', desc: 'Improves data quality; leave blank if not applicable' },
      { bg: 'E0F2FE', txt: '0369A1', marker: '▲  Lookup', desc: 'Accepts text name; new categories created automatically' },
    ];

    const sampleRows = [
      ['Amul Butter 500g', '', 250, 240, 190, 0, 2, 5, '0402', 'Dairy', 50, 10, 1, 'https://example.com/amul.jpg'],
      ['Parle-G Biscuit', '1002', 10, 10, 7, 0, 0, 0, '', 'Snacks', 200, 20, 10, ''],
    ];

    const totalRows = 12;
    const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

    aoa[0][0] = 'SELLAR  ·  Bulk Item Import Template';
    aoa[1][0] = 'Fill in the rows below and upload this file in Sellar → Items → Bulk Import. Do NOT rename column headers. You can embed images into rows or paste links.';
    aoa[3][0] = 'LEGEND';
    legendRows.forEach((l, i) => {
      aoa[4 + i][0] = l.marker;
      aoa[4 + i][1] = l.desc;
    });

    COLS.forEach((c, i) => { aoa[8][i] = c.header; });
    COLS.forEach((c, i) => { aoa[9][i] = c.note; });
    sampleRows.forEach((row, ri) => {
      row.forEach((val, ci) => { aoa[10 + ri][ci] = val; });
    });

    const ws: any = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = COLS.map(c => ({ wch: c.width }));
    ws['!rows'] = [
      { hpt: 34 }, { hpt: 24 }, { hpt: 8 }, { hpt: 20 }, { hpt: 18 }, { hpt: 18 }, { hpt: 8 }, { hpt: 30 }, { hpt: 22 }, { hpt: 18 }, { hpt: 18 },
    ];

    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: colCount - 1 } },
      ...legendRows.map((_, i) => ({ s: { r: 4 + i, c: 1 }, e: { r: 4 + i, c: 3 } })),
    ];

    const style = (addr: string, st: any) => {
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      ws[addr].s = st;
    };

    style('A1', s({ sz: 15, bold: true, color: { rgb: 'FFFFFF' } }, solidFill('0369A1'), { horizontal: 'center', vertical: 'center' }));
    style('A2', s({ sz: 9, italic: true, color: { rgb: '475569' } }, solidFill('DBEAFE'), { horizontal: 'center', vertical: 'center', wrapText: true }));
    style('A4', s({ sz: 10, bold: true, color: { rgb: '0369A1' } }, solidFill('E0F2FE'), { horizontal: 'left', vertical: 'center' }, allBorders));

    legendRows.forEach((l, i) => {
      const row = 5 + i;
      style(`A${row}`, s({ sz: 9, bold: true, color: { rgb: l.txt } }, solidFill(l.bg), { horizontal: 'left', vertical: 'center' }, bblr));
      style(`B${row}`, s({ sz: 9, color: { rgb: '334155' } }, solidFill(l.bg), { horizontal: 'left', vertical: 'center' }, bblr));
      ['C', 'D'].forEach(col => {
        const addr = `${col}${row}`;
        if (!ws[addr]) ws[addr] = { t: 's', v: '' };
        ws[addr].s = s({ sz: 9 }, solidFill(l.bg), {}, bblr);
      });
    });

    COLS.forEach((c, i) => {
      const { bg, txt } = TYPE_STYLE[c.type];
      const addr = XLSX.utils.encode_cell({ r: 8, c: i });
      style(addr, s({ sz: 9, bold: true, color: { rgb: txt } }, solidFill(bg), { horizontal: 'center', vertical: 'center', wrapText: true }, allBorders));
    });

    COLS.forEach((_c, i) => {
      const addr = XLSX.utils.encode_cell({ r: 9, c: i });
      style(addr, s({ sz: 7, italic: true, color: { rgb: '64748B' } }, solidFill('F8FAFC'), { horizontal: 'center', vertical: 'center', wrapText: true }, bblr));
    });

    sampleRows.forEach((row, ri) => {
      const altBg = ri % 2 === 1 ? 'F1F5F9' : 'FFFFFF';
      if (ri === 0) {
        const bAddr = XLSX.utils.encode_cell({ r: 10, c: 1 });
        ws[bAddr] = { t: 's', v: '' };
        ws[bAddr].s = s({ sz: 8, italic: true, color: { rgb: '94A3B8' } }, solidFill(altBg), { horizontal: 'center', vertical: 'center' }, bblr);
      }
      row.forEach((_val, ci) => {
        const addr = XLSX.utils.encode_cell({ r: 10 + ri, c: ci });
        style(addr, s({ sz: 9, color: { rgb: '1E293B' } }, solidFill(altBg), { horizontal: 'center', vertical: 'center' }, bblr));
      });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Items');
    XLSX.writeFile(wb, 'Sellar_Items_Import_Template.xlsx');
  };

  if (pageIsLoading) return <Spinner />;

  const addItemDisabled = isSaving || pageIsLoading || (loading && itemGroups.length === 0);

  // --- Category handlers (moved out of inline JSX for the extracted BasicInfoSection) ---
  const handlePrimaryCategoryChange = (value: string) => {
    if (value === 'ADD_NEW_GROUP') { navigate(routes.itemGroup); return; }
    setSelectedCategories(prev => {
      const rest = prev.slice(1); // keep extra categories
      return value ? [value, ...rest] : rest;
    });
  };

  const handleAddCategory = (value: string) => {
    if (!value) return;
    if (value === 'ADD_NEW_GROUP') { navigate(routes.itemGroup); return; }
    if (!selectedCategories.includes(value)) {
      setSelectedCategories(prev => [...prev, value]);
    }
    setShowCategoryDropdown(false);
  };

  const handleRemoveCategory = (categoryId: string) => {
    setSelectedCategories(prev => prev.filter(id => id !== categoryId));
  };

  // --- Unit handler (moved out of inline JSX for the extracted InventorySection) ---
  const handleItemUnitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setItemUnit(e.target.value);
    if (e.target.value !== 'pkt') setPacketSize('');
  };

  // --- Image handlers (moved out of inline JSX for the extracted ImageUploadCard / CropImageModal) ---
  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleCropCancel = () => {
    setShowCropModal(false);
    pendingRawFile.current = null;
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleUseFullImage = async () => {
    if (pendingRawFile.current) await applyCompression(pendingRawFile.current);
    setShowCropModal(false);
  };

  // --- Bulk import modal handlers (moved out of inline JSX for the extracted ImportSettingsModal) ---
  const handleCancelImport = () => {
    setShowImportModal(false);
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleToggleUpdateField = (key: string, value: boolean) => {
    setUpdateFields(prev => ({ ...prev, [key]: value }));
  };

  const renderHeader = () => (
    <div className="glass fixed top-0 left-0 right-0 z-10 mx-3 mt-3 flex flex-col gap-3 rounded-2xl p-3 shadow-sm md:static md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-gradient-to-br from-primary to-[oklch(0.6_0.22_330)] p-[3px] shadow-sm shadow-primary/20">
          <div className="bg-gradient-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px]">
            <Tag className="size-4 text-white" />
          </div>
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground md:text-xl">Add Item</h1>
          <p className="hidden text-xs text-muted-foreground md:block">Create a new product or bulk import your catalogue</p>
        </div>
      </div>
      <div className="flex items-center justify-center gap-2">
        <PageNavToggle
          items={[
            { key: 'add', label: 'Add Item', icon: <Tag className="size-3.5" />, path: routes.itemAdd },
            { key: 'groups', label: 'Item Groups', icon: <Layers className="size-3.5" />, path: routes.itemGroup },
          ]}
          isActive={isActive}
          onSelect={(path) => navigate(path)}
        />
      </div>
    </div>
  );

  return (
    <div className="aurora relative flex h-screen w-full flex-col overflow-hidden bg-muted font-poppins text-foreground">
      <BarcodeScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleBarcodeScanned} />
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

      {uploadProgress && (
        <UploadProgressOverlay current={uploadProgress.current} total={uploadProgress.total} />
      )}

      {showCropModal && rawImageSrc && (
        <CropImageModal
          rawImageSrc={rawImageSrc}
          crop={crop}
          onCropChange={setCrop}
          onCropComplete={setCompletedCrop}
          imgRef={imgRef}
          onImageLoaded={handleImageLoaded}
          onCancel={handleCropCancel}
          onUseFullImage={handleUseFullImage}
          onCropConfirm={handleCropConfirm}
        />
      )}

      {showImportModal && (
        <ImportSettingsModal
          importMode={importMode}
          onImportModeChange={(mode: ImportMode) => setImportMode(mode)}
          updateFields={updateFields}
          onToggleUpdateField={handleToggleUpdateField}
          onCancel={handleCancelImport}
          onConfirm={executeImport}
        />
      )}

      {renderHeader()}

      <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">

        {/* LEFT PANEL */}
        <div className="h-full w-full flex-1 overflow-y-auto px-4 pb-10 pt-28 md:w-[65%] md:px-6 md:pb-6 md:pt-6">

          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive animate-in fade-in-0 slide-in-from-top-1">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div
              ref={successBannerRef}
              className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-success/30 bg-success/10 p-3 text-success animate-in fade-in-0 slide-in-from-top-1"
            >
              <span className="flex flex-1 items-center justify-center gap-2 text-sm font-medium">
                <CheckCircle2 className="size-4 shrink-0" />
                {success}
              </span>
              <button onClick={() => setSuccess(null)} className="shrink-0 leading-none text-success/70 hover:text-success">
                <X className="size-4" />
              </button>
            </div>
          )}

          <BulkImportCard
            variant="compact"
            isUploading={isUploading}
            onUploadClick={() => fileInputRef.current?.click()}
            onDownloadSample={handleDownloadSample}
          />
          <input type="file" ref={fileInputRef} onChange={handleFileSelected} className="hidden" accept=".xlsx, .xls, .csv" />

          <div className="mt-4 space-y-6 md:mt-0">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow duration-200 hover:shadow-md">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">Product Image</p>
              <ImageUploadCard
                imagePreview={imagePreview}
                isImageCompressing={isImageCompressing}
                imageUrl={imageUrl}
                imageFile={imageFile}
                requireImage={itemSettings?.requireImage}
                imageInputRef={imageInputRef}
                onFileChange={handleImageChange}
                onUrlChange={(e) => setImageUrl(e.target.value)}
                onRemoveImage={handleRemoveImage}
              />
            </div>

            <BasicInfoSection
              itemName={itemName}
              onItemNameChange={(e) => setItemName(e.target.value)}
              itemBarcode={itemBarcode}
              onItemBarcodeChange={(e) => setItemBarcode(e.target.value)}
              requireBarcode={itemSettings?.requireBarcode}
              onScanClick={() => setIsScannerOpen(true)}
              itemGroups={itemGroups}
              selectedCategories={selectedCategories}
              requireCategory={itemSettings?.requireCategory}
              showCategoryDropdown={showCategoryDropdown}
              onToggleCategoryDropdown={setShowCategoryDropdown}
              onPrimaryCategoryChange={handlePrimaryCategoryChange}
              onAddCategory={handleAddCategory}
              onRemoveCategory={handleRemoveCategory}
            />

            <PricingSection
              unitLabel={getUnitLabel()}
              itemMRP={itemMRP}
              onItemMRPChange={(e) => setItemMRP(e.target.value)}
              itemSalesPrice={itemSalesPrice}
              onItemSalesPriceChange={(e) => setItemSalesPrice(e.target.value)}
              itemPurchasePrice={itemPurchasePrice}
              onItemPurchasePriceChange={(e) => setItemPurchasePrice(e.target.value)}
              requirePurchasePrice={itemSettings?.requirePurchasePrice}
              itemDiscount={itemDiscount}
              onItemDiscountChange={(e) => setItemDiscount(e.target.value)}
              requireSaleDiscount={itemSettings?.requireSaleDiscount}
              purchaseDiscount={PurchaseDiscount}
              onPurchaseDiscountChange={(e) => setPurchaseDiscount(e.target.value)}
              requirePurchaseDiscount={itemSettings?.requirePurchaseDiscount}
              itemTax={itemTax}
              onItemTaxChange={(e) => setItemTax(e.target.value)}
              requireTax={itemSettings?.requireTax}
              hsnCode={hsnCode}
              onHsnCodeChange={(e) => setHsnCode(e.target.value)}
              requireHsnCode={itemSettings?.requireHsnCode}
            />

            <InventorySection
              itemAmount={itemAmount}
              onItemAmountChange={(e) => setItemAmount(e.target.value)}
              requireStock={itemSettings?.requireStock}
              restockQuantity={restockQuantity}
              onRestockQuantityChange={(e) => setRestockQuantity(e.target.value)}
              requireRestockQuantity={itemSettings?.requireRestockQuantity}
              moq={moq}
              onMoqChange={(e) => setMoq(e.target.value)}
              requireMoq={itemSettings?.requireMoq}
              itemUnit={itemUnit}
              onItemUnitChange={handleItemUnitChange}
              requireUnit={itemSettings?.requireUnit}
              packetSize={packetSize}
              onPacketSizeChange={(e) => setPacketSize(e.target.value)}
            />

            <VariantsSection
              allItems={allItems}
              itemVariants={itemVariants}
              itemBarcode={itemBarcode}
              onChange={setItemVariants}
            />
          </div>
        </div>

        {/* RIGHT PANEL: Sticky Sidebar on Desktop */}
        <div className="relative z-10 hidden h-full w-[35%] flex-col border-l border-border bg-card md:flex">
          <div className="flex flex-1 flex-col p-6">
            <BulkImportCard
              variant="panel"
              isUploading={isUploading}
              onUploadClick={() => fileInputRef.current?.click()}
              onDownloadSample={handleDownloadSample}
            />

            <div className="flex-grow" />

            <StickyActionBar variant="sidebar" isSaving={isSaving} disabled={addItemDisabled} onClick={handleAddItem} />
          </div>
        </div>

        {/* --- MOBILE FIXED FOOTER --- */}
        <StickyActionBar variant="mobile" isSaving={isSaving} disabled={addItemDisabled} onClick={handleAddItem} />

      </div>
    </div>
  );
};

export default ItemAdd;
