import React, { useState, useEffect, useCallback, useMemo} from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { ItemGroup } from '../../constants/models';
import { useDatabase } from '../../context/auth-context';
import { Button } from '../../Components/ui/button';
import { Input } from '../../Components/ui/input';
import { EmptyState } from '../../Components/ui/empty-state';
import { Spinner } from '../../constants/Spinner';
import { ItemEditDrawer } from '../../Components/ItemDrawer';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';
import {
  Layers,
  Search,
  Plus,
  Pencil,
  Trash2,
  Check,
  X as XIcon,
  FolderOpen,
  AlertTriangle,
  Package,
  Tag,
} from 'lucide-react';
import { PageNavToggle } from './components/PageNavToggle';

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
  // `theme` is retained for prop-shape/backward compatibility only; the
  // shared design system now supplies all colors, so its fields are no
  // longer consumed here (see SharedItemGroupProps for the full shape).
  void theme;
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
  const [itemSearchQuery, setItemSearchQuery] = useState<string>('');
  const [selectedItemForEdit, setSelectedItemForEdit] = useState<any | null>(null);
  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
  const [itemPendingDelete, setItemPendingDelete] = useState<any | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ message: string; type: State } | null>(null);
  const [groupPendingFullDelete, setGroupPendingFullDelete] = useState<ItemGroup | null>(null);
  const isActive = (path: string) => location.pathname === path;
