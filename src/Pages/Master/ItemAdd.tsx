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
import { v4 as uuidv4 } from 'uuid';
import { IconScanCircle } from '../../constants/Icons';
// --- ADDED: Efficient Firestore Imports ---
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../../lib/Firebase';

const ItemAdd: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dbOperations = useDatabase();
  const { currentUser, loading: authLoading } = useAuth();
  const { itemSettings, loadingSettings: loadingItemSettings } = useItemSettings();

  const [itemName, setItemName] = useState<string>('');
  const [itemMRP, setItemMRP] = useState<string>('');
  const [itemPurchasePrice, setItemPurchasePrice] = useState<string>('');
  const [itemDiscount, setItemDiscount] = useState<string>('');
  const [itemTax, setItemTax] = useState<string>('');
  const [itemAmount, setItemAmount] = useState<string>('');
  const [restockQuantity, setRestockQuantity] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [itemBarcode, setItemBarcode] = useState<string>('');

  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [pageIsLoading, setPageIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPageIsLoading(authLoading || loadingItemSettings || !dbOperations);
  }, [authLoading, loadingItemSettings, dbOperations]);

  const isActive = (path: string) => location.pathname === path;

  const fetchGroups = async () => {
    if (!dbOperations) return;
    try {
      setLoading(true);
      // Fetching groups is fine as it's usually a small list
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

  useEffect(() => {
    fetchGroups();
  }, [dbOperations]);

  const resetForm = () => {
    setItemName('');
    setItemMRP('');
    setItemPurchasePrice('');
    setItemDiscount('');
    setItemTax('');
    setItemAmount('');
    setItemBarcode('');
    setRestockQuantity('');
    setSelectedCategory(itemGroups.length > 0 ? itemGroups[0].id! : '');
  };

  const handleAddItem = async () => {
    if (!dbOperations || !currentUser || !itemSettings) {
      setModal({ message: 'App not ready.', type: State.ERROR }); return;
    }
    setError(null); setSuccess(null); setModal(null);

    if (!itemName.trim() || !itemMRP.trim() || !selectedCategory || !itemAmount.trim()) {
      setModal({ message: 'Item Name, MRP, Stock Amount, and Category are required.', type: State.ERROR }); return;
    }

    let finalBarcode = itemBarcode.trim();
    if (!finalBarcode && itemSettings.autoGenerateBarcode) finalBarcode = uuidv4();
    else if (!finalBarcode && itemSettings.requireBarcode) {
      setModal({ message: 'Barcode required.', type: State.ERROR }); return;
    }

    setIsSaving(true);
    try {
      const customDocId = finalBarcode || uuidv4();
      const newItemData: any = {
        name: itemName.trim(),
        mrp: parseFloat(itemMRP) || 0,
        purchasePrice: parseFloat(itemPurchasePrice) || 0,
        discount: parseFloat(itemDiscount) || 0,
        tax: parseFloat(itemTax) || 0,
        itemGroupId: selectedCategory,
        stock: parseInt(itemAmount, 10) || 0,
        amount: parseInt(itemAmount, 10) || 0,
        barcode: finalBarcode,
        restockQuantity: parseInt(restockQuantity, 10) || 0,
      };

      await dbOperations.createItem(newItemData, customDocId);

      setSuccess(`Item "${itemName}" added successfully!`);
      resetForm();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError('Failed to add item.');
      setModal({ message: err.message, type: State.ERROR });
    } finally {
      setIsSaving(false);
    }
  };

  // --- OPTIMIZED BULK UPLOAD ---
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !dbOperations || !currentUser || !itemSettings || !currentUser.companyId) return;

    setIsUploading(true);
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
        const errors: string[] = [];

        // 1. Fetch Groups (Keep this, it's small)
        let currentGroups = await dbOperations.getItemGroups();
        const groupMap = new Map<string, string>();
        currentGroups.forEach(g => groupMap.set(g.name.toLowerCase().trim(), g.id!));

        // NOTE: "syncItems" / "getItems" removed. We will check existence inside the loop.

        for (let i = 0; i < rawJson.length; i++) {
          const rawRow = rawJson[i];
          const row: any = {};

          Object.keys(rawRow).forEach(k => {
            const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, "");
            row[cleanKey] = rawRow[k];
          });

          // --- Group Logic ---
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

          if (!row.name || row.mrp == null) {
            errors.push(`Row ${i + 2}: Missing Name or MRP`); continue;
          }

          try {
            const pPrice = parseFloat(String(row.purchaseprice ?? 0));
            const stockVal = parseInt(String(row.stock ?? row.amount ?? row.qty ?? row.quantity ?? 0), 10);
            const rowBarcode = String(row.barcode || '').trim();

            let customId = rowBarcode;
            if (!customId && itemSettings?.autoGenerateBarcode) customId = uuidv4();
            else if (!customId) customId = uuidv4();

            const itemData: any = {
              name: String(row.name).trim(),
              mrp: parseFloat(String(row.mrp)),
              purchasePrice: pPrice,
              discount: parseFloat(String(row.discount ?? 0)),
              tax: parseFloat(String(row.tax ?? 0)),
              itemGroupId: targetGroupId,
              stock: stockVal,
              amount: stockVal,
              barcode: customId === rowBarcode ? rowBarcode : customId,
              restockQuantity: parseInt(String(row.restockquantity ?? 0), 10),
              taxRate: parseFloat(String(row.tax ?? 0)),
            };

            // --- OPTIMIZED CHECK: Is this a Create or Update? ---
            let isUpdate = false;
            if (rowBarcode) {
              // We check ONLY this specific barcode in the database
              const itemsRef = collection(db, 'companies', currentUser.companyId, 'items');
              const q = query(itemsRef, where('barcode', '==', rowBarcode), limit(1));
              const snapshot = await getDocs(q);
              if (!snapshot.empty) {
                isUpdate = true;
              }
            }

            // Create/Update the item
            await dbOperations.createItem(itemData, customId);

            if (isUpdate) updatedCount++;
            else createdCount++;

            processedCount++;
          } catch (e: any) {
            errors.push(`Row ${i + 2}: ${e.message}`);
          }
        }

        // Refresh groups in UI in case we added new ones
        await fetchGroups();

        if (errors.length > 0) setModal({ message: `Done. ${errors.length} errors. First: ${errors[0]}`, type: State.ERROR });
        else setSuccess(`Imported: ${createdCount} New, ${updatedCount} Updated.`);

        setTimeout(() => setSuccess(null), 5000);

      } catch (err: any) {
        console.error(err);
        setError("File processing failed.");
      } finally {
        setIsUploading(false);
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
        purchasePrice: 80,
        discount: 0, tax: 0,
        itemGroupId: 'Fruits',
        stock: 50, barcode: '1001',
        restockQuantity: 10
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    const mandatoryCols = [0, 1, 5, 6];
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

      {renderHeader()}

      {/* Main Layout Wrapper */}
      <div className="flex-1 flex flex-col md:flex-row relative">

        {/* LEFT PANEL */}
        <div className="flex-1 w-full md:w-[65%] bg-gray-100 md:bg-gray-50 md:border-r border-gray-200 pt-28 pb-24 px-2 md:pt-6 md:px-6 md:pb-6 overflow-y-auto">

          {/* Messages */}
          {error && <div className="mb-4 text-center p-3 bg-red-100 text-red-700 rounded-lg">{error}</div>}
          {success && <div className="mb-4 text-center p-3 bg-green-100 text-green-700 rounded-lg">{success}</div>}

          {/* MOBILE ONLY: Bulk Import Section */}
          <div className="md:hidden bg-white p-2 rounded-lg shadow-md mb-4">
            <div className="flex flex-col items-center justify-center mb-4">
              <h2 className="text-lg font-semibold text-gray-700 mb-2">Bulk Import</h2>
              <p className="text-sm text-center text-gray-500 mb-4 max-w-sm">
                Upload EXCEL. Missing categories will be <b>created automatically</b>.
              </p>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".xlsx, .xls, .csv" />
              <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="w-full max-w-xs bg-sky-500 text-white py-2 px-4 rounded-lg hover:bg-sky-600 disabled:bg-gray-400 flex items-center justify-center gap-2">
                {isUploading ? <Spinner /> : 'Import from Excel'}
              </button>
              <button type="button" onClick={handleDownloadSample} disabled={isUploading} className="w-full max-w-xs bg-white text-sky-500 border border-sky-500 py-2 px-4 rounded-lg mt-4 hover:bg-sky-50">
                Download Sample
              </button>
            </div>
          </div>

          {/* SINGLE ITEM FORM */}
          <div className="bg-white p-6 rounded-lg shadow-md md:mb-0 md:rounded-sm md:shadow-sm md:border md:border-gray-200 mb-10">
            <h2 className="text-lg font-bold text-gray-800 mb-4 md:mb-6 md:border-b md:pb-2">Add a Single Item</h2>
            <div className="space-y-4">

              {/* Form Inputs */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1 after:content-['*'] after:ml-0.5 after:text-red-500">Item Name</label>
                <input type="text" value={itemName} onChange={(e) => setItemName(e.target.value)} className="w-full p-3 border border-gray-300 rounded-md focus:ring-sky-500 outline-none" placeholder="e.g. Apple" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Barcode</label>
                <div className="flex gap-2">
                  <input type="text" value={itemBarcode} onChange={(e) => setItemBarcode(e.target.value)} className="flex-grow p-3 border border-gray-300 rounded-md focus:ring-sky-500 outline-none" placeholder="Scan or type" />
                  <button type="button" onClick={() => setIsScannerOpen(true)} className="bg-gray-700 text-white p-3 rounded-md"><IconScanCircle width={20} height={20} /></button>
                </div>
              </div>

              <div className='grid grid-cols-2 gap-4'>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1 after:content-['*'] after:text-red-500">MRP</label>
                  <input type="number" value={itemMRP} onChange={(e) => setItemMRP(e.target.value)} className="w-full p-3 border border-gray-300 rounded-md focus:ring-sky-500" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Purchase Price</label>
                  <input type="number" value={itemPurchasePrice} onChange={(e) => setItemPurchasePrice(e.target.value)} className="w-full p-3 border border-gray-300 rounded-md focus:ring-sky-500" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Discount (%)</label>
                  <input type="number" value={itemDiscount} onChange={(e) => setItemDiscount(e.target.value)} className="w-full p-3 border border-gray-300 rounded-md focus:ring-sky-500" placeholder="0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Tax (%)</label>
                  <input type="number" value={itemTax} onChange={(e) => setItemTax(e.target.value)} className="w-full p-3 border border-gray-300 rounded-md focus:ring-sky-500" placeholder="0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1 after:content-['*'] after:text-red-500">Stock</label>
                  <input type="number" value={itemAmount} onChange={(e) => setItemAmount(e.target.value)} className="w-full p-3 border border-gray-300 rounded-md focus:ring-sky-500" placeholder="0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Restock Level</label>
                  <input type="number" value={restockQuantity} onChange={(e) => setRestockQuantity(e.target.value)} className="w-full p-3 border border-gray-300 rounded-md focus:ring-sky-500" placeholder="0" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1 after:content-['*'] after:text-red-500">Category</label>
                <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="w-full p-3 border border-gray-300 rounded-md bg-white focus:ring-sky-500">
                  <option value="" disabled>Select Category</option>
                  {itemGroups.map(g => <option key={g.id} value={g.id!}>{g.name}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* --- RIGHT PANEL: BULK IMPORT & ACTIONS (Desktop Only: 35%) --- */}
        <div className="hidden md:flex w-[35%] flex-col bg-white h-full relative border-l border-gray-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10">
          <div className="flex-1 p-6 flex flex-col">

            {/* Desktop Bulk Import Section */}
            <div className="bg-sky-50 rounded-xl p-5 border border-sky-100">
              <h2 className="text-lg font-bold text-sky-800 mb-2">Bulk Import</h2>
              <p className="text-sm text-sky-600 mb-4">
                Upload Excel/CSV to add multiple items at once. Categories will be created automatically.
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

            {/* Desktop Save Button */}
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