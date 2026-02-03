import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { ItemGroup } from '../../constants/models';
import { ROUTES } from '../../constants/routes.constants';
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
import { db } from '../../lib/Firebase';

const ItemAdd: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dbOperations = useDatabase();
  const { currentUser, loading: authLoading } = useAuth();
  const { itemSettings, loadingSettings: loadingItemSettings } = useItemSettings();

  // --- STATE ---
  const [itemName, setItemName] = useState<string>('');
  const [itemMRP, setItemMRP] = useState<string>('');
  const [itemSalesPrice, setItemSalesPrice] = useState<string>('');
  const [itemPurchasePrice, setItemPurchasePrice] = useState<string>('');
  const [itemDiscount, setItemDiscount] = useState<string>('');
  const [PurchaseDiscount, setPurchaseDiscount] = useState<string>('');
  const [itemTax, setItemTax] = useState<string>('');
  const [itemAmount, setItemAmount] = useState<string>('');
  const [restockQuantity, setRestockQuantity] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [itemBarcode, setItemBarcode] = useState<string>('');
  const [hsnCode, setHsnCode] = useState<string>('');

  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [pageIsLoading, setPageIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);

  // --- UPLOAD STATE ---
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPageIsLoading(authLoading || loadingItemSettings || !dbOperations);
  }, [authLoading, loadingItemSettings, dbOperations]);

  const isActive = (path: string) => location.pathname === path;

  // --- 1. Fetch Categories ---
  const fetchGroups = async () => {
    if (!dbOperations) return;
    try {
      setLoading(true);
      const groups = await dbOperations.getItemGroups();
      setItemGroups(groups);

      if (groups.length > 0 && !selectedCategory) {
        setSelectedCategory(groups[0].id!);
      } else if (groups.length === 0) {
        setSelectedCategory('');
      }
    } catch (err) {
      console.error('Failed to fetch item groups:', err);
      setError('Failed to load item categories.');
    } finally {
      setLoading(false);
    }
  };

  // --- 2. Fetch Suggested Barcode (Peek Logic) ---
  const fetchNextBarcode = async () => {
    if (!currentUser?.companyId) return;
    try {
      const counterRef = doc(db, 'companies', currentUser.companyId, 'counters', 'items');
      const snap = await getDoc(counterRef);
      let nextSeq = 1001; // Default start
      if (snap.exists()) {
        nextSeq = (snap.data().currentSequence || 1000) + 1;
      }
      setItemBarcode(String(nextSeq));
    } catch (e) {
      console.error("Failed to fetch next barcode", e);
    }
  };

  useEffect(() => {
    if (dbOperations && currentUser) {
      fetchGroups();
      fetchNextBarcode();
    }
  }, [dbOperations, currentUser]);

  const resetForm = () => {
    setItemName('');
    setItemMRP('');
    setItemSalesPrice('');
    setItemPurchasePrice('');
    setItemDiscount('');
    setPurchaseDiscount('');
    setItemTax('');
    setItemAmount('');
    fetchNextBarcode();
    setRestockQuantity('');
    setHsnCode('');
    setSelectedCategory(itemGroups.length > 0 ? itemGroups[0].id! : '');
  };

  // --- HELPER: Transactional Sequence for Bulk Uploads ---
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
        return lastSeq + 1; // Return the first usable number
      });
    } catch (e) {
      return Date.now();
    }
  };

  const handleAddItem = async () => {
    if (!dbOperations || !currentUser || !itemSettings) {
      setModal({ message: 'App not ready.', type: State.ERROR }); return;
    }
    setError(null); setSuccess(null); setModal(null);

    // --- 1. Basic Field Validation ---
    if (!itemName.trim() || !selectedCategory || !itemAmount.trim()) {
      setModal({ message: 'Item Name, Stock Amount, and Category are required.', type: State.ERROR }); return;
    }

    if (!itemBarcode.trim()) {
      setModal({ message: 'Barcode is required.', type: State.ERROR }); return;
    }

    // --- 2. Price Logic Validation ---
    const mrpValue = parseFloat(itemMRP) || 0;
    const saleValue = parseFloat(itemSalesPrice) || 0;
    const purchaseValue = parseFloat(itemPurchasePrice) || 0;

    if (mrpValue === 0 && saleValue === 0) {
      setModal({ message: 'Please enter either MRP or Sales Price.', type: State.ERROR }); return;
    }

    // --- 3. Discount Logic ---
    let finalSaleDiscount = parseFloat(itemDiscount) || 0;
    if (mrpValue > 0 && saleValue > 0) {
      finalSaleDiscount = 0;
    }

    let finalPurchaseDiscount = parseFloat(PurchaseDiscount) || 0;
    if (mrpValue > 0 && purchaseValue > 0) {
      finalPurchaseDiscount = 0;
    }

    const finalBarcode = itemBarcode.trim();

    setIsSaving(true);
    try {
      // Check for Duplicate Barcode
      const itemsRef = collection(db, 'companies', currentUser.companyId, 'items');
      const q = query(itemsRef, where('barcode', '==', finalBarcode), limit(1));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        setModal({ message: `Barcode ${finalBarcode} already exists.`, type: State.ERROR });
        setIsSaving(false);
        return;
      }

      const customDocId = finalBarcode;
      const newItemData: any = {
        name: itemName.trim(),
        mrp: mrpValue,
        salesPrice: saleValue,
        purchasePrice: purchaseValue,
        discount: finalSaleDiscount,
        purchasediscount: finalPurchaseDiscount,
        tax: parseFloat(itemTax) || 0,
        hsnSac: hsnCode.trim(),
        itemGroupId: selectedCategory,
        stock: parseInt(itemAmount, 10) || 0,
        amount: parseInt(itemAmount, 10) || 0,
        barcode: finalBarcode,
        restockQuantity: parseInt(restockQuantity, 10) || 0,
      };

      await dbOperations.createItem(newItemData, customDocId);

      // Update Counter if numeric
      const barcodeNum = parseInt(finalBarcode, 10);
      if (!isNaN(barcodeNum)) {
        const counterRef = doc(db, 'companies', currentUser.companyId, 'counters', 'items');
        await runTransaction(db, async (transaction) => {
          const counterDoc = await transaction.get(counterRef);
          const currentDBSeq = counterDoc.exists() ? (counterDoc.data().currentSequence || 1000) : 1000;
          if (barcodeNum > currentDBSeq) {
            transaction.set(counterRef, { currentSequence: barcodeNum }, { merge: true });
          }
        });
      }

      setSuccess(`Item "${itemName}" added!`);
      resetForm();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError('Failed to add item.');
      setModal({ message: err.message, type: State.ERROR });
    } finally {
      setIsSaving(false);
    }
  };

  // --- BULK UPLOAD ---
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !dbOperations || !currentUser || !itemSettings || !currentUser.companyId) return;

    setIsUploading(true);
    setUploadProgress(null);
    setError(null); setSuccess(null); setModal(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: null });

        if (rawJson.length === 0) throw new Error("File empty.");

        let processedCount = 0;
        let createdCount = 0;
        let updatedCount = 0;
        let failedCount = 0; // Simple counter for errors

        const totalItems = rawJson.length;
        setUploadProgress({ current: 0, total: totalItems });

        // --- PREP CATEGORIES ---
        let currentGroups = await dbOperations.getItemGroups();
        const groupMap = new Map<string, string>();
        currentGroups.forEach(g => groupMap.set(g.name.toLowerCase().trim(), g.id!));

        // --- PREP SEQUENTIAL BARCODES ---
        const itemsNeedingBarcode = rawJson.filter((row: any) => !row.barcode && !row.Barcode).length;
        let nextSeqNumber = 0;

        if (itemsNeedingBarcode > 0) {
          nextSeqNumber = await reserveSequenceBlock(itemsNeedingBarcode);
        }

        for (let i = 0; i < rawJson.length; i++) {
          await new Promise(resolve => setTimeout(resolve, 0));
          setUploadProgress({ current: i + 1, total: totalItems });

          const rawRow = rawJson[i];
          const row: any = {};

          Object.keys(rawRow).forEach(k => {
            const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, "");
            row[cleanKey] = rawRow[k];
          });

          const csvCategoryValue = String(
            row.itemgroupid || row.itemgroup || row.category || row.group || row.categoryname || "General"
          ).trim();

          const categoryLower = csvCategoryValue.toLowerCase();
          let targetGroupId = "";

          if (groupMap.has(categoryLower)) {
            targetGroupId = groupMap.get(categoryLower)!;
          } else {
            try {
              const newGroupData: any = {
                name: csvCategoryValue,
                description: 'Auto-created via Bulk Import'
              };
              const newGroupId = await dbOperations.createItemGroup(newGroupData);
              if (newGroupId && typeof newGroupId === 'string') {
                groupMap.set(categoryLower, newGroupId);
                targetGroupId = newGroupId;
              } else {
                throw new Error("Created group did not return a valid ID");
              }
            } catch (grpErr) {
              if (selectedCategory) targetGroupId = selectedCategory;
            }
          }

          // --- BULK VALIDATION LOGIC ---
          // 1. Check Name
          if (!row.name) {
            failedCount++;
            continue;
          }

          const rowMRP = parseFloat(String(row.mrp ?? row.MRP ?? 0));
          const rowSale = parseFloat(String(row.salesprice ?? row.sellingprice ?? 0));
          const rowPurchase = parseFloat(String(row.purchaseprice ?? row.purchasePrice ?? row.PurchasePrice ?? 0));

          // 2. Check Price (Either MRP or Sale Price required)
          if (rowMRP === 0 && rowSale === 0) {
            failedCount++;
            continue;
          }

          // 3. Sale Discount Logic
          let rowSaleDiscount = parseFloat(String(row.discount ?? row.salediscount ?? row.salesdiscount ?? row.saledisc ?? 0));
          if (rowMRP > 0 && rowSale > 0) {
            rowSaleDiscount = 0;
          }

          // 4. Purchase Discount Logic
          let rowPurchaseDiscount = parseFloat(String(row.purchasediscount ?? 0));
          if (rowMRP > 0 && rowPurchase > 0) {
            rowPurchaseDiscount = 0;
          }

          try {
            const stockVal = parseInt(String(row.stock ?? row.amount ?? row.qty ?? row.quantity ?? 0), 10);

            let rowBarcode = String(row.barcode || '').trim();
            const rowHsn = String(row.hsn || row.hsncode || row.sac || row.hsnsac || '').trim();

            if (!rowBarcode) {
              rowBarcode = String(nextSeqNumber);
              nextSeqNumber++;
            }

            const itemData: any = {
              name: String(row.name).trim(),
              mrp: rowMRP,
              salesPrice: rowSale,
              purchasePrice: rowPurchase,
              discount: rowSaleDiscount,
              purchasediscount: rowPurchaseDiscount,
              tax: parseFloat(String(row.tax ?? 0)),
              hsnSac: rowHsn,
              itemGroupId: targetGroupId,
              stock: stockVal,
              amount: stockVal,
              barcode: rowBarcode,
              restockQuantity: parseInt(String(row.restockquantity ?? 0), 10),
              taxRate: parseFloat(String(row.tax ?? 0)),
            };

            let isUpdate = false;
            const itemsRef = collection(db, 'companies', currentUser.companyId, 'items');
            const q = query(itemsRef, where('barcode', '==', rowBarcode), limit(1));
            const snapshot = await getDocs(q);
            if (!snapshot.empty) isUpdate = true;

            await dbOperations.createItem(itemData, rowBarcode);

            if (isUpdate) updatedCount++;
            else createdCount++;

            processedCount++;
          } catch (e: any) {
            failedCount++;
          }
        }

        await fetchGroups();

        if (failedCount > 0) {
          setModal({
            message: `Error in ${failedCount} entries. Please check for missing required fields (Item Name, Sale Price, MRP, Stock, Barcode) or invalid data.`,
            type: State.ERROR
          });
        } else {
          setSuccess(`Imported: ${createdCount} New, ${updatedCount} Updated.`);
        }

        setTimeout(() => setSuccess(null), 5000);

      } catch (err: any) {
        console.error(err);
        setError("File processing failed.");
      } finally {
        setIsUploading(false);
        setUploadProgress(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleBarcodeScanned = (barcode: string) => {
    setItemBarcode(barcode);
    setIsScannerOpen(false);
  };

  const handleDownloadSample = () => {
    const sampleData = [
      {
        name: 'Apple',
        mrp: 100,
        salesPrice: 95,
        purchasePrice: 80,
        'Sale Discount': 0,
        purchasediscount: 0,
        tax: 0,
        hsnCode: '080810',
        itemGroupId: 'Fruits',
        stock: 50,
        barcode: '1001',
        restockQuantity: 10
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    const mandatoryCols = [0, 9, 10]; // Name, Stock, Barcode
    mandatoryCols.forEach((colIndex) => {
      const cellAddress = XLSX.utils.encode_col(colIndex) + "1";
      if (ws[cellAddress]) {
        ws[cellAddress].s = {
          font: { bold: true, color: { rgb: "FF0000" } },
          fill: { fgColor: { rgb: "FEE2E2" } },
          alignment: { horizontal: "center" }
        };
      }
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Items');
    XLSX.writeFile(wb, 'Sellar_Items_Sample.xlsx');
  };

  if (pageIsLoading) return <Spinner />;

  const renderHeader = () => (
    <div className="fixed top-0 left-0 right-0 z-10 p-4 bg-gray-100 border-b border-gray-300 flex flex-col md:static md:flex-row md:justify-between md:items-center md:p-3 md:bg-white md:shadow-sm">
      <h1 className="text-2xl font-bold text-gray-800 text-center mb-4 md:mb-0 md:text-left">
        Add Item
      </h1>
      <div className="flex items-center justify-center gap-6">
        <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.ITEM_ADD)} active={isActive(ROUTES.ITEM_ADD)}>Item Add</CustomButton>
        <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.ITEM_GROUP)} active={isActive(ROUTES.ITEM_GROUP)}>Item Groups</CustomButton>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen w-full bg-gray-100 font-poppins text-gray-800 relative">
      <BarcodeScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleBarcodeScanned} />
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

      {/* --- PROGRESS MODAL --- */}
      {uploadProgress && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-8 rounded-lg shadow-xl w-80 text-center">
            <h3 className="text-lg font-bold mb-4 text-gray-800">Uploading Items...</h3>
            <div className="w-full bg-gray-200 rounded-full h-4 mb-2 overflow-hidden">
              <div
                className="bg-sky-500 h-4 rounded-full transition-all duration-100"
                style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
              ></div>
            </div>
            <p className="text-sm text-gray-600 font-mono">
              {uploadProgress.current} / {uploadProgress.total} processed
            </p>
            <p className="text-xs text-gray-400 mt-2">Please do not close this window.</p>
          </div>
        </div>
      )}

      {renderHeader()}

      <div className="flex-1 flex flex-col md:flex-row relative">

        {/* LEFT PANEL */}
        <div className="flex-1 w-full md:w-[65%] bg-gray-100 md:bg-gray-50 md:border-r border-gray-200 pt-28 pb-24 px-2 md:pt-6 md:px-6 md:pb-6 overflow-y-auto">

          {error && <div className="mb-4 text-center p-3 bg-red-100 text-red-700 rounded-lg">{error}</div>}
          {success && <div className="mb-4 text-center p-3 bg-green-100 text-green-700 rounded-lg">{success}</div>}

          {/* MOBILE BULK IMPORT */}
          <div className="md:hidden bg-white p-2 rounded-sm shadow-md mb-4">
            <div className="flex flex-col items-center justify-center mb-4">
              <h2 className="text-lg font-semibold text-gray-700 mb-2">Bulk Import</h2>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".xlsx, .xls, .csv" />
              <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="w-full max-w-xs bg-sky-500 text-white py-2 px-4 rounded-sm hover:bg-sky-600 disabled:bg-gray-400 flex items-center justify-center gap-2">
                {isUploading ? <Spinner /> : 'Import from Excel'}
              </button>
              <button type="button" onClick={handleDownloadSample} disabled={isUploading} className="w-full max-w-xs bg-white text-sky-500 border border-sky-500 py-2 px-4 rounded-sm mt-4 hover:bg-sky-50">
                Download Sample
              </button>
            </div>
          </div>

          {/* SINGLE ITEM FORM */}
          <div className="bg-white p-6 rounded-lg shadow-md md:mb-0 md:rounded-sm md:shadow-sm md:border md:border-gray-200 mb-10">
            <h2 className="text-lg font-bold text-gray-800 mb-4 md:mb-6 md:border-b md:pb-2">Add a Single Item</h2>
            <div className="space-y-4">

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1 after:content-['*'] after:ml-0.5 after:text-red-500">Item Name</label>
                <input type="text" value={itemName} onChange={(e) => setItemName(e.target.value)} className="w-full p-3 border border-gray-300 rounded-sm focus:ring-sky-500 outline-none" placeholder="e.g. Apple" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1 after:content-['*'] after:ml-0.5 after:text-red-500">Barcode</label>
                <div className="flex gap-2">
                  <input type="text" value={itemBarcode} onChange={(e) => setItemBarcode(e.target.value)} className="flex-grow p-3 border border-gray-300 rounded-sm focus:ring-sky-500 outline-none" placeholder="Scan or Type" />
                  <button type="button" onClick={() => setIsScannerOpen(true)} className="bg-gray-700 text-white p-3 rounded-sm"><IconScanCircle width={20} height={20} /></button>
                </div>
                <p className="text-xs text-gray-400 mt-1">This is the next available number. You can change it if needed.</p>
              </div>

              <div className='grid grid-cols-2 gap-4'>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1 after:content-['*'] after:text-red-500">MRP</label>
                  <input type="number" value={itemMRP} onChange={(e) => setItemMRP(e.target.value)} className="w-full p-3 border border-gray-300 rounded-sm focus:ring-sky-500" placeholder="0.00" />
                  <p className="text-[10px] text-gray-400">Required if Sale Price is empty</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1 after:content-['*'] after:text-red-500">Category</label>
                  <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="w-full p-3 border border-gray-300 rounded-sm bg-white focus:ring-sky-500">
                    <option value="" disabled>Select Category</option>
                    {itemGroups.map(g => <option key={g.id} value={g.id!}>{g.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1 after:content-['*'] after:text-red-500">Sales Price</label>
                  <input type="number" value={itemSalesPrice} onChange={(e) => setItemSalesPrice(e.target.value)} className="w-full p-3 border border-gray-300 rounded-sm focus:ring-sky-500" placeholder="0.00" />
                  <p className="text-[10px] text-gray-400">Required if MRP is empty</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Purchase Price</label>
                  <input type="number" value={itemPurchasePrice} onChange={(e) => setItemPurchasePrice(e.target.value)} className="w-full p-3 border border-gray-300 rounded-sm focus:ring-sky-500" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Sale Disc (%)</label>
                  <input type="number" value={itemDiscount} onChange={(e) => setItemDiscount(e.target.value)} className="w-full p-3 border border-gray-300 rounded-sm focus:ring-sky-500" placeholder="0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Purchase Disc (%)</label>
                  <input type="number" value={PurchaseDiscount} onChange={(e) => setPurchaseDiscount(e.target.value)} className="w-full p-3 border border-gray-300 rounded-sm focus:ring-sky-500" placeholder="0" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Tax (%)</label>
                  <input type="number" value={itemTax} onChange={(e) => setItemTax(e.target.value)} className="w-full p-3 border border-gray-300 rounded-sm focus:ring-sky-500" placeholder="0" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">HSN Code</label>
                  <input type="text" value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} className="w-full p-3 border border-gray-300 rounded-sm focus:ring-sky-500" placeholder="e.g. 123456" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1 after:content-['*'] after:text-red-500">Stock</label>
                  <input type="number" value={itemAmount} onChange={(e) => setItemAmount(e.target.value)} className="w-full p-3 border border-gray-300 rounded-sm focus:ring-sky-500" placeholder="0" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Restock Level</label>
                  <input type="number" value={restockQuantity} onChange={(e) => setRestockQuantity(e.target.value)} className="w-full p-3 border border-gray-300 rounded-sm focus:ring-sky-500" placeholder="0" />
                </div>
              </div>

            </div>
          </div>
        </div>
        <div className="hidden md:flex w-[35%] flex-col bg-white h-full relative border-l border-gray-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10">
          <div className="flex-1 p-6 flex flex-col">

            <div className="bg-sky-50 rounded-xl p-5 border border-sky-100">
              <h2 className="text-lg font-bold text-sky-800 mb-2">Bulk Import</h2>
              <p className="text-sm text-sky-600 mb-4">
                Upload Excel/CSV. Missing categories created automatically.
              </p>
              <div className="flex flex-col gap-3">
                <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="w-full bg-white text-sky-600 border border-sky-200 py-3 px-4 rounded-lg font-semibold hover:bg-sky-50 disabled:bg-gray-100 flex items-center justify-center gap-2 transition-colors">
                  {isUploading ? <Spinner /> : 'Upload Excel File'}
                </button>
                <button type="button" onClick={handleDownloadSample} disabled={isUploading} className="text-sm text-sky-500 hover:text-sky-700 underline text-center">
                  Download Sample Template
                </button>
              </div>
            </div>

            <div className="flex-grow"></div>

            <div className=" border-t border-gray-100 pb-10">
              <button onClick={handleAddItem} disabled={isSaving || pageIsLoading || (loading && itemGroups.length === 0)} className="w-full bg-sky-600 text-white py-4 px-6 rounded-xl text-lg font-bold hover:bg-sky-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-sky-200 transition-all active:scale-[0.98]">
                {isSaving ? <Spinner /> : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
        {/* --- MOBILE FIXED FOOTER --- */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-transparent flex justify-center pb-18">
          <button onClick={handleAddItem} disabled={isSaving || pageIsLoading || (loading && itemGroups.length === 0)} className="w-48 max-w-sm bg-sky-500 text-white py-3 px-6 rounded-lg text-lg font-semibold hover:bg-sky-600 disabled:bg-gray-400 flex items-center justify-center gap-2 shadow-md">
            {isSaving ? <Spinner /> : 'Add Item'}
          </button>
        </div>

      </div>
    </div>
  );
};

export default ItemAdd;