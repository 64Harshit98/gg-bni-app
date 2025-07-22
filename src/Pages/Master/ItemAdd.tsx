import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './ItemAdd.css'; // Import its unique CSS

const ItemAdd = () => {
  const navigate = useNavigate();
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemCategory, setItemCategory] = useState('');
  const [itemTax, setItemTax] = useState('');
  const [itemPurchasePrice, setItemPurchasePrice] = useState('');
  const [itemDiscount, setItemDiscount] = useState('');

  const handleAddItem = () => {
    alert(`Adding Item: ${itemName}, Price: ${itemPrice}, Category: ${itemCategory}, Tax: ${itemTax}`);
    // Logic to save item
  };

  return (
    <div className="item-add-page-wrapper"> {/* Unique wrapper class */}
      <div className="item-add-top-bar">
        <button onClick={() => navigate(-1)} className="item-add-close-button">
          &times;
        </button>
        <h2 className="item-add-title">Add New Item</h2>
        <div style={{ width: '1.5rem' }}></div> {/* Spacer */}
      </div>

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
          <label htmlFor="itemPrice" className="item-add-label">MRP/ Sale Price</label>
          <input
            type="number"
            id="itemPrice"
            value={itemPrice}
            onChange={(e) => setItemPrice(e.target.value)}
            placeholder="e.g., 999.99"
            className="item-add-input"
          />
        </div>
        <div className="item-add-form-group">
          <label htmlFor="itemPurchasePrice" className="item-add-label">Item Purchase Price</label>
          <input
            type="text"
            id="itemPurchasePrice"
            value={itemPurchasePrice}
            onChange={(e) => setItemPurchasePrice(e.target.value)}
            placeholder="e.g., 899.99"
            className="item-add-input"
          />
        </div>
        <div className="item-add-form-group">
          <label htmlFor="itemDiscount" className="item-add-label">Item Discount</label>
          <input
            type="text"
            id="itemDiscount"
            value={itemDiscount}
            onChange={(e) => setItemDiscount(e.target.value)}
            placeholder="e.g., 10%"
            className="item-add-input"
          />
        </div>

        <div className="item-add-form-group">
          <label htmlFor="itemCategory" className="item-add-label">Category</label>
          <input
            type="text"
            id="itemCategory"
            value={itemCategory}
            onChange={(e) => setItemCategory(e.target.value)}
            placeholder="e.g., Electronics, Peripherals"
            className="item-add-input"
          />
        </div>
                <div className="item-add-form-group">
          <label htmlFor="itemTax" className="item-add-label">Tax</label>
          <input
            type="text"
            id="itemTax"
            value={itemTax}
            onChange={(e) => setItemTax(e.target.value)}
            placeholder="e.g., 18%"
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