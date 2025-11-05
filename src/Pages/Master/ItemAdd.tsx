import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { Item, ItemGroup } from '../../constants/models';
import { ROUTES } from '../../constants/routes.constants';
import { CustomButton } from '../../Components';
import { Variant, State } from '../../enums';
import * as XLSX from 'xlsx';
import BarcodeScanner from '../../UseComponents/BarcodeScanner';
import { useAuth, useDatabase } from '../../context/auth-context';
import { Spinner } from '../../constants/Spinner';
import { Modal } from '../../constants/Modal';
import { useItemSettings } from '../../context/Settingscontext';
import { v4 as uuidv4 } from 'uuid';


const ItemAdd: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dbOperations = useDatabase(); // This will be null initially
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

  // This 'loading' state is for the group fetching
  const [loading, setLoading] = useState<boolean>(true);
  // This 'pageIsLoading' is for auth and settings
  const [pageIsLoading, setPageIsLoading] = useState<boolean>(true);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);


  useEffect(() => {
    // Page is loading if auth is loading, settings are loading, OR dbOperations isn't ready
    setPageIsLoading(authLoading || loadingItemSettings || !dbOperations);
  }, [authLoading, loadingItemSettings, dbOperations]);


  const isActive = (path: string) => location.pathname === path;

  useEffect(() => {
    // --- FIX: Wait for dbOperations to be available ---
    if (!dbOperations) {
      setLoading(true); // Keep in loading state if dbOperations is null
      return;
    }

    const fetchGroups = async () => {
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
        setError('Failed to load item categories. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchGroups();
  }, [dbOperations]); // <-- FIX: Re-run when dbOperations is ready

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
    // --- FIX: Check all dependencies ---
    if (!dbOperations || !currentUser || !itemSettings) {
      const errorMsg = 'Cannot add item. App is not ready. Try refreshing.';
      setError(errorMsg);
      setModal({ message: errorMsg, type: State.ERROR });
      return;
    }
    setError(null);
    setSuccess(null);
    setModal(null);

    if (!itemName.trim() || !itemMRP.trim() || !selectedCategory || !itemAmount.trim()) {
      setModal({ message: 'Item Name, MRP, Stock Amount, and Category are required.', type: State.ERROR });
      return;
    }

    // --- (Your settings validation logic is correct) ---
    if (itemSettings.requirePurchasePrice && !itemPurchasePrice.trim()) {
      setModal({ message: 'Purchase Price is required by settings.', type: State.ERROR }); return;
    }
    // ... (other checks) ...

    let finalBarcode = itemBarcode.trim();
    if (!finalBarcode && itemSettings.autoGenerateBarcode) {
      finalBarcode = uuidv4();
      console.log("Auto-generated barcode:", finalBarcode);
    }


    setIsSaving(true);
    try {
      const newItemData: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'companyId'> = {
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
        taxRate: parseFloat(itemTax) || 0, // Assuming itemTax is the taxRate
      };

      await dbOperations.createItem(newItemData);
      setSuccess(`Item "${itemName}" added successfully!`);
      resetForm();
      setTimeout(() => setSuccess(null), 3000);

    } catch (err) {
      console.error('Error adding item:', err);
      setError('Failed to add item. Please try again.');
      setModal({ message: 'Failed to add item.', type: State.ERROR });
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // --- FIX: Check all dependencies ---
    if (!file || !dbOperations || !currentUser || !itemSettings) {
      setModal({ message: "Cannot upload: App is not ready.", type: State.ERROR });
      return;
    }

    setIsUploading(true);
    setError(null);
    setSuccess(null);
    setModal(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: null });


        if (json.length === 0) {
          throw new Error("Excel file is empty or unreadable.");
        }

        let processedCount = 0;
        const errors: string[] = [];
        const createdItems: string[] = [];

        for (let i = 0; i < json.length; i++) {
          const row = json[i];
          const rowNum = i + 2;

          const stockValue = row.Stock ?? row.amount;
          if (!row.name || row.mrp == null || !row.itemGroupId || stockValue == null) {
            errors.push(`Row ${rowNum}: Missing required field (Name, MRP, Item Group ID, or Stock/Amount).`);
            continue;
          }

          try {
            const currentStock = parseInt(String(stockValue ?? 0), 10);
            const itemTax = parseFloat(String(row.tax ?? 0));
            const newItemData: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'companyId'> = {
              name: String(row.name).trim(),
              mrp: parseFloat(String(row.mrp)),
              purchasePrice: parseFloat(String(row.purchasePrice ?? 0)),
              discount: parseFloat(String(row.discount ?? 0)),
              tax: itemTax,
              itemGroupId: String(row.itemGroupId),
              stock: currentStock,
              amount: currentStock,
              barcode: String(row.barcode || '').trim(),
              restockQuantity: parseInt(String(row.restockQuantity ?? 0), 10),
              taxRate: itemTax, // Assuming 'tax' column is the rate
            };

            if (isNaN(newItemData.mrp) || isNaN(newItemData.stock)) {
              errors.push(`Row ${rowNum}: Invalid number format for MRP or Stock/Amount.`);
              continue;
            }

            if (!newItemData.barcode && itemSettings?.autoGenerateBarcode) {
              newItemData.barcode = uuidv4();
            } else if (!newItemData.barcode && itemSettings?.requireBarcode) {
              errors.push(`Row ${rowNum}: Barcode is required by settings but missing in file.`);
              continue;
            }

            // --- FIX: Use the dbOperations from context ---
            await dbOperations.createItem(newItemData);
            createdItems.push(newItemData.name);
            processedCount++;
          } catch (itemError: any) {
            errors.push(`Row ${rowNum} (${row.name || 'N/A'}): Error - ${itemError.message}`);
          }
        }

        if (createdItems.length > 0) {
          setSuccess(`${processedCount} items imported successfully!`);
        }
        if (errors.length > 0) {
          const errorMsg = `Import finished with ${errors.length} errors:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? '\n...' : ''}`;
          setError(errorMsg);
          setModal({ message: `Import failed for ${errors.length} rows. Check console/details.`, type: State.ERROR })
          console.error("Import Errors:", errors);
        } else if (createdItems.length === 0) {
          setError("No valid items found to import in the file.");
        }

        setTimeout(() => { setSuccess(null); setError(null); }, 7000);

      } catch (err: any) {
        console.error('Error processing Excel file:', err);
        setError(`Failed to process file: ${err.message}. Check format and required columns.`);
        setModal({ message: "File processing error.", type: State.ERROR })
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleBarcodeScanned = (barcode: string) => {
    setItemBarcode(barcode);
    setIsScannerOpen(false);
  };

  if (pageIsLoading) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center">
        <Spinner />
        <p className="mt-4 text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col min-h-screen bg-gray-100 w-full font-poppins text-gray-800">
      <BarcodeScanner
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleBarcodeScanned}
      />
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}


      <div className="fixed top-0 left-0 right-0 z-10 p-4 bg-gray-100 border-b border-gray-300 flex flex-col">
        <h1 className="text-2xl font-bold text-gray-800 text-center mb-4">Add Item</h1>
        <div className="flex items-center justify-center gap-6">
          <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.ITEM_ADD)} active={isActive(ROUTES.ITEM_ADD)}>Item Add</CustomButton>
          <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.ITEM_GROUP)} active={isActive(ROUTES.ITEM_GROUP)}>Item Groups</CustomButton>
        </div>
      </div>


      <div className="flex-grow p-2 md:p-6 mt-28 bg-gray-100 w-full overflow-y-auto mb-10"> {/* Original padding & margin */}
        {error && <div className="mb-4 text-center p-3 bg-red-100 text-red-700 rounded-lg font-medium">{error}</div>}
        {success && <div className="mb-4 text-center p-3 bg-green-100 text-green-700 rounded-lg font-medium">{success}</div>}

        <div className="bg-white p-2 rounded-lg shadow-md mb-4">
          <div className="flex flex-col items-center justify-center mb-4 ">
            <h2 className="text-lg font-semibold text-gray-700 mb-2">Bulk Import</h2>
            <p className="text-sm text-center text-gray-500 mb-4 max-w-sm">
              Upload an EXCEL file with columns: Name*, MRP*, Purchase Price, Discount, Tax, Item Group ID*, Amount*(Stock*), Barcode, RestockQuantity. (*=req)
            </p>
            <input
              type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".xlsx, .xls, .csv"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || pageIsLoading}
              className="w-full max-w-xs bg-sky-500 text-white py-2 px-4 rounded-lg font-semibold hover:bg-sky-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center text-lg"
            >
              {isUploading ? <Spinner /> : 'Import from Excel'}
            </button>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md mb-24 ">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Add a Single Item</h2>
          {loadingItemSettings && <p className="text-xs text-yellow-600 mb-2">Loading item settings...</p>}
          <div className="space-y-4">
            <div>
              <label htmlFor="itemName" className="block text-sm font-medium text-gray-600 mb-1 after:content-['*'] after:ml-0.5 after:text-red-500">Item Name</label>
              <input type="text" id="itemName" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="e.g., Laptop, Keyboard" className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500" />
            </div>

            <div>
              <label htmlFor="itemBarcode" className={`block text-sm font-medium text-gray-600 mb-1 ${itemSettings?.requireBarcode && !itemSettings?.autoGenerateBarcode ? 'after:content-["*"] after:ml-0.5 after:text-red-500' : ''}`}>
                Barcode {itemSettings?.autoGenerateBarcode ? '(Optional - Auto-generates)' : '(Optional)'}
              </label>
              <div className="flex gap-2">
                <input
                  type="text" id="itemBarcode" value={itemBarcode} onChange={(e) => setItemBarcode(e.target.value)}
                  placeholder="Scan or type barcode"
                  className="flex-grow w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500"
                />
                <button
                  type="button"
                  onClick={() => setIsScannerOpen(true)}
                  className="bg-gray-700 text-white p-3 rounded-md font-semibold transition hover:bg-gray-800 flex items-center justify-center"
                  title="Scan Barcode"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle></svg>
                </button>
              </div>
            </div>

            <div className='grid grid-cols-2 gap-4'>
              <div>
                <label htmlFor="itemMRP" className="block text-sm font-medium text-gray-600 mb-1 after:content-['*'] after:ml-0.5 after:text-red-500">MRP</label>
                <input type="number" id="itemMRP" value={itemMRP} onChange={(e) => setItemMRP(e.target.value)} placeholder="0.00" className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500" step="0.01" min="0" />
              </div>
              <div>
                <label htmlFor="itemPurchasePrice" className={`block text-sm font-medium text-gray-600 mb-1 ${itemSettings?.requirePurchasePrice ? 'after:content-["*"] after:ml-0.5 after:text-red-500' : ''}`}>Purchase Price</label>
                <input type="number" id="itemPurchasePrice" value={itemPurchasePrice} onChange={(e) => setItemPurchasePrice(e.target.value)} placeholder="0.00" className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500" step="0.01" min="0" />
              </div>
              <div>
                <label htmlFor="itemDiscount" className={`block text-sm font-medium text-gray-600 mb-1 ${itemSettings?.requireDiscount ? 'after:content-["*"] after:ml-0.5 after:text-red-500' : ''}`}>Item Discount (%)</label>
                <input type="number" id="itemDiscount" value={itemDiscount} onChange={(e) => setItemDiscount(e.target.value)} placeholder="0" className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500" min="0" max="100" />
              </div>
              <div>
                <label htmlFor="itemTax" className={`block text-sm font-medium text-gray-600 mb-1 ${itemSettings?.requireTax ? 'after:content-["*"] after:ml-0.5 after:text-red-500' : ''}`}>Tax (%)</label>
                <input type="number" id="itemTax" value={itemTax} onChange={(e) => setItemTax(e.target.value)} placeholder="0" className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500" min="0" />
              </div>
              <div>
                <label htmlFor="itemAmount" className="block text-sm font-medium text-gray-600 mb-1 after:content-['*'] after:ml-0.5 after:text-red-500">Stock Quantity</label>
                <input type="number" id="itemAmount" value={itemAmount} onChange={(e) => setItemAmount(e.target.value)} placeholder="0" className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500" min="0" step="1" />
              </div>
              <div>
                <label htmlFor="restockQuantity" className={`block text-sm font-medium text-gray-600 mb-1 ${itemSettings?.requireRestockQuantity ? 'after:content-["*"] after:ml-0.5 after:text-red-500' : ''}`}>Restock Level</label>
                <input type="number" id="restockQuantity" value={restockQuantity} onChange={(e) => setRestockQuantity(e.target.value)} placeholder="0" className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500" min="0" step="1" />
              </div>
            </div>

            <div>
              <label htmlFor="itemCategory" className="block text-sm font-medium text-gray-600 mb-1 after:content-['*'] after:ml-0.5 after:text-red-500">Category</label>
              {loading ? <p>Loading categories...</p> : (
                <select id="itemCategory" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500 bg-white">
                  <option value="" disabled>Select a category</option>
                  {itemGroups.map((group) => (
                    <option key={group.id} value={group.id!}>{group.name}</option>
                  ))}
                </select>
              )}
              {!loading && itemGroups.length === 0 && <p className="text-xs text-red-500 mt-1">No categories found. Add groups first.</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gray-100 flex items-center justify-center pb-18"> {/* Original padding */}
        <button
          onClick={handleAddItem}
          disabled={isSaving || pageIsLoading || (loading && itemGroups.length === 0)}
          className="bg-sky-500 text-white py-3 px-6 rounded-lg text-lg font-semibold shadow-md hover:bg-sky-600 transition-colors disabled:bg-gray-400" // Original style
        >
          {isSaving ? <Spinner /> : 'Add Item'}
        </button>
      </div>
    </div>
  );
};

export default ItemAdd;