import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { createItem, getItemGroups } from '../../lib/items_firebase';
import type { Item, ItemGroup } from '../../constants/models';
import { ROUTES } from '../../constants/routes.constants';
// Import the xlsx library for reading Excel files
import * as XLSX from 'xlsx';

const ItemAdd: React.FC = () => {
  const navigate = useNavigate();
  const [itemName, setItemName] = useState<string>('');
  const [itemMRP, setItemMRP] = useState<string>('');
  const [itemPurchasePrice, setItemPurchasePrice] = useState<string>('');
  const [itemDiscount, setItemDiscount] = useState<string>('');
  const [itemTax, setItemTax] = useState<string>('');
  const [itemAmount, setItemAmount] = useState<string>(''); // Added state for item amount
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  };

  const handleAddItem = async () => {
    setError(null);
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
        amount: parseInt(itemAmount, 10), // Converted amount to integer
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

  // --- New Function to Handle Excel File Upload ---
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

        // Process each row from the Excel file
        for (const row of json) {
          // Basic validation for each row
          if (!row.name || !row.mrp || !row.itemGroupId || !row.amount) {
            console.warn("Skipping invalid row:", row);
            continue; // Skip rows that are missing required data
          }

          const newItemData: Omit<Item, 'id' | 'createdAt' | 'updatedAt'> = {
            name: String(row.name).trim(),
            mrp: parseFloat(row.mrp),
            purchasePrice: parseFloat(row.purchasePrice) || 0,
            discount: parseFloat(row.discount) || 0,
            tax: parseFloat(row.tax) || 0,
            itemGroupId: String(row.itemGroupId),
            amount: parseInt(row.amount, 10), // Converted amount to integer
          };

          // Use your existing createItem function to add the item
          await createItem(newItemData);
        }

        setSuccess(`${json.length} items have been successfully imported!`);
        setTimeout(() => setSuccess(null), 5000);

      } catch (err) {
        console.error('Error processing Excel file:', err);
        setError('Failed to process file. Please ensure it is a valid .xlsx or .csv file and has columns: name, mrp, purchasePrice, discount, tax, itemGroupId, and amount.');
      } finally {
        setIsUploading(false);
        // Reset file input to allow re-uploading the same file
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="flex flex-col min-h-screen bg-white w-full">
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
          {/* Import from Excel Button */}
          <div className="mb-6 pb-6 border-b">
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Bulk Import</h2>
            <p className="text-sm text-gray-500 mb-3">Upload an Excel (.xlsx, .csv) file with columns: name, mrp, purchasePrice, discount, tax, itemGroupId, and amount.</p>
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
          {/* Form for adding a single item */}
          <div className="space-y-4">
            <div>
              <label htmlFor="itemName" className="block text-sm font-medium text-gray-600 mb-1">Item Name</label>
              <input type="text" id="itemName" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="e.g., Laptop, Keyboard" className="w-full p-2 border rounded-md" />
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
            {/* Added input for item amount */}
            <div>
              <label htmlFor="itemAmount" className="block text-sm font-medium text-gray-600 mb-1">Amount of Items</label>
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
        <button
          onClick={handleAddItem}
          className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg text-lg font-semibold shadow-md hover:bg-blue-700"
        >
          Add Item
        </button>
      </div>
    </div>
  );
};

export default ItemAdd;
