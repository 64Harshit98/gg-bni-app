import React, { useState, useEffect, useRef } from 'react';
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { createItem, getItemGroups } from '../../lib/items_firebase';
import type { Item, ItemGroup } from '../../constants/models';
import { ROUTES } from '../../constants/routes.constants';
// Import the xlsx library for reading Excel files
import * as XLSX from 'xlsx';
// Import the barcode scanner library
import { Html5Qrcode } from 'html5-qrcode';

// --- Reusable Barcode Scanner Component ---
const BarcodeScanner: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (decodedText: string) => void;
}> = ({ isOpen, onClose, onScanSuccess }) => {
  useEffect(() => {
    if (!isOpen) return;

    const scanner = new Html5Qrcode('barcode-scanner-container');

    const startScanner = async () => {
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            onScanSuccess(decodedText);
            scanner.stop();
          },
          undefined // Optional error callback
        );
      } catch (err) {
        console.error("Error starting scanner:", err);
      }
    };

    startScanner();

    return () => {
      // Ensure scanner is stopped on cleanup
      scanner.stop().catch(() => { });
    };
  }, [isOpen, onScanSuccess]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center p-4">
      <div id="barcode-scanner-container" className="w-full max-w-md bg-gray-900 rounded-lg overflow-hidden"></div>
      <button onClick={onClose} className="mt-4 bg-white text-gray-800 font-bold py-2 px-6 rounded-lg shadow-lg hover:bg-gray-200 transition">
        Close
      </button>
    </div>
  );
};


