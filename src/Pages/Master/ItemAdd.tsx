import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { ItemGroup } from '../../constants/models';
import { CustomButton } from '../../Components';
import { Variant, State } from '../../enums';
import XLSX from 'xlsx-js-style';
import BarcodeScanner from '../../UseComponents/BarcodeScanner';
import { useAuth, useDatabase } from '../../context/auth-context';
import { Spinner } from '../../constants/Spinner';
import { Modal } from '../../constants/Modal';
import { useItemSettings } from '../../context/SettingsContext';
import { IconScanCircle } from '../../constants/Icons';
import { collection, query, where, getDocs, limit, doc, runTransaction, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import ExcelJS from 'exceljs';
import { db, storage } from '../../lib/Firebase';
import imageCompression from 'browser-image-compression';
import { InfoTooltip } from '../../Components/InfoToolTip';
import { VariantPicker } from '../../Components/VariantPicker';

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

const UNIT_OPTIONS = [
  { value: 'pcs', label: 'Pieces (1 pcs)' },
  { value: 'box', label: 'Box(10 pcs)' },
  { value: 'pkt', label: 'Packet (Custom)' },
  { value: 'doz', label: 'Dozen (12 pcs)' },
  { value: 'qt', label: 'Quintal(100 pcs)' },
  { value: 'ton', label: 'Ton(1000 pcs)' },
];

const DRAFT_STORAGE_KEY = 'sellar_item_add_draft';

const ItemAdd: React.FC<ItemAddProps> = ({
  theme = 'blue',
  routes = { itemAdd: '/item-add', itemGroup: '/item-group' }
}) => {
  const themeStyles = {
    blue: {
      primaryBg: 'bg-blue-600',
      primaryHover: 'hover:bg-blue-600',
      text: 'text-blue-500',
      textHover: 'hover:text-blue-700',
      border: 'border-blue-500',
      focusRing: 'focus:ring-blue-500',
      panelBg: 'bg-blue-50',
      panelBorder: 'border-blue-100',
      panelHeader: 'text-blue-800',
      panelSubText: 'text-blue-600',
      panelBtn: 'text-blue-600 border-blue-200 hover:bg-blue-50',
    },
    orange: {
      primaryBg: 'bg-[#F97316]',
      primaryHover: 'hover:bg-[#ea580c]',
      text: 'text-[#F97316]',
      textHover: 'hover:text-[#c2410c]',
      border: 'border-[#F97316]',
      focusRing: 'focus:ring-[#F97316]',
      panelBg: 'bg-[#F97316]/10',
      panelBorder: 'border-[#F97316]/20',
      panelHeader: 'text-[#ea580c]',
      panelSubText: 'text-[#F97316]',
      panelBtn: 'text-[#F97316] border-[#F97316]/20 hover:bg-[#F97316]/10',
    }
  };

  const activeTheme = themeStyles[theme];
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

  const fetchNextBarcode = async () => {
    if (!currentUser?.companyId || !itemSettings?.autoGenerateBarcode) return;

    const draft = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        if (parsed.itemBarcode) return;
      } catch (e) { }
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

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImageCompressing(true);
    try {
      const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1024, useWebWorker: true };
      const compressedFile = await imageCompression(file, options);
      setImageFile(compressedFile);
      setImagePreview(URL.createObjectURL(compressedFile));
    } catch (error) {
      setModal({ message: 'Failed to compress image.', type: State.ERROR });
    } finally {
      setIsImageCompressing(false);
    }
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

    const finalBarcode = itemBarcode.trim();
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

      // --- ADD THIS BLOCK BACK IN ---
      const images = worksheet.getImages();
      const rowImageMap = new Map<number, any>();
      for (const image of images) {
        const rowIndex = image.range.tl.row;
        const imgData = workbook.getImage(Number(image.imageId));
        rowImageMap.set(rowIndex, imgData);
      }
      // ------------------------------

      let headerRowNum = 1;
      for (let r = 1; r <= Math.min(worksheet.rowCount, 15); r++) {
        const firstCell = worksheet.getRow(r).getCell(1).text?.trim().toLowerCase();
        if (firstCell && (firstCell.includes('item name') || firstCell === 'name')) {
          headerRowNum = r;
          break;
        }
      }
      const dataStartRow = headerRowNum + 2;

      let processedCount = 0, createdCount = 0, updatedCount = 0, failedCount = 0, skippedCount = 0;
      let totalItems = 0;
      for (let r = dataStartRow; r <= worksheet.rowCount; r++) {
        if (worksheet.getRow(r).getCell(1).text?.trim()) totalItems++;
      }
      setUploadProgress({ current: 0, total: totalItems });

      // --- 1. Fetch Existing Groups & Items for Mapping ---
      let currentGroups = await dbOperations.getItemGroups();
      const groupMap = new Map<string, string>();
      currentGroups.forEach(g => groupMap.set(g.name.toLowerCase().trim(), g.id!));

      // CRITICAL FIX: Fetch all items to get their true Document IDs
      const allExistingItems = await dbOperations.syncItems();
      const itemMapByBarcode = new Map<string, any>();
      const itemMapByName = new Map<string, any>();

      allExistingItems.forEach(item => {
        if (item.barcode) itemMapByBarcode.set(item.barcode.trim(), item);
        if (item.name) itemMapByName.set(item.name.toLowerCase().trim(), item);
      });

      let nextSeqNumber = 0;
      if (importMode === 'create_update') {
        // Only reserve barcodes if we are actually creating items
        let needsBarcodeCount = 0;
        for (let r = dataStartRow; r <= worksheet.rowCount; r++) {
          if (!worksheet.getRow(r).getCell(2).text?.trim() && worksheet.getRow(r).getCell(1).text?.trim()) {
            needsBarcodeCount++;
          }
        }
        if (needsBarcodeCount > 0) nextSeqNumber = await reserveSequenceBlock(needsBarcodeCount);
      }

      // --- 2. Process Rows ---
      for (let rowNum = dataStartRow; rowNum <= worksheet.rowCount; rowNum++) {
        const row = worksheet.getRow(rowNum);

        // Helper to securely grab raw values regardless of cell formatting
        // Helper to securely grab raw values regardless of cell formatting
        const getVal = (colIdx: number) => {
          const val = row.getCell(colIdx).value;

          if (val === null || val === undefined) return "";

          // 1. Handle Excel Hyperlink objects (This fixes your [object Object] bug)
          if (typeof val === 'object' && 'hyperlink' in val) {
            // @ts-ignore - exceljs types can be finicky here
            return (val.hyperlink || val.text || "").toString().trim();
          }

          // 2. Handle Excel Rich Text objects (Just in case users copy-paste weirdly formatted text)
          if (typeof val === 'object' && 'richText' in val) {
            // @ts-ignore
            return val.richText.map((rt: any) => rt.text).join('').trim();
          }

          // 3. Handle standard strings and numbers
          return val.toString().trim();
        };

        const rawName = getVal(1);
        if (!rawName || rawName.toLowerCase().includes('full product name')) continue;

        await new Promise(resolve => setTimeout(resolve, 0));
        setUploadProgress({ current: processedCount + 1, total: totalItems });

        const rowBarcodeStr = getVal(2);
        const rowMRP = parseFloat(getVal(3)) || 0;
        const rowSale = parseFloat(getVal(4)) || 0;
        const rowPurchase = parseFloat(getVal(5)) || 0;
        const rowSaleDiscount = parseFloat(getVal(6)) || 0;
        const rowPurchaseDiscount = parseFloat(getVal(7)) || 0;
        const rowTax = parseFloat(getVal(8)) || 0;
        const rowHsn = getVal(9);
        const csvCategoryValue = getVal(10);
        const stockVal = parseInt(getVal(11)) || 0;
        const rowRestock = parseInt(getVal(12)) || 0;
        const rowMoq = parseInt(getVal(13)) || 1;
        const rowImageUrlStr = getVal(14);

        // Determine Category ID if needed
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

        // --- MATCHING LOGIC ---
        let existingItem = null;
        if (rowBarcodeStr && itemMapByBarcode.has(rowBarcodeStr)) {
          existingItem = itemMapByBarcode.get(rowBarcodeStr);
        } else if (itemMapByName.has(rawName.toLowerCase())) {
          existingItem = itemMapByName.get(rawName.toLowerCase());
        }

        // --- ADD IMAGE UPLOAD LOGIC BACK IN ---
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
            continue; // Skip if we are strictly updating and no match is found
          }

          // Selectively update fields based on user selection
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
          if (updateFields.discount) { updates.discount = rowSaleDiscount; updates.purchasediscount = rowPurchaseDiscount; }
          if (finalUploadedImageUrl) updates.imageUrl = finalUploadedImageUrl; // <-- ADD THIS
          if (updateFields.tax) updates.tax = rowTax;
          if (updateFields.hsnCode) updates.hsnSac = rowHsn;
          if (updateFields.restockQuantity) updates.restockQuantity = rowRestock;
          if (updateFields.moq) updates.moq = rowMoq;

          try {
            // CRITICAL FIX: Use the existing document ID
            await dbOperations.updateItem(existingItem.id, updates);
            updatedCount++;
          } catch (e) {
            failedCount++;
          }

        } else {
          // Mode: Create & Update All (Standard)
          let finalRowBarcode = rowBarcodeStr;

          if (!existingItem && !finalRowBarcode) {
            finalRowBarcode = String(nextSeqNumber);
            nextSeqNumber++;
          } else if (existingItem) {
            finalRowBarcode = existingItem.barcode; // Persist the barcode if updating
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
              // CRITICAL FIX: Use the true document ID to update
              await dbOperations.updateItem(existingItem.id, itemData);
              updatedCount++;
            } else {
              // Create completely new item, forcing the document ID to match the barcode for new items
              await dbOperations.createItem(itemData, finalRowBarcode);
              createdCount++;
            }
          } catch (e) {
            failedCount++;
          }
        }
        processedCount++;
      }

      await fetchGroups();
      await fetchNextBarcode(); // Refresh UI Counter

      if (failedCount > 0) {
        setModal({ message: `Imported with errors. ${failedCount} rows failed.`, type: State.ERROR });
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

  const reqClasses = " after:content-['*'] after:ml-0.5 after:text-red-500";
  if (pageIsLoading) return <Spinner />;

  const renderHeader = () => (
    <div className="fixed top-0 left-0 right-0 z-10 p-4 bg-gray-100 border-b border-gray-300 flex flex-col md:static md:flex-row md:justify-between md:items-center md:p-3 md:bg-white md:shadow-sm">
      <h1 className="text-2xl font-bold text-gray-800 text-center mb-4 md:mb-0 md:text-left">
        Add Item
      </h1>
      <div className="flex items-center justify-center gap-6">
        <CustomButton variant={Variant.Transparent} onClick={() => navigate(routes.itemAdd)} active={isActive(routes.itemAdd)}>Add Item</CustomButton>
        <CustomButton variant={Variant.Transparent} onClick={() => navigate(routes.itemGroup)} active={isActive(routes.itemGroup)}>Item Groups</CustomButton>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen w-full bg-gray-100 font-poppins text-gray-800 overflow-hidden relative">
      <BarcodeScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleBarcodeScanned} />
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

      {uploadProgress && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-8 rounded-sm shadow-xl w-80 text-center">
            <h3 className="text-lg font-bold mb-4 text-gray-800">Uploading Items...</h3>
            <div className="w-full bg-gray-200 rounded-sm h-4 mb-2 overflow-hidden">
              <div
                className={`${activeTheme.primaryBg} h-4 rounded-sm transition-all duration-100`}
                style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
              ></div>
            </div>
            <p className="text-sm text-gray-600 font-mono">
              {uploadProgress.current} / {uploadProgress.total} processed
            </p>
          </div>
        </div>
      )}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 flex flex-col">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Bulk Import Settings</h2>

            <div className="mb-6 space-y-3">
              <label className="flex items-start gap-3 p-3 border rounded-md cursor-pointer hover:bg-gray-50 transition-colors">
                <input type="radio" name="mode" className="mt-1 w-4 h-4 text-sky-500" checked={importMode === 'create_update'} onChange={() => setImportMode('create_update')} />
                <div>
                  <span className="block font-semibold text-gray-800">Add New & Update All</span>
                  <span className="text-xs text-gray-500">Creates new items if they don't exist. Fully updates existing items.</span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 border rounded-md cursor-pointer hover:bg-gray-50 transition-colors">
                <input type="radio" name="mode" className="mt-1 w-4 h-4 text-sky-500" checked={importMode === 'update_only'} onChange={() => setImportMode('update_only')} />
                <div>
                  <span className="block font-semibold text-gray-800">Update Existing Inventory Only</span>
                  <span className="text-xs text-gray-500">Skips new items. Matches by Barcode or Name. Select which fields to update below.</span>
                </div>
              </label>
            </div>

            {importMode === 'update_only' && (
              <div className="mb-6 bg-gray-50 p-4 rounded-md border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Fields to Update</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {Object.entries(updateFields).map(([key, value]) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="rounded text-sky-500 focus:ring-sky-500"
                        checked={value}
                        onChange={(e) => setUpdateFields(prev => ({ ...prev, [key]: e.target.checked }))}
                      />
                      <span className="capitalize text-gray-700">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-auto">
              <button onClick={() => { setShowImportModal(false); setPendingFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-sm hover:bg-gray-200">Cancel</button>
              <button onClick={executeImport} className={`px-6 py-2 text-sm font-bold text-white ${activeTheme.primaryBg} rounded-sm hover:${activeTheme.primaryBg}`}>Start Import</button>
            </div>
          </div>
        </div>
      )}

      {renderHeader()}

      <div className="flex-1 flex flex-col md:flex-row relative min-h-0">

        {/* LEFT PANEL */}
        <div className="flex-1 h-full overflow-y-auto w-full md:w-[65%] bg-gray-100 md:bg-gray-50 md:border-r border-gray-200 pt-24 pb-10 px-4 md:pt-6 md:px-6 md:pb-6">

          {error && <div className="mb-4 text-center p-3 bg-red-100 text-red-700 rounded-sm">{error}</div>}

          <div className="md:hidden bg-white p-2 rounded-sm shadow-md mb-4 mt-4">
            <div className="flex flex-col items-center justify-center mb-4">
              <h2 className="text-lg font-semibold text-gray-700 mb-2">Bulk Import</h2>
              <input type="file" ref={fileInputRef} onChange={handleFileSelected} className="hidden" accept=".xlsx, .xls, .csv" />
              <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className={`w-full max-w-xs ${activeTheme.primaryBg} text-white py-2 px-4 rounded-sm ${activeTheme.primaryHover} disabled:bg-gray-400 flex items-center justify-center gap-2`}>
                {isUploading ? <Spinner /> : 'Import from Excel'}
              </button>
              <button type="button" onClick={handleDownloadSample} disabled={isUploading} className={`w-full max-w-xs bg-white ${activeTheme.text} border ${activeTheme.border} py-2 px-4 rounded-sm mt-4 hover:bg-gray-50`}>
                Download Sample
              </button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-sm shadow-md md:mb-0 md:rounded-sm md:shadow-sm md:border md:border-gray-200 mb-10">
            {success && (
              <div ref={successBannerRef} className="mb-4 p-3 bg-green-100 text-green-700 rounded-sm flex items-center justify-between gap-2">
                <span className="flex-1 text-center">{success}</span>
                <button onClick={() => setSuccess(null)} className="text-green-600 hover:text-green-900 font-bold text-lg leading-none shrink-0">✕</button>
              </div>
            )}

            <h2 className="text-lg font-bold text-gray-800 mb-4 md:mb-6 md:border-b md:pb-2">Add a Single Item</h2>

            <div className="mb-6 flex flex-col md:flex-row gap-4 items-start">
              <div className="w-32 h-32 flex-shrink-0 border-2 border-dashed border-gray-300 rounded-lg overflow-hidden bg-gray-50 flex items-center justify-center relative cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => imageInputRef.current?.click()}>
                {isImageCompressing ? (
                  <div className="flex flex-col items-center"><Spinner /><span className="text-[10px] mt-2 text-gray-500">Compressing...</span></div>
                ) : imagePreview ? (
                  <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs text-gray-400 text-center px-2">Click to add<br />Image</span>
                )}
                <input type="file" accept="image/*" ref={imageInputRef} onChange={handleImageChange} className="hidden" />
              </div>
              <div className="flex-1 w-full space-y-2">
                <div className="flex flex-col">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Or paste Image URL</label>
                  <input type="text" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} disabled={!!imageFile} className={`w-full p-3 border border-gray-300 rounded-sm ${activeTheme.focusRing} outline-none disabled:bg-gray-100 disabled:text-gray-400`} placeholder="https://example.com/image.jpg" />
                </div>
                {imageFile && <button onClick={() => { setImageFile(null); setImagePreview(null); if (imageInputRef.current) imageInputRef.current.value = ''; }} className="text-xs text-red-500 hover:underline">Remove Selected Image</button>}
              </div>
            </div>

            <div className="space-y-4">

              {/* --- Name Row (Full Width) --- */}
              <div>
                <div className="flex items-center mb-1">
                  <label className="text-sm font-medium leading-none block after:content-['*'] after:ml-0.5 after:text-red-500 mr-2">Item Name</label>
                  <InfoTooltip text="The name of the product being added." />
                </div>
                <input type="text" value={itemName} onChange={(e) => setItemName(e.target.value)} className="flex h-10 w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50" placeholder="e.g. Apple" />
              </div>



              {/* --- MRP & Category Row --- */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center mb-1">
                    <label className="text-sm font-medium leading-none block mr-2">{`MRP (${getUnitLabel()})`}</label>
                    <InfoTooltip text="Maximum Retail Price printed on the product." />
                  </div>
                  <input type="number" value={itemMRP} onWheel={(e) => (e.target as HTMLInputElement).blur()} onChange={(e) => setItemMRP(e.target.value)} className="flex h-10 w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500" placeholder="0.00" />
                  <p className="text-[10px] text-gray-400 mt-1">Required if Sale Price is empty</p>
                </div>
                {/* --- Barcode --- */}
                <div>
                  <div className="flex items-center mb-1">
                    <label className={`text-sm font-medium leading-none block ${itemSettings?.requireBarcode ? reqClasses : ''} mr-2`}>Barcode</label>
                    <InfoTooltip text="Unique identifier for scanning the product." />
                  </div>
                  <div className="flex gap-2">
                    <input type="text" value={itemBarcode} onChange={(e) => setItemBarcode(e.target.value)} className="flex h-10 w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50" placeholder="Scan or Type" />
                    <button type="button" onClick={() => setIsScannerOpen(true)} className="bg-gray-700 text-white px-4 rounded-sm flex items-center justify-center h-10"><IconScanCircle width={20} height={20} /></button>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">This is the next available number. You can change it if needed.</p>
                </div>

              </div>

              {/* --- Sales Price & Purchase Price Row --- */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center mb-1">
                    <label className="text-sm font-medium leading-none block after:content-['*'] after:text-red-500 mr-2">{`Sales Price (${getUnitLabel()})`}</label>
                    <InfoTooltip text="The price you are selling this item for." />
                  </div>
                  <input type="number" value={itemSalesPrice} onWheel={(e) => (e.target as HTMLInputElement).blur()} onChange={(e) => setItemSalesPrice(e.target.value)} className="flex h-10 w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500" placeholder="0.00" />
                  <p className="text-[10px] text-gray-400 mt-1">Required if MRP is empty</p>
                </div>
                <div>
                  <div className="flex items-center mb-1">
                    <label className={`text-sm font-medium leading-none block ${itemSettings?.requirePurchasePrice ? reqClasses : ''} mr-2`}>Purchase Price</label>
                    <InfoTooltip text="The price you paid to acquire this item." />
                  </div>
                  <input type="number" value={itemPurchasePrice} onChange={(e) => setItemPurchasePrice(e.target.value)} className="flex h-10 w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500" placeholder="0.00" />
                </div>
              </div>

              {/* --- Sale Disc & Purchase Disc Row --- */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center mb-1">
                    <label className={`text-sm font-medium leading-none block ${itemSettings?.requireSaleDiscount ? reqClasses : ''} mr-2`}>Sale Disc (%)</label>
                    <InfoTooltip text="Default discount percentage given to customers." />
                  </div>
                  <input type="number" value={itemDiscount} onWheel={(e) => (e.target as HTMLInputElement).blur()} onChange={(e) => setItemDiscount(e.target.value)} className="flex h-10 w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500" placeholder="0" />
                </div>
                <div>
                  <div className="flex items-center mb-1">
                    <label className={`text-sm font-medium leading-none block ${itemSettings?.requirePurchaseDiscount ? reqClasses : ''} mr-2`}>Purchase Disc (%)</label>
                    <InfoTooltip text="Discount percentage received from the supplier." />
                  </div>
                  <input type="number" value={PurchaseDiscount} onWheel={(e) => (e.target as HTMLInputElement).blur()} onChange={(e) => setPurchaseDiscount(e.target.value)} className="flex h-10 w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500" placeholder="0" />
                </div>
              </div>

              {/* --- Tax & HSN Code Row --- */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center mb-1">
                    <label className={`text-sm font-medium leading-none block ${itemSettings?.requireTax ? reqClasses : ''} mr-2`}>Tax (%)</label>
                    <InfoTooltip text="Applicable tax percentage for this item." />
                  </div>
                  <input type="number" value={itemTax} onChange={(e) => setItemTax(e.target.value)} className="flex h-10 w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500" placeholder="0" />
                </div>
                <div>
                  <div className="flex items-center mb-1">
                    <label className="text-sm font-medium leading-none block mr-2">HSN Code</label>
                    <InfoTooltip text="Harmonized System Nomenclature code for taxation." />
                  </div>
                  <input type="text" value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} className="flex h-10 w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500" placeholder="e.g. 123456" />
                </div>
              </div>

              {/* --- Stock & Restock Level Row --- */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center mb-1">
                    <label className="text-sm font-medium leading-none block mr-2">Stock</label>
                    <InfoTooltip text="Current available quantity in your inventory." />
                  </div>
                  <input type="number" value={itemAmount} onWheel={(e) => (e.target as HTMLInputElement).blur()} onChange={(e) => setItemAmount(e.target.value)} className="flex h-10 w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500" placeholder="0" />
                </div>
                <div>
                  <div className="flex items-center mb-1">
                    <label className={`text-sm font-medium leading-none block ${itemSettings?.requireRestockQuantity ? reqClasses : ''} mr-2`}>Restock Level</label>
                    <InfoTooltip text="Minimum stock level to trigger a reorder alert." />
                  </div>
                  <input type="number" onWheel={(e) => (e.target as HTMLInputElement).blur()} value={restockQuantity} onChange={(e) => setRestockQuantity(e.target.value)} className="flex h-10 w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500" placeholder="0" />
                </div>
              </div>

              {/* --- MOQ & Unit Row --- */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center mb-1">
                    <label className="text-sm font-medium leading-none block mr-2">MOQ</label>
                    <InfoTooltip text="Minimum Item Quantity to be ordered." />
                  </div>
                  <input type="number" value={moq} onWheel={(e) => (e.target as HTMLInputElement).blur()} onChange={(e) => setMoq(e.target.value)} className="flex h-10 w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500" placeholder="1" />
                </div>
                <div>
                  <div className="flex items-center mb-1">
                    <label className={`text-sm font-medium leading-none block ${(itemSettings as any)?.requireUnit ? reqClasses : ''} mr-2`}>Unit</label>
                    <InfoTooltip text="Measurement unit (e.g., pieces, box, kg)." />
                  </div>
                  <div className="flex gap-2">
                    <select value={itemUnit} onChange={(e) => { setItemUnit(e.target.value); if (e.target.value !== 'pkt') setPacketSize(''); }} className={`flex h-10 rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${itemUnit === 'pkt' ? 'w-1/2' : 'w-full'}`}>
                      {UNIT_OPTIONS.filter(u => u.value !== '').map(unit => (<option key={unit.value} value={unit.value}>{unit.label}</option>))}
                    </select>
                    {itemUnit === 'pkt' && (<input type="number" value={packetSize} onChange={(e) => setPacketSize(e.target.value)} className="flex h-10 w-1/2 rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500" placeholder="Qty per pkt" min="1" />)}
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-center mb-1">
                  <label className={`text-sm font-medium text-gray-600 ${(itemSettings as any)?.requireCategory ? reqClasses : ''} mr-2`}>
                    Category
                  </label>
                  <InfoTooltip text="Select a primary category. Add more as catalogue-only tags below." />
                </div>
              
                {/* Primary category dropdown — always visible */}
                <select
                  value={selectedCategories[0] || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'ADD_NEW_GROUP') { navigate(routes.itemGroup); return; }
                    setSelectedCategories(prev => {
                      const rest = prev.slice(1); // keep extra categories
                      return val ? [val, ...rest] : rest;
                    });
                  }}
                  className={`flex h-10 w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500`}
                >
                  <option value="">Select category</option>
                  <option value="ADD_NEW_GROUP" className="font-semibold bg-gray-100">+ Add New Group</option>
                  {itemGroups.map(g => (
                    <option key={g.id} value={g.id!}>{g.name}</option>
                  ))}
                </select>

                {/* Extra categories as "Catalogue only" chips */}
                {selectedCategories.length > 1 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedCategories.slice(1).map((catId) => {
                      const group = itemGroups.find(g => g.id === catId);
                      if (!group) return null;
                      return (
                        <span key={catId} className={`inline-flex items-center gap-1 ${activeTheme.panelBg} border ${activeTheme.panelBorder} ${activeTheme.panelHeader} text-xs px-2 py-1 rounded-full`}>
                          {group.name}
                          <button
                            type="button"
                            onClick={() => setSelectedCategories(prev => prev.filter(id => id !== catId))}
                            className={`ml-1 ${activeTheme.panelSubText} hover:text-red-500 font-bold leading-none`}
                          >×</button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Add more category link */}
                {!showCategoryDropdown ? (
                  <button
                    type="button"
                    onClick={() => setShowCategoryDropdown(true)}
                    className={`mt-2 text-sm ${activeTheme.text} hover:underline`}
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
                        if (val === 'ADD_NEW_GROUP') { navigate(routes.itemGroup); return; }
                        if (!selectedCategories.includes(val)) {
                          setSelectedCategories(prev => [...prev, val]);
                        }
                        setShowCategoryDropdown(false);
                      }}
                      className={`flex-1 min-w-0 p-2 border border-gray-300 rounded-sm bg-white text-sm ${activeTheme.focusRing}`}
                    >
                      <option value="">Add more</option>
                      <option value="ADD_NEW_GROUP" className="font-semibold bg-gray-100">+ Add New Group</option>
                      {itemGroups
                        .filter(g => !selectedCategories.includes(g.id!))
                        .map(g => (<option key={g.id} value={g.id!}>{g.name}</option>))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowCategoryDropdown(false)}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >Cancel</button>
                  </div>
                )}
              </div>
              {/* --- Variants --- */}
              <div>
                <div className="flex items-center mb-1">
                  <label className="text-sm font-medium leading-none block mr-2">Variants</label>
                  <InfoTooltip text="Link other items as variants (e.g. different sizes or colors)." />
                </div>
                <VariantPicker
                  allItems={allItems}
                  selectedIds={itemVariants}
                  currentItemBarcode={itemBarcode}
                  onChange={setItemVariants}
                  activeTheme={activeTheme}
                />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: Sticky Sidebar on Desktop */}
        <div className="hidden md:flex w-[35%] flex-col bg-white h-full relative border-l border-gray-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10">
          <div className="flex-1 p-6 flex flex-col">
            <div className={`${activeTheme.panelBg} rounded-sm p-5 border ${activeTheme.panelBorder}`}>
              <h2 className={`text-lg font-bold ${activeTheme.panelHeader} mb-2`}>Bulk Import</h2>
              <p className={`text-sm ${activeTheme.panelSubText} mb-4`}>
                Upload Excel/CSV. Missing categories created automatically. You can embed images into rows.
              </p>
              <div className="flex flex-col gap-3">
                <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className={`w-full bg-white ${activeTheme.panelBtn} border py-3 px-4 rounded-sm font-semibold disabled:bg-gray-100 flex items-center justify-center gap-2 transition-colors`}>
                  {isUploading ? <Spinner /> : 'Upload Excel File'}
                </button>
                <button type="button" onClick={handleDownloadSample} disabled={isUploading} className={`text-sm ${activeTheme.text} ${activeTheme.textHover} underline text-center`}>
                  Download Sample Template
                </button>
              </div>
            </div>

            <div className="flex-grow"></div>

            <div className="border-t border-gray-100 pb-10">
              <button onClick={handleAddItem} disabled={isSaving || pageIsLoading || (loading && itemGroups.length === 0)} className={`w-full ${activeTheme.primaryBg} text-white py-4 px-6 rounded-sm text-lg font-bold ${activeTheme.primaryHover} disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98]`}>
                {isSaving ? <Spinner /> : 'Add Item'}
              </button>
            </div>
          </div>
        </div>

        {/* --- MOBILE FIXED FOOTER --- */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-transparent z-20 flex justify-center pb-20 pointer-events-none">
          <button onClick={handleAddItem} disabled={isSaving || pageIsLoading || (loading && itemGroups.length === 0)} className={`pointer-events-auto w-48 max-w-sm ${activeTheme.primaryBg} text-white py-3 px-6 rounded-sm text-lg font-semibold ${activeTheme.primaryHover} disabled:bg-gray-400 flex items-center justify-center gap-2 shadow-xl shadow-gray-400/50`}>
            {isSaving ? <Spinner /> : 'Add Item'}
          </button>
        </div>

      </div>
    </div>
  );
};

export default ItemAdd;