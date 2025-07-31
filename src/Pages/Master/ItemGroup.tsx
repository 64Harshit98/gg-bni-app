// src/Pages/Master/ItemGroupPage.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ItemGroup } from '../../constants/models';
import {
  createItemGroup,
  getItemGroups,
  updateItemGroup,
  deleteItemGroup,
} from '../../lib/items_firebase'; // Import Firestore functions
import { ROUTES } from '../../constants/routes.constants'; // Import ROUTES
import './ItemGroup.css';

const ItemGroupPage: React.FC = () => {
  const navigate = useNavigate();

  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [newItemGroupName, setNewItemGroupName] = useState<string>('');

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState<string>('');

  useEffect(() => {
    const fetchAndListenToItemGroups = async () => {
      setLoading(true);
      setError(null);
      try {
        const groups = await getItemGroups();
        setItemGroups(groups);
      } catch (err) {
        console.error('Error fetching item groups:', err);
        setError('Failed to load item groups. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchAndListenToItemGroups();
  }, []);

  const handleAddItemGroup = async () => {
    if (newItemGroupName.trim() === '') {
      setError('Item group name cannot be empty.');
      return;
    }
    setError(null);

    try {
      const newGroupId = await createItemGroup({
        name: newItemGroupName.trim(),
        description: '',
      });
      console.log('New Item Group added with ID:', newGroupId);
      setNewItemGroupName('');
      const groups = await getItemGroups();
      setItemGroups(groups);
    } catch (err) {
      console.error('Error adding item group:', err);
      setError('Failed to add item group. Please try again.');
    }
  };

  const handleEditClick = (group: ItemGroup) => {
    setEditingGroupId(group.id!);
    setEditingGroupName(group.name);
  };

  const handleSaveEdit = async (id: string) => {
    if (editingGroupName.trim() === '') {
      setError('Item group name cannot be empty.');
      return;
    }
    setError(null);

    try {
      await updateItemGroup(id, { name: editingGroupName.trim() });
      console.log('Item Group updated:', id);
      setEditingGroupId(null);
      setEditingGroupName('');
      const groups = await getItemGroups();
      setItemGroups(groups);
    } catch (err) {
      console.error('Error updating item group:', err);
      setError('Failed to update item group. Please try again.');
    }
  };

  const handleCancelEdit = () => {
    setEditingGroupId(null);
    setEditingGroupName('');
    setError(null);
  };

  const handleDeleteItemGroup = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this item group? This action cannot be undone.')) {
      setError(null);
      try {
        await deleteItemGroup(id);
        console.log('Item Group deleted:', id);
        const groups = await getItemGroups();
        setItemGroups(groups);
      } catch (err) {
        console.error('Error deleting item group:', err);
        setError('Failed to delete item group. Please try again.');
      }
    }
  };

  return (
    <div className="item-group-page-wrapper">
      {/* Top Bar */}
      <div className="item-group-top-bar">
        <button onClick={() => navigate(-1)} className="item-group-close-button">
          &times;
        </button>
        {/* New button to navigate to Item Add page */}
        <button
            onClick={() => navigate(`${ROUTES.MASTERS}/${ROUTES.ITEM_ADD}`)}
            className="item-group-navigate-button" // Apply styling for navigation buttons
            title="Add New Item"
        >
            Add Item
        </button>
      </div>

      {/* Error Message Display */}
      {error && <div className="item-group-error-message">{error}</div>}

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
            disabled={loading}
          />
          <button
            onClick={handleAddItemGroup}
            className="item-group-add-button"
            disabled={loading || newItemGroupName.trim() === ''}
          >
            {loading ? 'Adding...' : 'Add Group'}
          </button>
        </div>

        {/* Item Groups List */}
        {loading ? (
          <p className="item-group-loading">Loading item groups...</p>
        ) : itemGroups.length === 0 ? (
          <p className="item-group-no-items">No item groups found. Add a new one!</p>
        ) : (
          <div className="item-group-list-container">
            {itemGroups.map((group) => (
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
                          handleSaveEdit(group.id!);
                        }
                      }}
                    />
                    <div className="item-group-edit-actions">
                      <button onClick={() => handleSaveEdit(group.id!)} className="item-group-save-button">
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
                        {/* Edit Icon (SVG) */}
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-edit"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"></path></svg>
                      </button>
                      <button onClick={() => handleDeleteItemGroup(group.id!)} className="item-group-action-button delete">
                        {/* Delete Icon (SVG) */}
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

      {/* Fixed Bottom Bar */}
      <div className="item-group-bottom-bar">
        <button onClick={() => navigate(-1)} className="item-group-done-button">
          Done
        </button>
      </div>
    </div>
  );
};

export default ItemGroupPage;