const displayedItemGroups = useMemo(() => {
    const query = newItemGroupName.trim().toLowerCase();
    if (!query) return itemGroups;

    return [...itemGroups].sort((a, b) => {
      const aMatch = a.name.toLowerCase().includes(query);
      const bMatch = b.name.toLowerCase().includes(query);
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return 0; // keep original relative order otherwise
    });
  }, [itemGroups, newItemGroupName]);
  const toTitleCase = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };

  const getStockBadgeClasses = (stock: number) => {
    if (stock === 0) return 'bg-destructive/12 text-destructive';
    if (stock < 10) return 'bg-warning/15 text-warning-foreground dark:text-warning';
    return 'bg-success/12 text-success';
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
    <header className="glass mx-3 mt-3 flex flex-shrink-0 flex-col gap-3 rounded-2xl p-3 shadow-sm md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-gradient-to-br from-primary to-[oklch(0.6_0.22_330)] p-[3px] shadow-sm shadow-primary/20">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[13px] bg-gradient-brand text-white">
            <Layers className="size-4" />
          </span>
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground md:text-xl">
            Item <span className="text-gradient">Groups</span>
          </h1>
          <p className="text-xs text-muted-foreground">Organize your catalogue into categories</p>
        </div>
      </div>
      <div className="flex items-center justify-center gap-2">
        <PageNavToggle
          items={[
            { key: 'add', label: 'Add Item', icon: <Tag className="size-3.5" />, path: routes.addItem },
            { key: 'groups', label: 'Item Groups', icon: <Layers className="size-3.5" />, path: routes.itemGroups },
          ]}
          isActive={isActive}
          onSelect={(path) => navigate(path)}
        />
      </div>
    </header>
  );

  return (
    <div className="aurora flex h-full w-full flex-col overflow-hidden bg-muted">
      {renderHeader()}

      <main className="w-full flex-grow overflow-y-auto p-4 sm:p-6">
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
            <AlertTriangle className="size-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}
        {successMessage && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-sm font-medium text-success">
            <Check className="size-4 shrink-0" />
            <p>{successMessage}</p>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card p-4 shadow-xs sm:p-6">
          <div className="mb-6 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search or create a new group"
                value={newItemGroupName}
                onChange={(e) => setNewItemGroupName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddItemGroup()}
                className="h-11 pl-9"
              />
            </div>
            <Button
              onClick={handleAddItemGroup}
              disabled={loading}
              className="h-11 gap-1.5 bg-gradient-brand text-white shadow-md shadow-primary/20 hover:opacity-90 sm:w-auto"
            >
              <Plus className="size-4" />
              Add Group
            </Button>
          </div>

          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">Official Item Groups</h2>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10">
              <Spinner />
              <p className="text-muted-foreground">Syncing and loading groups...</p>
            </div>
          ) : itemGroups.length === 0 && (groupCounts["uncategorized"] || 0) === 0 ? (
            <EmptyState
              icon={<FolderOpen />}
              title="No item groups yet"
              description="Create your first group above to start organizing your catalogue."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {displayedItemGroups.map((group) => {
                const count = group.id ? (groupCounts[group.id] || 0) : 0;
                return (
                  <div
                    key={group.id}
                    className="group flex items-center justify-between gap-2 rounded-2xl border border-border bg-card p-3 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
                  >
                    {editingGroupId === group.id ? (
                      <div className="flex w-full flex-col gap-2">
                        <Input
                          type="text"
                          value={editingGroupName}
                          onChange={(e) => setEditingGroupName(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && handleSaveEdit(group)}
                          autoFocus
                        />
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={handleCancelEdit} className="gap-1">
                            <XIcon className="size-3.5" />
                            Cancel
                          </Button>
                          <Button size="sm" onClick={() => handleSaveEdit(group)} className="gap-1 bg-gradient-brand text-white hover:opacity-90">
                            <Check className="size-3.5" />
                            Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-info/20 text-primary shadow-inner">
                            <Layers className="size-4" />
                          </span>
                          <div className="flex min-w-0 flex-col">
                            <button
                              onClick={() => { setViewingGroup(group); setItemSearchQuery(''); }}
                              className="truncate text-left text-sm font-semibold text-foreground hover:underline"
                            >
                              {group.name}
                            </button>
                            <span className="text-xs font-medium text-muted-foreground">
                              {count} {count === 1 ? 'item' : 'items'}
                            </span>
                          </div>
                        </div>
                        {group.name.toLowerCase().trim() !== "uncategorized" && (
                          <div className="flex shrink-0 gap-1 opacity-80 transition-opacity group-hover:opacity-100">
                            <button
                              onClick={() => handleEditClick(group)}
                              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                              aria-label={`Edit ${group.name}`}
                            >
                              <Pencil className="size-4" />
                            </button>
                            <button
                              onClick={() => setDeleteTargetGroup(group)}
                              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                              aria-label={`Delete ${group.name}`}
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
              <div className="flex items-center justify-between gap-2 rounded-2xl border border-dashed border-border bg-muted p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted-foreground/10 text-muted-foreground">
                    <Package className="size-4" />
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <button
                      onClick={() => { setViewingGroup({ id: 'uncategorized', name: 'Uncategorized', description: '', createdAt: 0, updatedAt: 0 }); setItemSearchQuery(''); }}
                      className="truncate text-left text-sm font-semibold text-muted-foreground hover:underline"
                    >
                      Uncategorized
                    </button>
                    <span className="text-xs font-medium text-muted-foreground">
                      {groupCounts["uncategorized"] || 0} items
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modals & Drawers */}
      {deleteTargetGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-destructive/12 text-destructive">
                <AlertTriangle className="size-5" />
              </span>
              <h2 className="text-lg font-semibold text-foreground">Delete &quot;{deleteTargetGroup.name}&quot;?</h2>
            </div>
            <p className="mb-6 text-sm text-muted-foreground">
              {deleteTargetGroup.id && groupCounts[deleteTargetGroup.id] > 0
                ? `All ${groupCounts[deleteTargetGroup.id]} item(s) will be moved to "Uncategorized".`
                : "This group has no items."}
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setDeleteTargetGroup(null)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  await handleDeleteItemGroup(deleteTargetGroup);
                  setDeleteTargetGroup(null);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {viewingGroup && (() => {
        const validGroupIds = new Set(itemGroups.map(g => g.id));
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-card p-6 shadow-2xl">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-info/20 text-primary shadow-inner">
                    <Layers className="size-4" />
                  </span>
                  <h2 className="min-w-0 truncate text-lg font-semibold text-foreground">
                    {viewingGroup.name}
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      ({groupCounts[viewingGroup.id!] || 0} items)
                    </span>
                  </h2>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {viewingGroup.id !== 'uncategorized' && (
                    <button
                      onClick={() => setGroupPendingFullDelete(viewingGroup)}
                      className="whitespace-nowrap rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/15"
                    >
                      Delete Category &amp; Items
                    </button>
                  )}
                  {viewingGroup.id === 'uncategorized' && (groupCounts["uncategorized"] || 0) > 0 && (
                    <button
                      onClick={() => setGroupPendingFullDelete(viewingGroup)}
                      className="whitespace-nowrap rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/15"
                    >
                      Empty Uncategorized
                    </button>
                  )}
                  <button
                    onClick={() => { setViewingGroup(null); setItemSearchQuery(''); }}
                    className="rounded-lg p-1.5 leading-none text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label="Close"
                  >
                    <XIcon className="size-4" />
                  </button>
                </div>
              </div>
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search items in this group..."
                  value={itemSearchQuery}
                  onChange={(e) => setItemSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto">
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
                }).filter(item => {
                  const query = itemSearchQuery.trim().toLowerCase();
                  if (!query) return true;
                  return item.name.toLowerCase().includes(query);
                }).length === 0 ? (
                  <EmptyState
                    icon={<Package />}
                    title={itemSearchQuery.trim() ? 'No matching items found' : 'No items in this group'}
                    className="border-none py-8"
                  />
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
                    .filter(item => {
                      const query = itemSearchQuery.trim().toLowerCase();
                      if (!query) return true;
                      return item.name.toLowerCase().includes(query);
                    })
                    .sort((a, b) => {
                      const query = itemSearchQuery.trim().toLowerCase();
                      if (query) {
                        const aStarts = a.name.toLowerCase().startsWith(query);
                        const bStarts = b.name.toLowerCase().startsWith(query);
                        if (aStarts && !bStarts) return -1;
                        if (!aStarts && bStarts) return 1;
                      }
                      return a.name.localeCompare(b.name);
                    })
                    .map(item => {
                      const stock = item.stock || 0;
                      const value = stock * (item.purchasePrice || 0);
                      return (
                        <div key={item.id} className="space-y-2 rounded-xl border border-border bg-card px-3 py-3 shadow-xs transition-colors hover:border-primary/30">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => openEditDrawer(item)}
                              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                              aria-label={`Edit ${item.name}`}
                            >
                              <Pencil className="size-4" />
                            </button>
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              <span className="truncate font-semibold text-foreground">{item.name}</span>
                              <span className={`whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ${getStockBadgeClasses(stock)}`}>
                                {stock === 0 ? 'Out of stock' : `${stock} in stock`}
                              </span>
                            </div>
                            <button
                              onClick={() => setItemPendingDelete(item)}
                              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                              aria-label={`Delete ${item.name}`}
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                          <div className="flex items-center justify-between text-sm text-muted-foreground">
                            <div><span className="font-medium text-foreground">MRP:</span> ₹{item.mrp ?? 0}</div>
                            <div><span className="font-medium text-foreground">Purchase:</span> ₹{item.purchasePrice ?? 0}</div>
                            <div><span className="font-medium text-foreground">Value:</span> ₹{value}</div>
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