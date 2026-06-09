import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { ItemGroup } from '../../constants/models';
import { useDatabase } from '../../context/auth-context';
import { CustomButton } from '../../Components';
import { Variant } from '../../enums';
import { Spinner } from '../../constants/Spinner';
import { FiEdit2, FiTrash2 } from 'react-icons/fi';
import { ItemEditDrawer } from '../../Components/ItemDrawer';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';

// --- Icon Components ---
const EditIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"></path></svg>;
const DeleteIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>;

export interface SharedItemGroupProps {
  routes: {
    addItem: string;
    itemGroups: string;
  };
  theme: {
    primaryBg: string;
    primaryHoverBg: string;
    primaryDisabledBg: string;
    primaryText: string;
    primaryHoverText: string;
    primaryBorder: string;
    focusRing: string;
    deleteButtonBg: string;
    deleteButtonHoverBg: string;
    editIconText: string;
    editIconHoverText: string;
  };
}

export const SharedItemGroupPage: React.FC<SharedItemGroupProps> = ({ routes, theme }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const dbOperations = useDatabase();

  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [newItemGroupName, setNewItemGroupName] = useState<string>('');
  const [groupCounts, setGroupCounts] = useState<Record<string, number>>({});
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState<string>('');
  const [deleteTargetGroup, setDeleteTargetGroup] = useState<ItemGroup | null>(null);
  const [viewingGroup, setViewingGroup] = useState<ItemGroup | null>(null);
  const [allItems, setAllItems] = useState<any[]>([]);
  const [selectedItemForEdit, setSelectedItemForEdit] = useState<any | null>(null);
  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
  const [itemPendingDelete, setItemPendingDelete] = useState<any | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ message: string; type: State } | null>(null);
  const [groupPendingFullDelete, setGroupPendingFullDelete] = useState<ItemGroup | null>(null);
  const isActive = (path: string) => location.pathname === path;

  const toTitleCase = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };

  const getStockBadgeClasses = (stock: number) => {
    if (stock === 0) return 'bg-red-100 text-red-700';
    if (stock < 10) return 'bg-blue-100 text-blue-700';
    return 'bg-green-100 text-green-700';
  };

  const fetchAndSyncGroups = useCallback(async () => {
    if (!dbOperations) {
      setLoading(true);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [allItems, initialGroups] = await Promise.all([
        dbOperations.syncItems(),
        dbOperations.getItemGroups(),
      ]);

      let groupMapById = new Map<string, ItemGroup>();
      let groupMapByName = new Map<string, ItemGroup>();

      const refreshMaps = (groups: ItemGroup[]) => {
        groupMapById = new Map();
        groupMapByName = new Map();
        groups.forEach(g => {
          if (g.id) groupMapById.set(g.id, g);
          groupMapByName.set(g.name.toLowerCase().trim(), g);
        });
      };

      refreshMaps(initialGroups);
      const uniqueNamesToCreate = new Set<string>();

      allItems.forEach(item => {
        // Only process string itemGroupId, skip arrays (legacy guard)
        const itemGroupId = Array.isArray(item.itemGroupId) ? item.itemGroupId[0] : item.itemGroupId;
        if (!itemGroupId) return;
        if (groupMapById.has(itemGroupId)) return;
        const lowerName = itemGroupId.toLowerCase().trim();
        if (groupMapByName.has(lowerName)) return;
        // Only create if it looks like a name, not a Firestore ID (IDs are 20+ chars)
        if (itemGroupId.length < 20) {
          uniqueNamesToCreate.add(lowerName);
        }
      });

      if (uniqueNamesToCreate.size > 0) {
        showSuccessMessage(`Creating ${uniqueNamesToCreate.size} new group(s)...`);

        const createPromises = Array.from(uniqueNamesToCreate).map(lowerName =>
          dbOperations.createItemGroup({
            name: toTitleCase(lowerName),
            description: 'Auto-created from items'
          })
        );

        await Promise.all(createPromises);

        const updatedGroups = await dbOperations.getItemGroups();
        refreshMaps(updatedGroups);
        setItemGroups(updatedGroups);
      } else {
        setItemGroups(initialGroups);
      }

      const itemsToUpdate: { itemId: string, newGroupId: string }[] = [];

      allItems.forEach(item => {
        // Normalize: handle legacy array saves
        const rawGroupId = Array.isArray(item.itemGroupId) ? item.itemGroupId[0] : item.itemGroupId;
        if (!rawGroupId || typeof rawGroupId !== 'string') return;
        if (groupMapById.has(rawGroupId)) return;

        const lowerName = rawGroupId.toLowerCase().trim();
        const targetGroup = groupMapByName.get(lowerName);

        if (targetGroup && targetGroup.id) {
          itemsToUpdate.push({ itemId: item.id!, newGroupId: targetGroup.id });
        }
      });

      if (itemsToUpdate.length > 0) {
        showSuccessMessage(`Syncing... Linking ${itemsToUpdate.length} item(s) to groups.`);
        for (const update of itemsToUpdate) {
          await dbOperations.updateItem(update.itemId, { itemGroupId: update.newGroupId });
        }
      }

      setAllItems(allItems);
      const counts: Record<string, number> = {};
      let uncategorizedCount = 0;

      allItems.forEach(item => {
        const groupIds: string[] = [
          ...(Array.isArray(item.itemGroupIds) ? item.itemGroupIds : []),
          ...(item.itemGroupId && !Array.isArray(item.itemGroupId) ? [item.itemGroupId] : []),
        ].filter((id, index, self) => id && groupMapById.has(id) && self.indexOf(id) === index);

        if (groupIds.length > 0) {
          groupIds.forEach(gid => {
            counts[gid] = (counts[gid] || 0) + 1;
          });
        } else {
          uncategorizedCount++;
        }
      });

      setGroupCounts({ ...counts, "uncategorized": uncategorizedCount });
      setItemGroups(prev => [...prev].sort((a, b) => a.name.localeCompare(b.name)));

    } catch (err) {
      console.error('Error syncing item groups:', err);
      setError('Failed to sync and load item groups.');
    } finally {
      setLoading(false);
    }
  }, [dbOperations]);

  useEffect(() => {
    fetchAndSyncGroups();
  }, [fetchAndSyncGroups]);

  const showSuccessMessage = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3500);
  };

  const handleAddItemGroup = async () => {
    if (newItemGroupName.trim() === '') return setError('Item group name cannot be empty.');
    if (itemGroups.some(g => g.name.toLowerCase() === newItemGroupName.trim().toLowerCase())) {
      return setError('This group name already exists.');
    }
    if (!dbOperations) return;

    setError(null);
    try {
      await dbOperations.createItemGroup({ name: newItemGroupName.trim(), description: '' });
      setNewItemGroupName('');
      showSuccessMessage('Group created successfully!');
      await fetchAndSyncGroups();
    } catch (err) {
      console.error('Error adding item group:', err);
      setError('Failed to add item group.');
    }
  };

  const handleEditClick = (group: ItemGroup) => {
    setEditingGroupId(group.id ?? null);
    setEditingGroupName(group.name);
  };

  const handleCancelEdit = () => {
    setEditingGroupId(null);
    setEditingGroupName('');
    setError(null);
  };

  const openEditDrawer = (item: any) => {
    setSelectedItemForEdit(item);
    setIsEditDrawerOpen(true);
  };

  const closeEditDrawer = () => {
    setIsEditDrawerOpen(false);
    setTimeout(() => setSelectedItemForEdit(null), 250);
  };

  const confirmDeleteItem = async () => {
    if (!itemPendingDelete?.id || !dbOperations) return;
    try {
      await dbOperations.deleteItem(itemPendingDelete.id);
      setAllItems(prev => {
        const updated = prev.filter(i => i.id !== itemPendingDelete.id);
        const counts: Record<string, number> = {};
        let uncategorizedCount = 0;
        updated.forEach(item => {
          const groupId = Array.isArray(item.itemGroupId) ? item.itemGroupId[0] : item.itemGroupId;
          if (groupId && typeof groupId === 'string' && itemGroups.some(g => g.id === groupId)) {
            counts[groupId] = (counts[groupId] || 0) + 1;
          } else {
            uncategorizedCount++;
          }
        });
        setGroupCounts({ ...counts, "uncategorized": uncategorizedCount });
        return updated;
      });
      setDeleteModal({ message: 'Item deleted successfully', type: State.SUCCESS });
    } catch {
      setDeleteModal({ message: 'Failed to delete item', type: State.ERROR });
    } finally {
      setItemPendingDelete(null);
      setTimeout(() => setDeleteModal(null), 1500);
    }
  };

  const handleSaveEdit = async (groupToUpdate: ItemGroup) => {
    const newName = editingGroupName.trim();
    if (newName === '' || newName === groupToUpdate.name) {
      handleCancelEdit();
      return;
    }
    if (!dbOperations) return;

    setError(null);
    try {
      await dbOperations.updateGroupAndSyncItems(groupToUpdate, newName);
      handleCancelEdit();
      await fetchAndSyncGroups();
      showSuccessMessage(`Group renamed to "${newName}" and items updated.`);
    } catch (err: any) {
      console.error('Error updating item group:', err);
      setError(err.message || 'Failed to update group.');
    }
  };

  const handleDeleteItemGroup = async (groupToDelete: ItemGroup) => {
    if (!dbOperations || !groupToDelete.id) return;
    try {
      setLoading(true);
      const allItems = await dbOperations.syncItems();
      const itemsToUncategorize = allItems.filter(i => i.itemGroupId === groupToDelete.id);

      for (const item of itemsToUncategorize) {
        await dbOperations.updateItem(item.id!, { itemGroupId: "" });
      }
      await dbOperations.deleteItemGroupIfUnused(groupToDelete);

      showSuccessMessage(`Group deleted. ${itemsToUncategorize.length} items moved to Uncategorized.`);
      await fetchAndSyncGroups();
    } catch (err: any) {
      setError(err.message || "Delete failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroupAndItems = async (group: ItemGroup) => {
    if (!dbOperations || !group.id) return;
    try {
      setLoading(true);
      const items = await dbOperations.syncItems();
      const validGroupIds = new Set(itemGroups.map(g => g.id));

      const itemsToDelete = items.filter(item => {
        const ids: string[] = [
          ...(Array.isArray(item.itemGroupIds) ? item.itemGroupIds : []),
          ...(item.itemGroupId && !Array.isArray(item.itemGroupId) ? [item.itemGroupId] : []),
        ].filter((id, index, self) => id && self.indexOf(id) === index);

        if (group.id === 'uncategorized') {
          return (
            ids.length === 0 ||
            !ids.some(id => itemGroups.some(g => g.id === id)) ||
            !validGroupIds.has(item.itemGroupId as string)
          );
        }
        return ids.includes(group.id!);
      });

      // 1. Delete all items in the group
      for (const item of itemsToDelete) {
        if (item.id) await dbOperations.deleteItem(item.id);
      }

      // 2. Delete the group itself (unless it's the virtual Uncategorized group)
      if (group.id !== 'uncategorized') {
        await dbOperations.deleteItemGroupIfUnused(group);
      }

      showSuccessMessage(`Deleted category "${group.name}" and ${itemsToDelete.length} item(s).`);
      setViewingGroup(null); // Close the modal
      await fetchAndSyncGroups();
    } catch (err: any) {
      console.error('Error deleting items and category:', err);
      setError(err.message || 'Failed to delete items and category.');
    } finally {
      setLoading(false);
      setGroupPendingFullDelete(null);
    }
  };

  const renderHeader = () => (
    <div className="flex flex-col md:flex-row md:justify-between md:items-center bg-gray-100 md:bg-white border-b border-gray-300 shadow-sm flex-shrink-0 p-2 md:px-4 md:py-3 mb-2 md:mb-0">
      <h1 className="text-2xl font-bold text-gray-800 text-center md:text-left mb-2 md:mb-0">Item Groups</h1>
      <div className="flex items-center justify-center gap-6">
        <CustomButton variant={Variant.Transparent} onClick={() => navigate(routes.addItem)} active={isActive(routes.addItem)}>Add Item</CustomButton>
        <CustomButton variant={Variant.Transparent} onClick={() => navigate(routes.itemGroups)} active={isActive(routes.itemGroups)}>Item Groups</CustomButton>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-gray-100 w-full overflow-hidden">
      {renderHeader()}

      <main className="flex-grow p-4 sm:p-6 w-full overflow-y-auto">
        {error && <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-sm text-sm font-semibold"><p>{error}</p></div>}
        {successMessage && <div className="mb-4 p-3 bg-green-100 text-green-800 rounded-sm text-sm font-semibold"><p>{successMessage}</p></div>}

        <div className="p-4 sm:p-6 bg-white rounded-sm shadow-md">
          <div className="flex flex-col gap-2 mb-6">
            <input
              type="text"
              placeholder="Create a New Group"
              value={newItemGroupName}
              onChange={(e) => setNewItemGroupName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddItemGroup()}
              className={`w-full p-3 border border-gray-300 rounded-sm bg-gray-50 focus:outline-none focus:ring-2 ${theme.focusRing}`}
            />
            <button
              onClick={handleAddItemGroup}
              disabled={loading}
              className={`self-center md:self-stretch text-white py-3 px-6 rounded-sm font-semibold shadow-sm transition ${theme.primaryBg} ${theme.primaryHoverBg} ${theme.primaryDisabledBg} disabled:cursor-not-allowed`}
            >
              Add New Group
            </button>
          </div>

          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Official Item Groups</h2>

          {loading ? (
            <div className="flex justify-center items-center py-8">
              <Spinner />
              <p className="text-gray-500 ml-2">Syncing and Loading Groups...</p>
            </div>
          ) : itemGroups.length === 0 && (groupCounts["uncategorized"] || 0) === 0 ? (
            <p className="text-gray-500 text-center py-8">No item groups found.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {itemGroups.map((group) => {
                const count = group.id ? (groupCounts[group.id] || 0) : 0;
                return (
                  <div key={group.id} className="flex items-center justify-between p-3 bg-white rounded-sm shadow-sm border">
                    {editingGroupId === group.id ? (
                      <div className="flex flex-col w-full gap-2">
                        <input type="text" value={editingGroupName} onChange={(e) => setEditingGroupName(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSaveEdit(group)} autoFocus className={`w-full p-2 border rounded-md ${theme.primaryBorder}`} />
                        <div className="flex justify-end gap-2">
                          <button onClick={() => handleSaveEdit(group)} className="bg-green-600 text-white py-1 px-3 rounded-md text-sm font-semibold">Save</button>
                          <button onClick={handleCancelEdit} className="bg-gray-500 text-white py-1 px-3 rounded-md text-sm font-semibold">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 overflow-hidden">
                          <button
                            onClick={() => setViewingGroup(group)}
                            className={`font-medium truncate hover:underline text-left text-gray-800 ${theme.primaryHoverText}`}
                          >
                            {group.name}
                          </button>
                          <span className={`text-sm px-2 py-0.5 rounded-sm font-medium ${count > 0 ? theme.primaryText : 'text-gray-500'}`}>
                            {count} {count === 1 ? 'item' : 'items'}
                          </span>
                        </div>
                        {group.name.toLowerCase().trim() !== "uncategorized" && (
                          <div className="flex gap-2 flex-shrink-0">
                            <button onClick={() => handleEditClick(group)} className={`text-gray-500 ${theme.primaryHoverText}`} aria-label={`Edit ${group.name}`}><EditIcon /></button>
                            <button
                              onClick={() => setDeleteTargetGroup(group)}
                              className="transition-colors p-1 rounded text-gray-500 hover:text-red-600"
                              aria-label={`Delete ${group.name}`}
                            >
                              <DeleteIcon />
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-sm shadow-sm border border-gray-300">
                <div className="flex items-center gap-2 overflow-hidden">
                  <button
                    onClick={() => setViewingGroup({ id: 'uncategorized', name: 'Uncategorized', description: '', createdAt: 0, updatedAt: 0 })}
                    className={`text-gray-600 font-bold hover:underline text-left ${theme.primaryHoverText}`}
                  >
                    Uncategorized
                  </button>
                  <span className={`text-sm px-2 py-0.5 rounded-sm font-medium ${theme.primaryText}`}>
                    {groupCounts["uncategorized"] || 0} items
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modals & Drawers */}
      {deleteTargetGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg w-[90%] max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Delete "{deleteTargetGroup.name}"?</h2>
            <p className="text-sm text-gray-600 mb-6">
              {deleteTargetGroup.id && groupCounts[deleteTargetGroup.id] > 0
                ? `All ${groupCounts[deleteTargetGroup.id]} item(s) will be moved to "Uncategorized".`
                : "This group has no items."}
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTargetGroup(null)} className="px-4 py-2 text-sm rounded-md bg-gray-200 hover:bg-gray-300">Cancel</button>
              <button
                onClick={async () => {
                  await handleDeleteItemGroup(deleteTargetGroup);
                  setDeleteTargetGroup(null);
                }}
                className={`px-4 py-2 text-sm rounded-md text-white ${theme.deleteButtonBg} ${theme.deleteButtonHoverBg}`}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingGroup && (() => {
        const validGroupIds = new Set(itemGroups.map(g => g.id));
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-lg shadow-lg w-[90%] max-w-lg p-6 flex flex-col max-h-[80vh]">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-800 flex-1">
                  {viewingGroup.name}
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    ({groupCounts[viewingGroup.id!] || 0} items)
                  </span>
                </h2>
                <div className="flex items-center gap-3">
                  {viewingGroup.id !== 'uncategorized' && (
                    <button
                      onClick={() => setGroupPendingFullDelete(viewingGroup)}
                      className="text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-md transition-colors whitespace-nowrap"
                    >
                      Delete Category & Items
                    </button>
                  )}
                  {viewingGroup.id === 'uncategorized' && (groupCounts["uncategorized"] || 0) > 0 && (
                    <button
                      onClick={() => setGroupPendingFullDelete(viewingGroup)}
                      className="text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-md transition-colors whitespace-nowrap"
                    >
                      Empty Uncategorized
                    </button>
                  )}
                  <button onClick={() => setViewingGroup(null)} className="text-gray-400 hover:text-gray-700 text-xl font-bold leading-none">✕</button>
                </div>
              </div>

              <div className="overflow-y-auto flex-1 space-y-2">
                {allItems.filter(item => {
                  const ids: string[] = [
                    ...(Array.isArray(item.itemGroupIds) ? item.itemGroupIds : []),
                    ...(item.itemGroupId && !Array.isArray(item.itemGroupId) ? [item.itemGroupId] : []),
                  ].filter((id, index, self) => id && self.indexOf(id) === index);

                  if (viewingGroup.id === 'uncategorized') {
                    return (
                      ids.length === 0 ||
                      !ids.some(id => itemGroups.some(g => g.id === id)) ||
                      !validGroupIds.has(item.itemGroupId)   // ← ADD THIS (orphan check)
                    );
                  }
                  return ids.includes(viewingGroup.id!);
                }).length === 0 ? (
                  <p className="text-center text-gray-400 py-8">No items in this group.</p>
                ) : (
                  allItems.filter(item => {
                    const validGroupIds = new Set(itemGroups.map(g => g.id));
                    const ids: string[] = [
                      ...(Array.isArray(item.itemGroupIds) ? item.itemGroupIds : []),
                      ...(item.itemGroupId && !Array.isArray(item.itemGroupId) ? [item.itemGroupId] : []),
                    ].filter((id, index, self) => id && self.indexOf(id) === index);

                    if (viewingGroup.id === 'uncategorized') {
                      return (
                        ids.length === 0 ||
                        !ids.some(id => itemGroups.some(g => g.id === id)) ||
                        !validGroupIds.has(item.itemGroupId)   // ← ADD THIS (orphan check)
                      );
                    }
                    return ids.includes(viewingGroup.id!);
                  })
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(item => {
                      const stock = item.stock || 0;
                      const value = stock * (item.purchasePrice || 0);
                      return (
                        <div key={item.id} className="bg-white rounded-lg shadow-sm px-3 py-3 space-y-2 border">
                          <div className="flex items-center gap-3">
                            <button onClick={() => openEditDrawer(item)} className={`${theme.editIconText} ${theme.editIconHoverText}`}>
                              <FiEdit2 size={18} />
                            </button>
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="font-semibold text-gray-800 truncate">{item.name}</span>
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${getStockBadgeClasses(stock)}`}>
                                {stock === 0 ? 'Out of stock' : `${stock} in stock`}
                              </span>
                            </div>
                            <button onClick={() => setItemPendingDelete(item)} className="text-red-600 hover:text-red-800">
                              <FiTrash2 size={18} />
                            </button>
                          </div>
                          <div className="flex items-center justify-between text-sm text-gray-600">
                            <div><span className="font-medium text-gray-700">MRP:</span> ₹{item.mrp ?? 0}</div>
                            <div><span className="font-medium text-gray-700">Purchase:</span> ₹{item.purchasePrice ?? 0}</div>
                            <div><span className="font-medium text-gray-700">Value:</span> ₹{value}</div>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>
          </div>
        );

      })()}

      <ItemEditDrawer item={selectedItemForEdit} isOpen={isEditDrawerOpen} onClose={closeEditDrawer} onSaveSuccess={() => fetchAndSyncGroups()} />

      {itemPendingDelete && (
        <Modal type={State.ERROR} message={`Are you sure you want to delete "${itemPendingDelete.name}"?`} onClose={() => setItemPendingDelete(null)} onConfirm={confirmDeleteItem} showConfirmButton={true} />
      )}
      {groupPendingFullDelete && (
        <Modal
          type={State.WARNING}
          message={
            groupPendingFullDelete.id === 'uncategorized'
              ? `Are you sure you want to completely delete ALL uncategorized items? This cannot be undone.`
              : `DANGER: Are you sure you want to completely delete the category "${groupPendingFullDelete.name}" AND all of its items? This cannot be undone.`
          }
          onClose={() => setGroupPendingFullDelete(null)}
          onConfirm={() => handleDeleteGroupAndItems(groupPendingFullDelete)}
          showConfirmButton={true}
        />
      )}

      {deleteModal && (
        <Modal message={deleteModal.message} type={deleteModal.type} onClose={() => setDeleteModal(null)} />
      )}
    </div>
  );
};
export default SharedItemGroupPage;