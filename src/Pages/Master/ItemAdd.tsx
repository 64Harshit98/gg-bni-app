// src/Pages/Master/ItemAdd.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createItem, getItemGroups } from '../../lib/items_firebase'; // Adjust path as needed
import type { Item, ItemGroup } from '../../constants/models';
import { ROUTES } from '../../constants/routes.constants'; // Import ROUTES
import './ItemAdd.css'; // Import its unique CSS

const ItemAdd: React.FC = () => {
  const navigate = useNavigate();
  const [itemName, setItemName] = useState<string>('');
  const [itemMRP, setItemMRP] = useState<string>('');
  const [itemPurchasePrice, setItemPurchasePrice] = useState<string>('');
  const [itemDiscount, setItemDiscount] = useState<string>('');
  const [itemTax, setItemTax] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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

  const handleAddItem = async () => {
    setError(null);

    if (!itemName.trim() || !itemMRP.trim() || !selectedCategory) {
      setError('Please fill in all required fields: Item Name, MRP, and Category.');
      return;
    }

    const mrp = parseFloat(itemMRP);
    const purchasePrice = parseFloat(itemPurchasePrice);
    const discount = parseFloat(itemDiscount);
    const tax = parseFloat(itemTax);

    if (isNaN(mrp) || mrp <= 0) {
      setError('Please enter a valid MRP (a positive number).');
      return;
    }
    if (itemPurchasePrice.trim() !== '' && (isNaN(purchasePrice) || purchasePrice < 0)) {
        setError('Please enter a valid Purchase Price (a non-negative number).');
        return;
    }
    if (itemDiscount.trim() !== '' && (isNaN(discount) || discount < 0 || discount > 100)) {
        setError('Please enter a valid Discount percentage (0-100).');
        return;
    }
    if (itemTax.trim() !== '' && (isNaN(tax) || tax < 0)) {
        setError('Please enter a valid Tax percentage (a non-negative number).');
        return;
    }

    const itemGroupId = selectedCategory;

    if (!itemGroupId) {
        setError('Selected category is invalid. Please select a valid category.');
        return;
    }

    try {
      const newItemData: Omit<Item, 'id' | 'createdAt' | 'updatedAt'> = {
        name: itemName.trim(),
        mrp: mrp,
        purchasePrice: purchasePrice || 0,
        discount: discount || 0,
        tax: tax || 0,
        itemGroupId: itemGroupId,
      };

      const newItemId = await createItem(newItemData);
      alert(`Item "${itemName}" added successfully with ID: ${newItemId}`);
      console.log('New Item added:', newItemData);

      setItemName('');
      setItemMRP('');
      setItemPurchasePrice('');
      setItemDiscount('');
      setItemTax('');

      navigate(ROUTES.MASTERS); // Navigate back to masters after adding
    } catch (err) {
      console.error('Error adding item:', err);
      setError('Failed to add item. Please try again.');
    }
  };

  return (
    <div className="item-add-page-wrapper">
      <div className="item-add-top-bar">
        <button onClick={() => navigate(ROUTES.MASTERS)} className="item-add-close-button">
          &times;
        </button>
        {/* New button to navigate to Item Group page */}
        <div>
         <button
            onClick={() => navigate(`${ROUTES.MASTERS}/${ROUTES.ITEM_ADD}`)}
            className="item-add-navigate-button" // Add a new CSS class for styling
            title="Manage Item Groups"
        >
            ITEM ADD
        </button>
        <button
            onClick={() => navigate(`${ROUTES.MASTERS}/${ROUTES.ITEM_GROUP}`)}
            className="item-add-navigate-button" // Add a new CSS class for styling
            title="Manage Item Groups"
        >
          ITEM GROUPS
        </button>
        </div>
      </div>

      {error && <div className="item-add-error-message">{error}</div>}

      <div className="item-add-content-area">
        <div className="item-add-form-group">
          <label htmlFor="itemName" className="item-add-label">Item Name</label>
          <input
            type="text"
            id="itemName"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder="e.g., Laptop, Keyboard"
            className="item-add-input"
          />
        </div>

        <div className="item-add-form-group">
          <label htmlFor="itemMRP" className="item-add-label">MRP</label>
          <input
            type="number"
            id="itemMRP"
            value={itemMRP}
            onChange={(e) => setItemMRP(e.target.value)}
            placeholder="e.g., 999.99"
            className="item-add-input"
          />
        </div>
        <div className="item-add-form-group">
          <label htmlFor="itemPurchasePrice" className="item-add-label">Item Purchase Price</label>
          <input
            type="number"
            id="itemPurchasePrice"
            value={itemPurchasePrice}
            onChange={(e) => setItemPurchasePrice(e.target.value)}
            placeholder="e.g., 899.99"
            className="item-add-input"
          />
        </div>
        <div className="item-add-form-group">
          <label htmlFor="itemDiscount" className="item-add-label">Item Discount (%)</label>
          <input
            type="number"
            id="itemDiscount"
            value={itemDiscount}
            onChange={(e) => setItemDiscount(e.target.value)}
            placeholder="e.g., 10 (for 10%)"
            className="item-add-input"
          />
        </div>

        <div className="item-add-form-group">
          <label htmlFor="itemCategory" className="item-add-label">Category</label>
          {loading ? (
            <p>Loading categories...</p>
          ) : error ? (
            <p className="item-add-error-message">Error loading categories.</p>
          ) : (
            <select
              id="itemCategory"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="item-add-input item-add-select"
            >
              <option value="">Select a category</option>
              {itemGroups.map((group) => (
                <option key={group.id} value={group.id!}>
                  {group.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="item-add-form-group">
          <label htmlFor="itemTax" className="item-add-label">Tax (%)</label>
          <input
            type="number"
            id="itemTax"
            value={itemTax}
            onChange={(e) => setItemTax(e.target.value)}
            placeholder="e.g., 18 (for 18%)"
            className="item-add-input"
          />
        </div>
      </div>

      <div className="item-add-bottom-bar">
        <button onClick={handleAddItem} className="item-add-save-button">
          Add Item
        </button>
      </div>
    </div>
  );
};

export default ItemAdd;