const ItemAdd: React.FC = () => {
  const navigate = useNavigate();
  const [itemName, setItemName] = useState<string>('');
  const [itemMRP, setItemMRP] = useState<string>('');
  const [itemPurchasePrice, setItemPurchasePrice] = useState<string>('');
  const [itemDiscount, setItemDiscount] = useState<string>('');
  const [itemTax, setItemTax] = useState<string>('');
  const [itemAmount, setItemAmount] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [itemBarcode, setItemBarcode] = useState<string>('');
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  useEffect(() => {
    const fetchGroups = async () => {
      try {
        setLoading(true);
        const groups = await getItemGroups();
        setItemGroups(groups);
        if (groups.length > 0) {
          setSelectedCategory(groups[0].id!);
        }
      } catch (err) {
        console.error('Failed to fetch item groups:', err);
        setError('Failed to load item categories. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchGroups();
  }, []);

  const resetForm = () => {
    setItemName('');
    setItemMRP('');
    setItemPurchasePrice('');
    setItemDiscount('');
    setItemTax('');
    setItemAmount('');
    setItemBarcode('');
  };

  const handleAddItem = async () => {
    setError(null);
    setSuccess(null);
    setSuccess(null);

    if (!itemName.trim() || !itemMRP.trim() || !selectedCategory || !itemAmount.trim()) {
      setError('Please fill in all required fields: Item Name, MRP, Amount, and Category.');
      return;
    }
    try {
      const newItemData: Omit<Item, 'id' | 'createdAt' | 'updatedAt'> = {
        name: itemName.trim(),
        mrp: parseFloat(itemMRP),
        purchasePrice: parseFloat(itemPurchasePrice) || 0,
        discount: parseFloat(itemDiscount) || 0,
        tax: parseFloat(itemTax) || 0,
        itemGroupId: selectedCategory,
        amount: parseInt(itemAmount, 10),
        barcode: itemBarcode.trim() || '',
      };

      await createItem(newItemData);
      setSuccess(`Item "${itemName}" added successfully!`);
      resetForm();
      setTimeout(() => setSuccess(null), 3000);

    } catch (err) {
      console.error('Error adding item:', err);
      setError('Failed to add item. Please try again.');
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);
    setSuccess(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json: any[] = XLSX.utils.sheet_to_json(worksheet);

        if (json.length === 0) {
          throw new Error("The selected Excel file is empty or in the wrong format.");
        }

        for (const row of json) {
          if (!row.name || !row.mrp || !row.itemGroupId || !row.amount) {
            console.warn("Skipping invalid row:", row);
            continue;
          }

          const newItemData: Omit<Item, 'id' | 'createdAt' | 'updatedAt'> = {
            name: String(row.name).trim(),
            mrp: parseFloat(row.mrp),
            purchasePrice: parseFloat(row.purchasePrice) || 0,
            discount: parseFloat(row.discount) || 0,
            tax: parseFloat(row.tax) || 0,
            itemGroupId: String(row.itemGroupId),
            amount: parseInt(row.amount, 10),
            barcode: String(row.barcode || '').trim(),
          };

          await createItem(newItemData);
        }

        setSuccess(`${json.length} items have been successfully imported!`);
        setTimeout(() => setSuccess(null), 5000);

      } catch (err) {
        console.error('Error processing Excel file:', err);
        setError('Failed to process file. Ensure it has columns: name, mrp, itemGroupId, amount, and optionally barcode.');
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

  return (
    <div className="flex flex-col min-h-screen bg-white w-full">
      <BarcodeScanner
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleBarcodeScanned}
      />

      <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <button onClick={() => navigate(ROUTES.HOME)} className="text-2xl font-bold text-gray-600">&times;</button>
        <div className="flex-1 flex justify-center items-center gap-6">
          <NavLink to={`${ROUTES.ITEM_ADD}`} className={({ isActive }) => `flex-1 text-center py-3 border-b-2 ${isActive ? 'border-blue-600 text-blue-600 font-semibold' : 'border-transparent text-slate-500'}`}>Item Add</NavLink>
          <NavLink to={`${ROUTES.ITEM_GROUP}`} className={({ isActive }) => `flex-1 text-center py-3 border-b-2 ${isActive ? 'border-blue-600 text-blue-600 font-semibold' : 'border-transparent text-slate-500'}`}>Item Groups</NavLink>
        </div>
        <div className="w-6"></div>
      </div>

      <div className="flex-grow p-4 bg-gray-50 w-full overflow-y-auto">
        {error && <div className="mb-4 text-center p-3 bg-red-100 text-red-700 rounded-lg">{error}</div>}
        {success && <div className="mb-4 text-center p-3 bg-green-100 text-green-700 rounded-lg">{success}</div>}

        <div className="p-6 bg-white rounded-lg shadow-md">
          <div className="mb-6 pb-6 border-b">
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Bulk Import</h2>
            <p className="text-sm text-gray-500 mb-3">Upload an Excel file with columns: name, mrp, purchasePrice, discount, tax, itemGroupId, amount, and barcode.</p>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              accept=".xlsx, .csv"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md font-semibold hover:bg-indigo-700 disabled:bg-indigo-400 flex items-center justify-center"
            >
              {isUploading ? 'Uploading...' : 'Import from Excel'}
            </button>
          </div>

          <h2 className="text-xl font-semibold text-gray-700 mb-4">Add a Single Item</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="itemName" className="block text-sm font-medium text-gray-600 mb-1">Item Name</label>
              <input type="text" id="itemName" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="e.g., Laptop, Keyboard" className="w-full p-2 border rounded-md" />
            </div>

            <div>
              <label htmlFor="itemBarcode" className="block text-sm font-medium text-gray-600 mb-1">Barcode (Optional)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  id="itemBarcode"
                  value={itemBarcode}
                  onChange={(e) => setItemBarcode(e.target.value)}
                  placeholder="Scan or enter barcode"
                  className="flex-grow w-full p-2 border rounded-md"
                />
                <button
                  onClick={() => setIsScannerOpen(true)}
                  className="bg-gray-700 text-white p-2 rounded-md font-semibold transition hover:bg-gray-800"
                  title="Scan Barcode"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle></svg>
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="itemMRP" className="block text-sm font-medium text-gray-600 mb-1">MRP</label>
              <input type="number" id="itemMRP" value={itemMRP} onChange={(e) => setItemMRP(e.target.value)} placeholder="e.g., 999.99" className="w-full p-2 border rounded-md" />
            </div>
            <div>
              <label htmlFor="itemPurchasePrice" className="block text-sm font-medium text-gray-600 mb-1">Item Purchase Price</label>
              <input type="number" id="itemPurchasePrice" value={itemPurchasePrice} onChange={(e) => setItemPurchasePrice(e.target.value)} placeholder="e.g., 899.99" className="w-full p-2 border rounded-md" />
            </div>
            <div>
              <label htmlFor="itemDiscount" className="block text-sm font-medium text-gray-600 mb-1">Item Discount (%)</label>
              <input type="number" id="itemDiscount" value={itemDiscount} onChange={(e) => setItemDiscount(e.target.value)} placeholder="e.g., 10" className="w-full p-2 border rounded-md" />
            </div>
            <div>
              <label htmlFor="itemTax" className="block text-sm font-medium text-gray-600 mb-1">Tax (%)</label>
              <input type="number" id="itemTax" value={itemTax} onChange={(e) => setItemTax(e.target.value)} placeholder="e.g., 18" className="w-full p-2 border rounded-md" />
            </div>
            <div>
              <label htmlFor="itemAmount" className="block text-sm font-medium text-gray-600 mb-1">Stock Quantity</label>
              <input type="number" id="itemAmount" value={itemAmount} onChange={(e) => setItemAmount(e.target.value)} placeholder="e.g., 50" className="w-full p-2 border rounded-md" />
            </div>
            <div>
              <label htmlFor="itemCategory" className="block text-sm font-medium text-gray-600 mb-1">Category</label>
              {loading ? <p>Loading categories...</p> : (
                <select id="itemCategory" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="w-full p-2 border rounded-md">
                  <option value="">Select a category</option>
                  {itemGroups.map((group) => (
                    <option key={group.id} value={group.id!}>{group.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 left-0 right-0 p-4 bg-white border-t">
        <div className="sticky bottom-0 left-0 right-0 p-4 bg-white border-t">
          <button
            onClick={handleAddItem}
            className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg text-lg font-semibold shadow-md hover:bg-blue-700"
            className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg text-lg font-semibold shadow-md hover:bg-blue-700"
          >
            Add Item
          </button>
        </div>
      </div>
      );
};

      export default ItemAdd;