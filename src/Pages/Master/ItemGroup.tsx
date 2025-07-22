// src/Pages/Master/ItemGroupPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './ItemGroup.css'; // Dedicated CSS for Item Group Page

interface ItemGroup {
  id: number;
  name: string;
}

const ItemGroupPage = () => {
  const navigate = useNavigate();

  // State to manage the list of item groups
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([
    { id: 1, name: 'Electronics' },
    { id: 2, name: 'Apparel' },
    { id: 3, name: 'Home Goods' },
    { id: 4, name: 'Books' },
  ]);

  // State for the new item group name input
  const [newItemGroupName, setNewItemGroupName] = useState<string>('');

  // State to manage which item group is currently being edited
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editingGroupName, setEditingGroupName] = useState<string>('');

  // Handle adding a new item group
  const handleAddItemGroup = () => {
    if (newItemGroupName.trim() === '') {
      // In a real app, you might show a more user-friendly error message
      console.error('Item group name cannot be empty.');
      return;
    }
    const newId = itemGroups.length > 0 ? Math.max(...itemGroups.map(group => group.id)) + 1 : 1;
    setItemGroups(prevGroups => [
      ...prevGroups,
      { id: newId, name: newItemGroupName.trim() },
    ]);
    setNewItemGroupName(''); // Clear the input field
  };

  // Handle starting the edit process for an item group
  const handleEditClick = (group: ItemGroup) => {
    setEditingGroupId(group.id);
    setEditingGroupName(group.name);
  };

  // Handle saving the edited item group name
  const handleSaveEdit = (id: number) => {
    if (editingGroupName.trim() === '') {
      console.error('Item group name cannot be empty.');
      return;
    }
    setItemGroups(prevGroups =>
      prevGroups.map(group =>
        group.id === id ? { ...group, name: editingGroupName.trim() } : group
      )
    );
    setEditingGroupId(null); // Exit editing mode
    setEditingGroupName(''); // Clear editing state
  };

  // Handle canceling the edit process
  const handleCancelEdit = () => {
    setEditingGroupId(null);
    setEditingGroupName('');
  };

  // Handle deleting an item group
  const handleDeleteItemGroup = (id: number) => {
    // In a real app, you might ask for confirmation before deleting
    if (window.confirm('Are you sure you want to delete this item group?')) {
      setItemGroups(prevGroups => prevGroups.filter(group => group.id !== id));
    }
  };

  return (
    <div className="item-group-page-wrapper">
      {/* Top Bar */}
      <div className="item-group-top-bar">
        <button onClick={() => navigate(-1)} className="item-group-close-button">
          &times;
        </button>
        <h2 className="item-group-title">Item Groups</h2>
        <div style={{ width: '1.5rem' }}></div> {/* Spacer for symmetry */}
      </div>

      {/* Main Content Area */}
      <div className="item-group-content-area">
        {/* Add New Item Group Section */}
        <div className="item-group-add-section">
          <input
            type="text"
            placeholder="New Item Group Name"
            value={newItemGroupName}
            onChange={(e) => setNewItemGroupName(e.target.value)}
            className="item-group-input"
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleAddItemGroup();
              }
            }}
          />
          <button onClick={handleAddItemGroup} className="item-group-add-button">
            Add Group
          </button>
        </div>

        {/* Item Groups List */}
        {itemGroups.length === 0 ? (
          <p className="item-group-no-items">No item groups found. Add a new one!</p>
        ) : (
          <div className="item-group-list-container">
            {itemGroups.map(group => (
              <div key={group.id} className="item-group-card">
                {editingGroupId === group.id ? (
                  // Editing mode
                  <div className="item-group-edit-mode">
                    <input
                      type="text"
                      value={editingGroupName}
                      onChange={(e) => setEditingGroupName(e.target.value)}
                      className="item-group-edit-input"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleSaveEdit(group.id);
                        }
                      }}
                    />
                    <div className="item-group-edit-actions">
                      <button onClick={() => handleSaveEdit(group.id)} className="item-group-save-button">
                        Save
                      </button>
                      <button onClick={handleCancelEdit} className="item-group-cancel-button">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  // Display mode
                  <>
                    <span className="item-group-name">{group.name}</span>
                    <div className="item-group-actions">
                      <button onClick={() => handleEditClick(group)} className="item-group-action-button edit">
                        {/* Edit Icon (SVG from Lucide React, or simple text) */}
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-edit"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"></path></svg>
                      </button>
                      <button onClick={() => handleDeleteItemGroup(group.id)} className="item-group-action-button delete">
                        {/* Delete Icon (SVG from Lucide React, or simple text) */}
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-trash-2"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" x2="10" y1="11" y2="17"></line><line x1="14" x2="14" y1="11" y2="17"></line></svg>
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fixed Bottom Bar (optional, can be used for a "Done" button) */}
      <div className="item-group-bottom-bar">
        <button onClick={() => navigate(-1)} className="item-group-done-button">
          Done
        </button>
      </div>
    </div>
  );
};

export default ItemGroupPage;
