import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ItemGroup } from '../../constants/models';
import { useDatabase } from '../../context/auth-context';
import { ROUTES } from '../../constants/routes.constants';
import { CustomButton } from '../../Components';
import { Variant } from '../../enums';
import { Spinner } from '../../constants/Spinner';

// --- Icon Components ---
const EditIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"></path></svg>;
const DeleteIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>;

const ItemGroupPage: React.FC = () => {
  const navigate = useNavigate();
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

  const isActive = (path: string) => location.pathname === path;

  // Helper to capitalize first letter (for cleaner group names)
  const toTitleCase = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };

  const fetchAndSyncGroups = useCallback(async () => {
    if (!dbOperations) {
      setLoading(true);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // 1. Get all items and all existing groups
      const [allItems, initialGroups] = await Promise.all([
        dbOperations.syncItems(),
        dbOperations.getItemGroups(),
      ]);

      // 2. Map existing groups by ID and Lowercase Name
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

      // 3. Identify Names that need to be created
      // We use a Set of LOWERCASE names to ensure "Fruits" and "fruits" are treated as one group.
      const uniqueNamesToCreate = new Set<string>();

      allItems.forEach(item => {
        if (!item.itemGroupId) return;

        const idOrName = item.itemGroupId;

        // If it's ALREADY a valid ID, ignore it.
        if (groupMapById.has(idOrName)) return;

        // It is NOT a valid ID. Is it an existing Group Name?
        const lowerName = idOrName.toLowerCase().trim();
        if (groupMapByName.has(lowerName)) {
          // It matches an existing group name. We will update the item later.
          return;
        }

        // It is NOT an ID and NOT an existing group. It needs to be created.
        // We filter out likely "junk" IDs (long alphanumeric strings) if you want, 
        // but for now, we assume anything not matched is a Name.
        if (idOrName.length < 20) {
          uniqueNamesToCreate.add(lowerName);
        }
      });

      // 4. Create the missing groups (if any)
      if (uniqueNamesToCreate.size > 0) {
        showSuccessMessage(`Creating ${uniqueNamesToCreate.size} new group(s)...`);

        // Convert Set to Array and create groups
        const createPromises = Array.from(uniqueNamesToCreate).map(lowerName =>
          dbOperations.createItemGroup({
            name: toTitleCase(lowerName), // Convert "fruits" -> "Fruits"
            description: 'Auto-created from items'
          })
        );

        await Promise.all(createPromises);

        // 5. CRITICAL: Re-fetch groups to get the IDs of the groups we just created
        const updatedGroups = await dbOperations.getItemGroups();
        refreshMaps(updatedGroups); // Update our maps with the new IDs
        setItemGroups(updatedGroups);
      } else {
        setItemGroups(initialGroups);
      }

      // 6. Update Items: converting Names -> IDs
      const itemsToUpdate: { itemId: string, newGroupId: string }[] = [];

      allItems.forEach(item => {
        if (!item.itemGroupId) return;

        // If it's already a valid ID, we are good.
        if (groupMapById.has(item.itemGroupId)) return;

        // It's a name. Find the corresponding ID in our (possibly updated) map.
        const lowerName = item.itemGroupId.toLowerCase().trim();
        const targetGroup = groupMapByName.get(lowerName);

        if (targetGroup && targetGroup.id) {
          itemsToUpdate.push({ itemId: item.id!, newGroupId: targetGroup.id });
        }
      });

      // 7. Execute Item Updates
      if (itemsToUpdate.length > 0) {
        showSuccessMessage(`Syncing... Linking ${itemsToUpdate.length} item(s) to groups.`);
        for (const update of itemsToUpdate) {
          await dbOperations.updateItem(update.itemId, { itemGroupId: update.newGroupId });
        }
      }
      const counts: Record<string, number> = {};
      let uncategorizedCount = 0;

      allItems.forEach(item => {
        const groupId = item.itemGroupId;
        if (groupId && groupMapById.has(groupId)) {
          counts[groupId] = (counts[groupId] || 0) + 1;
        } else {
          uncategorizedCount++;
        }
      });

      setGroupCounts({ ...counts, "virtual-uncategorized": uncategorizedCount });

      setItemGroups(prev => [...prev].sort((a, b) => a.name.localeCompare(b.name)));

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
  const renderHeader = () => (
    <div className="flex flex-col md:flex-row md:justify-between md:items-center bg-gray-100 md:bg-white border-b border-gray-300 shadow-sm flex-shrink-0 p-2 md:px-4 md:py-3 mb-2 md:mb-0">
      <h1 className="text-2xl font-bold text-gray-800 text-center md:text-left mb-2 md:mb-0">Item Groups</h1>
      <div className="flex items-center justify-center gap-6">
        <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.ITEM_ADD)} active={isActive(ROUTES.ITEM_ADD)}>Item Add</CustomButton>
        <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.ITEM_GROUP)} active={isActive(ROUTES.ITEM_GROUP)}>Item Groups</CustomButton>
      </div>
    </div>
  );


  return (

    <main className="flex-grow bg-gray-100 w-full overflow-y-auto">
      {error && <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-sm text-sm font-semibold"><p>{error}</p></div>}
      {successMessage && <div className="mb-4 p-3 bg-green-100 text-green-800 rounded-sm text-sm font-semibold"><p>{successMessage}</p></div>}
      {renderHeader()}
      <div className="p-4 sm:p-6 bg-white rounded-sm shadow-md">
        <div className="flex flex-col gap-2 mb-6">
          <input type="text" placeholder="Create a New Group" value={newItemGroupName} onChange={(e) => setNewItemGroupName(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleAddItemGroup()}
            className="w-full p-3 border border-gray-300 rounded-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={handleAddItemGroup} disabled={loading} className="self-center bg-sky-500 text-white py-3 px-6 rounded-sm font-semibold shadow-sm transition hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed">Add New Group</button>
        </div>

        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Official Item Groups</h2>
        {loading ? (
          <div className="flex justify-center items-center py-8">
            <Spinner />
            <p className="text-gray-500 ml-2">Syncing and Loading Groups...</p>
          </div>
        ) : itemGroups.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No item groups found.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {itemGroups.map((group) => {
              const count = group.id ? (groupCounts[group.id] || 0) : 0;
              return (
                <div key={group.id} className="flex items-center justify-between p-3 bg-white rounded-sm shadow-sm border">
                  {editingGroupId === group.id ? (
                    <div className="flex flex-col w-full gap-2">
                      <input type="text" value={editingGroupName} onChange={(e) => setEditingGroupName(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSaveEdit(group)} autoFocus className="w-full p-2 border border-blue-500 rounded-md" />
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleSaveEdit(group)} className="bg-green-600 text-white py-1 px-3 rounded-md text-sm font-semibold">Save</button>
                        <button onClick={handleCancelEdit} className="bg-gray-500 text-white py-1 px-3 rounded-md text-sm font-semibold">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className="text-gray-800 font-medium truncate">{group.name}</span>
                        <span className={`text-sm px-2 py-0.5 rounded-sm font-medium ${count > 0 ? 'text-blue-900' : 'text-gray-500'}`}>
                          {count} {count === 1 ? 'item' : 'items'}
                        </span>
                      </div>
                      {group.name.toLowerCase().trim() !== "uncategorized" && (
                        <div className="flex gap-2 flex-shrink-0">
                          <button onClick={() => handleEditClick(group)} className="text-gray-500 hover:text-blue-600" aria-label={`Edit ${group.name}`}><EditIcon /></button>
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
                <span className="text-gray-600 font-bold">Uncategorized</span>
                <span className="text-sm px-2 py-0.5 rounded-sm font-medium text-[#F97316]">
                  {groupCounts["virtual-uncategorized"] || 0} items
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
      {deleteTargetGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg w-[90%] max-w-md p-6">

            <h2 className="text-lg font-semibold text-gray-800 mb-2">
              Delete "{deleteTargetGroup.name}"?
            </h2>

            <p className="text-sm text-gray-600 mb-6">
              {deleteTargetGroup.id && groupCounts[deleteTargetGroup.id] > 0
                ? `All ${groupCounts[deleteTargetGroup.id]} item(s) will be moved to "Uncategorized".`
                : "This group has no items."}
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTargetGroup(null)}
                className="px-4 py-2 text-sm rounded-md bg-gray-200 hover:bg-gray-300"
              >
                Cancel
              </button>

              <button
                onClick={async () => {
                  await handleDeleteItemGroup(deleteTargetGroup);
                  setDeleteTargetGroup(null);
                }}
                className="px-4 py-2 text-sm rounded-md bg-red-500 text-white hover:bg-red-600"
              >
                Delete
              </button>
            </div>

          </div>
        </div>
      )}
    </main>
  );
};

export default ItemGroupPage;