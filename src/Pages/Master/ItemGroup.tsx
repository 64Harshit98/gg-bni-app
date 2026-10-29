import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { ItemGroup } from '../../constants/models';
import { useAuth, useDatabase } from '../../context/auth-context';
import { useItemSettings } from '../../context/SettingsContext';
import { AddOnManager } from '../../Components/AddonManager';
import { Spinner } from '../../constants/Spinner';
import { FiTrash2, FiSearch, FiPackage, FiTag, FiGift, FiShoppingBag, FiGrid, FiList, FiPlus, FiMoreHorizontal, FiChevronDown, FiCopy, FiSliders, FiCheck, FiImage, FiX } from 'react-icons/fi';
import { IconEdit } from '../../constants/Icons';
import { ItemEditDrawer } from '../../Components/ItemDrawer';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';
import { ItemGroupViewModal } from '../../Components/ItemGroupViewModal';

// --- UI only: colour chips for group cards (cycled by index) ---
const GROUP_CHIPS = [
  { Icon: FiPackage, classes: 'bg-green-50 text-green-700' },
  { Icon: FiTag, classes: 'bg-amber-50 text-amber-700' },
  { Icon: FiGift, classes: 'bg-fuchsia-50 text-fuchsia-700' },
  { Icon: FiShoppingBag, classes: 'bg-red-50 text-red-600' },
  { Icon: FiGrid, classes: 'bg-slate-100 text-slate-600' },
];

// Design-system action colours. Kept as literals in THIS file so Tailwind always generates them,
// even if the theme file is outside its `content` paths or the wrapper doesn't pass actionBg etc.
const ACTION_COLOURS = {
  blue: { bg: 'bg-[#155dfc]', hover: 'hover:bg-[#1447e6]', border: 'border-[#155dfc]' },
  orange: { bg: 'bg-[#c2410c]', hover: 'hover:bg-[#9a3412]', border: 'border-[#c2410c]' },
};

type SortKey = 'items' | 'name' | 'recent';
type ViewMode = 'grid' | 'list';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'items', label: 'Most items' },
  { key: 'name', label: 'A–Z' },
  { key: 'recent', label: 'Recently changed' },
];

// updatedAt can be a number, a Firestore Timestamp or {seconds}
const toMillis = (v: any): number => {
  if (typeof v === 'number') return v;
  if (v && typeof v.toMillis === 'function') return v.toMillis();
  if (v && typeof v.seconds === 'number') return v.seconds * 1000;
  return 0;
};

// Same threshold the page already uses in getStockBadgeClasses (stock < 10)
const LOW_STOCK_THRESHOLD = 10;

// Names that differ only by case / spaces / punctuation / a trailing "s" are treated as the same
const normalizeGroupName = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/s$/, '');
const looksLikeDuplicate = (a: string, b: string) => {
  const na = normalizeGroupName(a);
  const nb = normalizeGroupName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = Math.min(na.length, nb.length);
  return shorter >= 8 && (na.startsWith(nb) || nb.startsWith(na));
};

const formatCompactINR = (n: number) => {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1).replace(/\.0$/, '')}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1).replace(/\.0$/, '')}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `₹${Math.round(n)}`;
};

// Category image: centre-crop to 128x128, JPEG, compressed until it is small enough for a Firestore doc
const CATEGORY_IMAGE_SIZE = 128;
const CATEGORY_IMAGE_MAX_BYTES = 10 * 1024; // ~10 KB
const CATEGORY_IMAGE_MAX_UPLOAD_MB = 10;

const fileToCategoryImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Please choose an image file.'));
    if (file.size > CATEGORY_IMAGE_MAX_UPLOAD_MB * 1024 * 1024) {
      return reject(new Error(`Image is too large. Max ${CATEGORY_IMAGE_MAX_UPLOAD_MB} MB.`));
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not load the image.'));
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = CATEGORY_IMAGE_SIZE;
        canvas.height = CATEGORY_IMAGE_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Could not process the image.'));
        ctx.fillStyle = '#ffffff'; // transparent PNGs would turn black in JPEG
        ctx.fillRect(0, 0, CATEGORY_IMAGE_SIZE, CATEGORY_IMAGE_SIZE);
        ctx.drawImage(img, sx, sy, side, side, 0, 0, CATEGORY_IMAGE_SIZE, CATEGORY_IMAGE_SIZE);

        let quality = 0.8;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length * 0.75 > CATEGORY_IMAGE_MAX_BYTES && quality > 0.4) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        resolve(dataUrl);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });

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
    /** optional page background tint, e.g. 'bg-[#eef2ff]' (POS) / 'bg-[#fff5ec]' (Catalogue). Falls back to bg-gray-100 */
    canvasBg?: string;
    /** optional soft primary ground, e.g. 'bg-blue-50' (POS) / 'bg-orange-50' (Catalogue). Falls back to bg-blue-50 */
    primarySoftBg?: string;
    /** optional design-system action colour for primary buttons on this page. Fall back to primaryBg / primaryHoverBg / primaryBorder */
    actionBg?: string;
    actionHoverBg?: string;
    actionBorder?: string;
  };
}

export const SharedItemGroupPage: React.FC<SharedItemGroupProps> = ({ routes, theme }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const dbOperations = useDatabase();
  const { currentUser } = useAuth();
  const { itemSettings } = useItemSettings();
  const addOnsEnabled = !!(itemSettings as any)?.enableAddOns; // the Add-ons button follows the Item settings toggle
  const [isAddOnManagerOpen, setIsAddOnManagerOpen] = useState(false);

  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [newItemGroupName, setNewItemGroupName] = useState<string>('');
  const [groupCounts, setGroupCounts] = useState<Record<string, number>>({});
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState<string>('');
  const [editingGroupImage, setEditingGroupImage] = useState<string>(''); // '' = no image
  const [deleteTargetGroup, setDeleteTargetGroup] = useState<ItemGroup | null>(null);
  const [viewingGroup, setViewingGroup] = useState<ItemGroup | null>(null);
  const [allItems, setAllItems] = useState<any[]>([]);
  const [_itemSearchQuery, setItemSearchQuery] = useState<string>('');
  const [selectedItemForEdit, setSelectedItemForEdit] = useState<any | null>(null);
  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
  const [itemPendingDelete, setItemPendingDelete] = useState<any | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ message: string; type: State } | null>(null);
  const [groupPendingFullDelete, setGroupPendingFullDelete] = useState<ItemGroup | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('items');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [openMenuGroupId, setOpenMenuGroupId] = useState<string | null>(null);
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [mergeKeepIds, setMergeKeepIds] = useState<Record<string, string>>({});
  const [pendingMerge, setPendingMerge] = useState<{ keep: ItemGroup; duplicates: ItemGroup[] } | null>(null);
  const [isNewGroupModalOpen, setIsNewGroupModalOpen] = useState(false);
  const [newGroupModalName, setNewGroupModalName] = useState('');
  const [newGroupModalError, setNewGroupModalError] = useState<string | null>(null);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isActive = (path: string) => location.pathname === path;
  const displayedItemGroups = useMemo(() => {
    const sorted = [...itemGroups].sort((a, b) => {
      if (sortBy === 'items') {
        const diff = (groupCounts[b.id ?? ''] || 0) - (groupCounts[a.id ?? ''] || 0);
        return diff !== 0 ? diff : a.name.localeCompare(b.name);
      }
      if (sortBy === 'recent') return toMillis((b as any).updatedAt) - toMillis((a as any).updatedAt);
      return a.name.localeCompare(b.name);
    });

    const query = newItemGroupName.trim().toLowerCase();
    if (!query) return sorted;

    return sorted.sort((a, b) => {
      const aMatch = a.name.toLowerCase().includes(query);
      const bMatch = b.name.toLowerCase().includes(query);
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return 0; // keep sorted relative order otherwise
    });
  }, [itemGroups, newItemGroupName, sortBy, groupCounts]);

  const groupIdToName = useMemo(() => {
    const map = new Map<string, string>();
    itemGroups.forEach(g => { if (g.id) map.set(g.id, g.name); });
    return map;
  }, [itemGroups]);

  const matchingItems = useMemo(() => {
    const query = newItemGroupName.trim().toLowerCase();
    if (!query) return [];
    return allItems
      .filter(item => item.name?.toLowerCase().includes(query))
      .slice(0, 20); // cap results so the list doesn't explode
  }, [allItems, newItemGroupName]);

  // UI only (display values for stats row + group cards). Read-only derivations, no state writes.
  const groupStockValue = useMemo(() => {
    const map: Record<string, number> = {};
    allItems.forEach(item => {
      const ids: string[] = [
        ...(Array.isArray(item.itemGroupIds) ? item.itemGroupIds : []),
        ...(item.itemGroupId && !Array.isArray(item.itemGroupId) ? [item.itemGroupId] : []),
      ].filter((id, index, self) => id && self.indexOf(id) === index);
      const value = (item.stock || 0) * (item.purchasePrice || 0);
      ids.forEach(id => { map[id] = (map[id] || 0) + value; });
    });
    return map;
  }, [allItems]);

  const groupLowStock = useMemo(() => {
    const map: Record<string, number> = {};
    allItems.forEach(item => {
      const stock = item.stock || 0;
      if (!(stock > 0 && stock < LOW_STOCK_THRESHOLD)) return;
      const ids: string[] = [
        ...(Array.isArray(item.itemGroupIds) ? item.itemGroupIds : []),
        ...(item.itemGroupId && !Array.isArray(item.itemGroupId) ? [item.itemGroupId] : []),
      ].filter((id, index, self) => id && self.indexOf(id) === index);
      ids.forEach(id => { map[id] = (map[id] || 0) + 1; });
    });
    return map;
  }, [allItems]);

  // Clusters of groups whose names look near-identical (union-find over pairs)
  const duplicateClusters = useMemo(() => {
    const list = itemGroups.filter(g => g.id && g.name.trim().toLowerCase() !== 'uncategorized');
    const parent = list.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (looksLikeDuplicate(list[i].name, list[j].name)) parent[find(j)] = find(i);
      }
    }
    const buckets = new Map<number, ItemGroup[]>();
    list.forEach((g, i) => {
      const root = find(i);
      buckets.set(root, [...(buckets.get(root) || []), g]);
    });
    return Array.from(buckets.values()).filter(c => c.length > 1);
  }, [itemGroups]);

  const trimmedQuery = newItemGroupName.trim();
  const canCreateGroup =
    trimmedQuery !== '' && !itemGroups.some(g => g.name.toLowerCase() === trimmedQuery.toLowerCase());

  // Same rule for the New group popup
  const modalTrimmedName = newGroupModalName.trim();
  const modalNameExists =
    modalTrimmedName !== '' && itemGroups.some(g => g.name.toLowerCase() === modalTrimmedName.toLowerCase());
  const canCreateFromModal = modalTrimmedName !== '' && !modalNameExists;

  const actionPalette = /orange|f97316|ea580c|c2410c/i.test(theme.primaryBg) ? ACTION_COLOURS.orange : ACTION_COLOURS.blue;
  const actionBg = theme.actionBg ?? actionPalette.bg;
  const actionHoverBg = theme.actionHoverBg ?? actionPalette.hover;
  const actionBorder = theme.actionBorder ?? actionPalette.border;

  const getChip = (index: number) => {
    const slot = index % GROUP_CHIPS.length;
    const base = GROUP_CHIPS[slot];
    // first slot follows the page theme (blue on POS, orange on Catalogue)
    return slot === 0 ? { ...base, classes: `${theme.primarySoftBg ?? 'bg-blue-50'} ${theme.primaryText}` } : base;
  };

  const uncategorizedCount = groupCounts["uncategorized"] || 0;
  const emptyGroupsCount = useMemo(
    () => itemGroups.filter(g => g.id && !(groupCounts[g.id] > 0)).length,
    [itemGroups, groupCounts]
  );
  const viewingGroupItems = useMemo(() => {
    if (!viewingGroup) return [];
    const validGroupIds = new Set(itemGroups.map(g => g.id));
    return allItems.filter(item => {
      const ids: string[] = [
        ...(Array.isArray(item.itemGroupIds) ? item.itemGroupIds : []),
        ...(item.itemGroupId && !Array.isArray(item.itemGroupId) ? [item.itemGroupId] : []),
      ].filter((id, index, self) => id && self.indexOf(id) === index);

      if (viewingGroup.id === 'uncategorized') {
        return (
          ids.length === 0 ||
          !ids.some(id => validGroupIds.has(id)) ||
          !validGroupIds.has(item.itemGroupId)
        );
      }
      return ids.includes(viewingGroup.id!);
    });
  }, [viewingGroup, allItems, itemGroups]);
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

  const openNewGroupModal = () => {
    setNewGroupModalName('');
    setNewGroupModalError(null);
    setIsNewGroupModalOpen(true);
  };

  const closeNewGroupModal = () => {
    if (isCreatingGroup) return;
    setIsNewGroupModalOpen(false);
    setNewGroupModalName('');
    setNewGroupModalError(null);
  };

  const handleCreateGroupFromModal = async () => {
    const name = newGroupModalName.trim();
    if (name === '') return setNewGroupModalError('Item group name cannot be empty.');
    if (itemGroups.some(g => g.name.toLowerCase() === name.toLowerCase())) {
      return setNewGroupModalError('This group name already exists.');
    }
    if (!dbOperations) return;

    setIsCreatingGroup(true);
    setNewGroupModalError(null);
    try {
      await dbOperations.createItemGroup({ name, description: '' });
      setIsNewGroupModalOpen(false);
      setNewGroupModalName('');
      showSuccessMessage('Group created successfully!');
      await fetchAndSyncGroups();
    } catch (err) {
      console.error('Error adding item group:', err);
      setNewGroupModalError('Failed to add item group.');
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const handleEditClick = (group: ItemGroup) => {
    setEditingGroupId(group.id ?? null);
    setEditingGroupName(group.name);
    setEditingGroupImage(group.imageUrl ?? '');
  };

  const handleCancelEdit = () => {
    setEditingGroupId(null);
    setEditingGroupName('');
    setEditingGroupImage('');
    setError(null);
  };

  const handleCategoryImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // same file dobara choose ho sake
    if (!file) return;
    try {
      setEditingGroupImage(await fileToCategoryImage(file));
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to process image.');
    }
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
    if (newName === '') {
      handleCancelEdit();
      return;
    }
    const nameChanged = newName !== groupToUpdate.name;
    const imageChanged = editingGroupImage !== (groupToUpdate.imageUrl ?? '');
    if (!nameChanged && !imageChanged) {
      handleCancelEdit();
      return;
    }
    if (!dbOperations) return;

    setError(null);
    try {
      if (nameChanged) {
        await dbOperations.updateGroupAndSyncItems(groupToUpdate, newName);
      }
      if (imageChanged && groupToUpdate.id) {
        await dbOperations.updateItemGroup(groupToUpdate.id, { imageUrl: editingGroupImage });
      }
      handleCancelEdit();
      await fetchAndSyncGroups();
      showSuccessMessage(
        nameChanged
          ? `Group renamed to "${newName}" and items updated.`
          : 'Group image updated.'
      );
    } catch (err: any) {
      console.error('Error updating item group:', err);
      setError(err.message || 'Failed to update group.');
    }
  };
  const handleRenameFromModal = async (newName: string) => {
    if (!dbOperations || !viewingGroup || viewingGroup.id === 'uncategorized') return;
    await dbOperations.updateGroupAndSyncItems(viewingGroup, newName); // error modal ko throw hoga
    setViewingGroup({ ...viewingGroup, name: newName });
    await fetchAndSyncGroups();
    showSuccessMessage(`Group renamed to "${newName}" and items updated.`);
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

  const handleMergeGroups = async (keep: ItemGroup, duplicates: ItemGroup[]) => {
    if (!dbOperations || !keep.id) return;
    const keepId: string = keep.id;
    const dupIds = new Set(duplicates.map(d => d.id).filter(Boolean) as string[]);
    try {
      setLoading(true);
      const items = await dbOperations.syncItems();
      let moved = 0;

      for (const item of items) {
        if (!item.id) continue;
        const updates: any = {};
        if (typeof item.itemGroupId === 'string' && dupIds.has(item.itemGroupId)) {
          updates.itemGroupId = keepId;
        }
        if (Array.isArray(item.itemGroupIds) && item.itemGroupIds.some((id: string) => dupIds.has(id))) {
          const mapped: string[] = item.itemGroupIds.map((id: string) => (dupIds.has(id) ? keepId : id));
          updates.itemGroupIds = mapped.filter((id, index, self) => self.indexOf(id) === index);
        }
        if (Object.keys(updates).length > 0) {
          await dbOperations.updateItem(item.id, updates);
          moved++;
        }
      }

      for (const dup of duplicates) {
        await dbOperations.deleteItemGroupIfUnused(dup);
      }

      showSuccessMessage(`Merged ${duplicates.length} group(s) into "${keep.name}". ${moved} item(s) moved.`);
      await fetchAndSyncGroups();
    } catch (err: any) {
      console.error('Error merging groups:', err);
      setError(err.message || 'Failed to merge groups.');
    } finally {
      setLoading(false);
      setPendingMerge(null);
    }
  };

  const renderTabs = (full: boolean) => (
    <div role="group" className={`${full ? 'flex w-full' : 'inline-flex'} p-[3px] gap-0.5 bg-gray-50 border border-gray-200 rounded-sm`}>
      <button
        type="button"
        onClick={() => navigate(routes.addItem)}
        aria-pressed={isActive(routes.addItem)}
        className={`${full ? 'flex-1 h-[34px] text-[13px]' : 'h-8 px-4 text-sm'} whitespace-nowrap inline-flex items-center justify-center rounded-sm font-medium transition-colors ${isActive(routes.addItem) ? `bg-white shadow-sm ${theme.primaryText}` : 'text-slate-600 hover:text-slate-900'}`}
      >
        Add item
      </button>
      <button
        type="button"
        onClick={() => navigate(routes.itemGroups)}
        aria-pressed={isActive(routes.itemGroups)}
        className={`${full ? 'flex-1 h-[34px] text-[13px]' : 'h-8 px-4 text-sm'} whitespace-nowrap inline-flex items-center justify-center gap-1.5 rounded-sm font-medium transition-colors ${isActive(routes.itemGroups) ? `bg-white shadow-sm ${theme.primaryText}` : 'text-slate-600 hover:text-slate-900'}`}
      >
        Item groups
        <span className="text-[11px] font-semibold min-w-[22px] h-5 leading-5 px-1.5 rounded-sm bg-gray-100 text-slate-600 tabular-nums">{itemGroups.length}</span>
      </button>
    </div>
  );

  const renderHeader = () => (
    <div className="flex-shrink-0">
      <div className="flex items-center gap-2 bg-white border-b border-gray-200 px-4 py-2 lg:px-6 lg:py-4 lg:gap-4">
        <div className="flex-1 min-w-0 text-left">
          <h1 className="text-lg lg:text-2xl font-semibold tracking-tight text-slate-900 leading-tight">Item groups</h1>
          <p className="text-xs text-slate-500 mt-0.5 truncate">
            {itemGroups.length} {itemGroups.length === 1 ? 'group' : 'groups'} · {uncategorizedCount} {uncategorizedCount === 1 ? 'item' : 'items'} not in any group
          </p>
        </div>

        {/* Phone: sort lives in the header as an icon (native picker opens on tap) */}
        <div className="relative lg:hidden flex-shrink-0">
          <button
            type="button"
            aria-label="Sort groups"
            aria-haspopup="menu"
            aria-expanded={isSortMenuOpen}
            onClick={() => setIsSortMenuOpen(open => !open)}
            className="w-10 h-10 inline-flex items-center justify-center rounded-sm text-slate-600 hover:bg-gray-100 hover:text-slate-900 transition-colors"
          >
            <FiSliders size={20} />
          </button>
          {isSortMenuOpen && (
            <>
              <button type="button" tabIndex={-1} aria-hidden="true" className="fixed inset-0 z-30 cursor-default" onClick={() => setIsSortMenuOpen(false)} />
              <div role="menu" className="absolute right-0 top-11 z-40 w-52 py-1 bg-white border border-gray-200 rounded-sm shadow-lg">
                <p className="px-3 pt-1.5 pb-1 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em]">Sort by</p>
                {SORT_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    role="menuitemradio"
                    aria-checked={sortBy === opt.key}
                    onClick={() => { setSortBy(opt.key); setIsSortMenuOpen(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors ${sortBy === opt.key ? `font-semibold ${theme.primaryText}` : 'text-slate-700'}`}
                  >
                    {opt.label}
                    {sortBy === opt.key && <FiCheck size={16} />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Desktop: tabs + New group */}
        <div className="hidden lg:flex items-center gap-3">
          {renderTabs(false)}
          {addOnsEnabled && (
            <button
              type="button"
              onClick={() => setIsAddOnManagerOpen(true)}
              className="h-10 inline-flex items-center gap-1.5 whitespace-nowrap px-4 rounded-sm border border-[#7a8aa3] bg-white text-sm font-medium text-slate-900 transition-colors hover:bg-gray-50"
            >
              <FiPlus size={16} />
              Add-ons
            </button>
          )}
          <button
            type="button"
            onClick={openNewGroupModal}
            className={`h-10 inline-flex items-center gap-1.5 px-4 rounded-sm text-sm font-medium text-white transition-colors ${actionBg} ${actionHoverBg}`}
          >
            <FiPlus size={16} />
            New group
          </button>
        </div>
      </div>

      {/* Phone: full-width tabs under the title bar */}
      <div className="lg:hidden px-4 pt-2.5">{renderTabs(true)}</div>
    </div>
  );

  return (
    <div className={`flex flex-col h-full w-full overflow-hidden ${theme.canvasBg ?? 'bg-gray-100'}`}>
      {renderHeader()}

      <main className="flex-grow px-4 py-3 lg:p-6 w-full overflow-y-auto">
        {error && <div className="mb-4 px-3 py-2.5 bg-red-50 text-red-700 border border-red-100 rounded-sm text-sm font-medium"><p>{error}</p></div>}
        {successMessage && <div className="mb-4 px-3 py-2.5 bg-green-50 text-green-700 border border-green-100 rounded-sm text-sm font-medium"><p>{successMessage}</p></div>}

        {/* Stats row */}
        {!loading && (
          <div className="hidden lg:grid lg:grid-cols-4 gap-3 mb-4">
            <div className="bg-white border border-gray-200 rounded-sm shadow-sm px-4 py-3">
              <p className="text-xs text-slate-500">Groups</p>
              <p className="text-xl font-semibold text-slate-900 tabular-nums">{itemGroups.length}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-sm shadow-sm px-4 py-3">
              <p className="text-xs text-slate-500">Items grouped</p>
              <p className="text-xl font-semibold text-slate-900 tabular-nums">
                {Math.max(allItems.length - uncategorizedCount, 0)}
                <span className="ml-1 text-xs font-normal text-slate-500">of {allItems.length}</span>
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-sm shadow-sm px-4 py-3">
              <p className="text-xs text-slate-500">Not in any group</p>
              <p className={`text-xl font-semibold tabular-nums ${uncategorizedCount > 0 ? 'text-amber-700' : 'text-slate-900'}`}>{uncategorizedCount}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-sm shadow-sm px-4 py-3">
              <p className="text-xs text-slate-500">Empty groups</p>
              <p className={`text-xl font-semibold tabular-nums ${emptyGroupsCount > 0 ? 'text-amber-700' : 'text-slate-900'}`}>{emptyGroupsCount}</p>
            </div>
          </div>
        )}

        <div className="lg:p-5 lg:bg-white lg:border lg:border-gray-200 lg:rounded-sm lg:shadow-sm">
          <div className="flex flex-col gap-3 mb-3 lg:mb-6">
            <div className="flex flex-col lg:flex-row gap-2">
              <div className="flex flex-1 min-w-0 gap-2">
                <label className="relative flex-1 min-w-0 block">
                  <FiSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    aria-label="Search groups or items"
                    value={newItemGroupName}
                    onChange={(e) => setNewItemGroupName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddItemGroup()}
                    className={`w-full h-11 pl-9 pr-3 border border-[#7a8aa3] rounded-sm bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 ${theme.focusRing}`}
                  />
                  {newItemGroupName === '' && (
                    <span className="pointer-events-none absolute left-9 right-3 top-1/2 -translate-y-1/2 truncate text-sm text-slate-500">
                      <span className="lg:hidden">Search groups or items</span>
                      <span className="hidden lg:inline">Search groups or items — or type a new group name</span>
                    </span>
                  )}
                </label>
              </div>
              <div className="hidden lg:flex gap-2">
                <label className="relative flex-1 lg:flex-none inline-flex items-center">
                  <span className="sr-only">Sort groups</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortKey)}
                    className={`h-11 w-full appearance-none pl-3 pr-9 border border-gray-300 rounded-sm bg-white text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 ${theme.focusRing}`}
                  >
                    <option value="items">Sort: Most items</option>
                    <option value="name">Sort: A–Z</option>
                    <option value="recent">Sort: Recently changed</option>
                  </select>
                  <FiChevronDown size={16} className="pointer-events-none absolute right-3 text-slate-500" />
                </label>
                <div role="group" aria-label="Layout" className="inline-flex items-center p-[3px] gap-0.5 h-11 bg-gray-50 border border-gray-200 rounded-[11px]">
                  <button type="button" aria-label="Grid view" aria-pressed={viewMode === 'grid'} onClick={() => setViewMode('grid')}
                    className={`w-9 h-9 inline-flex items-center justify-center rounded-sm transition-colors ${viewMode === 'grid' ? `bg-white shadow-sm ${theme.primaryText}` : 'text-slate-600 hover:text-slate-900'}`}>
                    <FiGrid size={16} />
                  </button>
                  <button type="button" aria-label="List view" aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')}
                    className={`w-9 h-9 inline-flex items-center justify-center rounded-sm transition-colors ${viewMode === 'list' ? `bg-white shadow-sm ${theme.primaryText}` : 'text-slate-600 hover:text-slate-900'}`}>
                    <FiList size={16} />
                  </button>
                </div>
              </div>
            </div>
            {/* Phone only: Add-ons + New group row under the search bar */}
            <div className="flex gap-2 lg:hidden">
              {addOnsEnabled && (
                <button
                  type="button"
                  onClick={() => setIsAddOnManagerOpen(true)}
                  className="h-11 flex-1 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-sm border border-[#7a8aa3] bg-white text-sm font-medium text-slate-900 transition-colors hover:bg-gray-50"
                >
                  <FiPlus size={16} />
                  Add-ons
                </button>
              )}
              <button
                type="button"
                onClick={openNewGroupModal}
                className={`h-11 flex-1 inline-flex items-center justify-center gap-1.5 rounded-sm text-sm font-medium text-white transition-colors ${actionBg} ${actionHoverBg}`}
              >
                <FiPlus size={16} />
                New group
              </button>
            </div>
            {canCreateGroup && (
              <div className={`flex items-center gap-2 px-3 py-2.5 border-[1.5px] border-dashed rounded-sm ${actionBorder} ${theme.primarySoftBg ?? 'bg-blue-50'}`}>
                <FiPlus size={16} className={`flex-shrink-0 ${theme.primaryText}`} />
                <span className="flex-1 min-w-0 text-[13px] text-slate-700 truncate">
                  No group called <b className="font-semibold text-slate-900">"{trimmedQuery}"</b>
                </span>
                <button
                  type="button"
                  onClick={handleAddItemGroup}
                  disabled={loading}
                  className={`h-8 px-3 rounded-sm text-[13px] font-medium text-white transition-colors ${actionBg} ${actionHoverBg} ${theme.primaryDisabledBg} disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  Create
                </button>
              </div>
            )}

            {duplicateClusters.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-sm bg-amber-50 text-amber-700 text-[13px] leading-[19px]">
                <FiCopy size={16} className="flex-shrink-0" />
                <span className="flex-1 min-w-0">
                  <b className="font-semibold">{duplicateClusters.length} possible duplicate {duplicateClusters.length === 1 ? 'set' : 'sets'}</b>
                  <span className="hidden lg:inline">
                    {' — '}
                    {duplicateClusters.slice(0, 3).map(c => c.map(g => `"${g.name}"`).join(' & ')).join(', ')}
                    {duplicateClusters.length > 3 ? ` +${duplicateClusters.length - 3} more` : ''}
                  </span>
                  <button type="button" onClick={() => setIsMergeOpen(true)} className="lg:hidden underline font-medium ml-1">· Review & merge</button>
                </span>
                <button
                  type="button"
                  onClick={() => setIsMergeOpen(true)}
                  className="hidden lg:inline-flex items-center h-8 px-3 flex-shrink-0 rounded-sm bg-white border border-gray-300 text-[13px] font-medium text-slate-800 hover:bg-gray-50 transition-colors"
                >
                  Review & merge
                </button>
              </div>
            )}
          </div>

          {matchingItems.length > 0 && (
            <div className="mb-4 lg:mb-6">
              <h2 className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-3">
                Items Matching "{newItemGroupName.trim()}" · {matchingItems.length}
              </h2>
              <div className="bg-white border border-gray-200 rounded-sm shadow-sm overflow-hidden divide-y divide-gray-200">
                {matchingItems.map(item => {
                  const rawGroupId = Array.isArray(item.itemGroupId) ? item.itemGroupId[0] : item.itemGroupId;
                  const groupName = rawGroupId ? (groupIdToName.get(rawGroupId) || 'Uncategorized') : 'Uncategorized';
                  const stock = item.stock || 0;
                  return (
                    <button
                      key={item.id}
                      onClick={() => openEditDrawer(item)}
                      className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 bg-white text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[13px] lg:text-sm font-semibold text-slate-900 truncate">{item.name}</span>
                          <span className={`hidden lg:inline-flex text-xs font-semibold px-2 py-0.5 rounded-sm whitespace-nowrap ${getStockBadgeClasses(stock)}`}>
                            {stock === 0 ? 'Out of stock' : `${stock} in stock`}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 truncate">{groupName}</div>
                      </div>
                      <span className="text-[13px] font-semibold text-slate-900 tabular-nums flex-shrink-0">
                        ₹{item.mrp || item.salesPrice || 0}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <h2 className="hidden lg:block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-3">Official Item Groups</h2>

          {loading ? (
            <div className="flex justify-center items-center py-10">
              <Spinner />
              <p className="text-sm text-slate-500 ml-2">Syncing and Loading Groups...</p>
            </div>
          ) : itemGroups.length === 0 && (groupCounts["uncategorized"] || 0) === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
              <FiGrid size={28} className="text-slate-400" />
              <p className="text-sm font-medium text-slate-600">No item groups found.</p>
              <p className="text-xs text-slate-500">Type a name above and tap Create (or New group) to add one.</p>
            </div>
          ) : (
            <div className={`grid gap-2 lg:gap-3 ${viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1'}`}>
              {displayedItemGroups.map((group, index) => {
                const count = group.id ? (groupCounts[group.id] || 0) : 0;
                const stockValue = group.id ? (groupStockValue[group.id] || 0) : 0;
                const lowStock = group.id ? (groupLowStock[group.id] || 0) : 0;
                const chip = getChip(index);
                return (
                  <div key={group.id} className="flex items-center justify-between gap-3 px-3.5 py-3 bg-white rounded-sm shadow-sm border border-gray-200 hover:border-gray-300 transition-colors">
                    {editingGroupId === group.id ? (
                      <div className="flex items-stretch gap-3 w-full">
                        {/* Image block (80x80): tap = pick image, + corner = add/change, ✕ corner = remove */}
                        <div className="relative w-20 h-20 flex-shrink-0 overflow-hidden rounded-sm border border-gray-300 bg-gray-50">
                          <label
                            className="w-full h-full flex items-center justify-center text-slate-400 cursor-pointer hover:bg-gray-100 transition-colors"
                            aria-label={editingGroupImage ? 'Change category image' : 'Add category image'}
                          >
                            {editingGroupImage
                              ? <img src={editingGroupImage} alt="" className="w-full h-full object-cover" />
                              : <FiImage size={26} strokeWidth={1.5} />}
                            <input type="file" accept="image/*" onChange={handleCategoryImagePick} className="sr-only" />
                          </label>

                          {/* + tab, bottom-right corner */}
                          <span aria-hidden="true" className={`absolute bottom-0 right-0 w-6 h-6 inline-flex items-center justify-center rounded-full text-white pointer-events-none ${actionBg}`}>
                            <FiPlus size={14} strokeWidth={2.5} />
                          </span>

                          {/* ✕ remove, top-right (only when an image exists) */}
                          {editingGroupImage && (
                            <button
                              type="button"
                              onClick={() => setEditingGroupImage('')}
                              aria-label="Remove category image"
                              className="absolute top-1 left-1 w-5 h-5 inline-flex items-center justify-center rounded-full bg-black/55 hover:bg-red-600 text-white transition-colors"
                            >
                              <FiX size={12} strokeWidth={2.5} />
                            </button>
                          )}
                        </div>

                        {/* Name + actions */}
                        <div className="flex flex-col flex-1 min-w-0 gap-2">
                          <input type="text" value={editingGroupName} onChange={(e) => setEditingGroupName(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSaveEdit(group)} autoFocus className={`w-full h-10 px-3 text-sm border rounded-sm focus:outline-none focus:ring-2 ${theme.primaryBorder} ${theme.focusRing}`} />
                          <div className="flex justify-end gap-2">
                            <button onClick={() => handleSaveEdit(group)} className="bg-green-600 hover:bg-green-700 text-white h-8 px-3 rounded-sm text-sm font-medium transition-colors">Save</button>
                            <button onClick={handleCancelEdit} className="bg-white hover:bg-gray-50 text-slate-700 border border-gray-300 h-8 px-3 rounded-sm text-sm font-medium transition-colors">Cancel</button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3 overflow-hidden min-w-0">
                          <span className={`w-10 h-10 flex-shrink-0 inline-flex items-center justify-center overflow-hidden rounded-sm ${group.imageUrl ? 'bg-gray-50 border border-gray-200' : chip.classes}`}>
                            {group.imageUrl
                              ? <img src={group.imageUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
                              : <chip.Icon size={20} />}
                          </span>
                          <div className="min-w-0 flex flex-col items-start gap-0.5">
                            <button
                              onClick={() => { setViewingGroup(group); setItemSearchQuery(''); }}
                              title={group.name}
                              className={`max-w-full font-semibold text-sm truncate hover:underline text-left text-slate-900 ${theme.primaryHoverText}`}
                            >
                              {group.name}
                            </button>
                            <p className="max-w-full truncate whitespace-nowrap text-xs text-slate-500">
                              <span className="font-semibold text-slate-900 tabular-nums">{count}</span> {count === 1 ? 'item' : 'items'}
                              {count > 0 && <> · stock {formatCompactINR(stockValue)}</>}
                            </p>
                            {count === 0 ? (
                              <span className="inline-flex items-center gap-1 h-5 px-2 rounded-sm text-[11px] font-semibold tracking-wide whitespace-nowrap flex-shrink-0 bg-amber-50 text-amber-700">
                                <span className="w-1.5 h-1.5 rounded-sm bg-current" />EMPTY
                              </span>
                            ) : lowStock > 0 && (
                              <span className="inline-flex items-center gap-1 h-5 px-2 rounded-sm text-[11px] font-semibold tracking-wide whitespace-nowrap flex-shrink-0 bg-amber-50 text-amber-700">
                                <span className="w-1.5 h-1.5 rounded-sm bg-current" />{lowStock} low stock
                              </span>
                            )}
                          </div>
                        </div>
                        {group.name.toLowerCase().trim() !== "uncategorized" && (
                          <div className="flex gap-0.5 flex-shrink-0">
                            <button onClick={() => handleEditClick(group)} className={`w-8 h-8 inline-flex items-center justify-center rounded-sm text-slate-500 hover:bg-gray-100 transition-colors ${theme.primaryHoverText}`} aria-label={`Edit ${group.name}`}><IconEdit width={18} height={18} /></button>
                            <div className="relative">
                              <button
                                onClick={() => setOpenMenuGroupId(openMenuGroupId === group.id ? null : (group.id ?? null))}
                                className="w-8 h-8 inline-flex items-center justify-center rounded-sm text-slate-500 hover:text-slate-900 hover:bg-gray-100 transition-colors"
                                aria-label={`More actions for ${group.name}`}
                                aria-haspopup="menu"
                                aria-expanded={openMenuGroupId === group.id}
                              >
                                <FiMoreHorizontal size={18} />
                              </button>
                              {openMenuGroupId === group.id && (
                                <>
                                  <button type="button" tabIndex={-1} aria-hidden="true" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpenMenuGroupId(null)} />
                                  <div role="menu" className="absolute right-0 top-9 z-20 w-44 py-1 bg-white border border-gray-200 rounded-sm shadow-lg">
                                    <button
                                      role="menuitem"
                                      onClick={() => { setOpenMenuGroupId(null); setDeleteTargetGroup(group); }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                    >
                                      <FiTrash2 size={16} />
                                      Delete group
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
              <div className="flex items-center justify-between gap-3 px-3.5 py-3 bg-gray-50 rounded-xl shadow-sm border border-gray-300 border-dashed">
                <div className="flex items-center gap-3 overflow-hidden min-w-0">
                  <span className="w-10 h-10 flex-shrink-0 inline-flex items-center justify-center rounded-sm bg-slate-100 text-slate-600">
                    <FiGrid size={20} />
                  </span>
                  <div className="min-w-0 flex flex-col items-start gap-0.5">
                    <button
                      onClick={() => { setViewingGroup({ id: 'uncategorized', name: 'Uncategorized', description: '', createdAt: 0, updatedAt: 0 }); setItemSearchQuery(''); }}
                      className={`text-slate-700 font-semibold text-sm hover:underline text-left ${theme.primaryHoverText}`}
                    >
                      Uncategorized
                    </button>
                    <p className="text-xs text-slate-500">
                      <span className="font-semibold text-slate-900 tabular-nums">{groupCounts["uncategorized"] || 0}</span> items
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modals & Drawers */}
      {isNewGroupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeNewGroupModal}>
          <div className="bg-white rounded-sm shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-slate-900 mb-1.5">New item group</h2>
            <p className="text-sm text-slate-600 mb-4">Enter a name for the new group.</p>

            {newGroupModalError && (
              <p className="mb-3 rounded-sm bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{newGroupModalError}</p>
            )}

            <label className="grid gap-1 mb-6">
              <span className="text-xs font-medium text-slate-600">Group name</span>
              <input
                type="text"
                autoFocus
                value={newGroupModalName}
                onChange={(e) => setNewGroupModalName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && canCreateFromModal && handleCreateGroupFromModal()}
                placeholder="e.g. Beverages"
                className={`w-full h-11 px-3 border border-[#7a8aa3] rounded-sm bg-white text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 ${theme.focusRing}`}
              />
              {modalNameExists && (
                <span className="text-xs font-medium text-amber-700">
                  A group called "{modalTrimmedName}" already exists.
                </span>
              )}
            </label>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeNewGroupModal}
                disabled={isCreatingGroup}
                className="h-10 px-4 text-sm font-medium rounded-sm bg-white text-slate-700 border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateGroupFromModal}
                disabled={isCreatingGroup || !canCreateFromModal}
                className={`h-10 px-4 text-sm font-medium rounded-sm text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${actionBg} ${actionHoverBg}`}
              >
                {isCreatingGroup ? 'Creating…' : 'Create group'}
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteTargetGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-sm shadow-xl w-full max-w-md p-5">
            <h2 className="text-lg font-semibold text-slate-900 mb-1.5">Delete "{deleteTargetGroup.name}"?</h2>
            <p className="text-sm text-slate-600 mb-6">
              {deleteTargetGroup.id && groupCounts[deleteTargetGroup.id] > 0
                ? `All ${groupCounts[deleteTargetGroup.id]} item(s) will be moved to "Uncategorized".`
                : "This group has no items."}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTargetGroup(null)} className="h-10 px-4 text-sm font-medium rounded-sm bg-white text-slate-700 border border-gray-300 hover:bg-gray-50 transition-colors">Cancel</button>
              <button
                onClick={async () => {
                  await handleDeleteItemGroup(deleteTargetGroup);
                  setDeleteTargetGroup(null);
                }}
                className={`h-10 px-4 text-sm font-medium rounded-sm text-white transition-colors ${theme.deleteButtonBg} ${theme.deleteButtonHoverBg}`}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingGroup && (
        <ItemGroupViewModal
          group={viewingGroup}
          items={viewingGroupItems}
          isUncategorized={viewingGroup.id === 'uncategorized'}
          onClose={() => setViewingGroup(null)}
          onEditItem={openEditDrawer}
          onDeleteItem={setItemPendingDelete}
          onDeleteGroupAndItems={() => setGroupPendingFullDelete(viewingGroup)}
          onRename={handleRenameFromModal}
          theme={theme}
        />
      )}

      {isMergeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-sm shadow-xl w-full max-w-lg p-5 flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-start gap-2 mb-1">
              <h2 className="text-lg font-semibold text-slate-900">Review & merge duplicates</h2>
              <button onClick={() => setIsMergeOpen(false)} aria-label="Close" className="w-8 h-8 inline-flex items-center justify-center rounded-sm text-slate-400 hover:text-slate-700 hover:bg-gray-100 text-lg leading-none flex-shrink-0 transition-colors">✕</button>
            </div>
            <p className="text-sm text-slate-600 mb-4">Pick the group to keep. Items from the others move into it and the empty groups are removed.</p>
            <div className="overflow-y-auto flex-1 space-y-3">
              {duplicateClusters.length === 0 ? (
                <p className="text-center text-sm text-slate-500 py-10">No duplicates left.</p>
              ) : duplicateClusters.map(cluster => {
                const key = cluster.map(g => g.id).join('|');
                const defaultKeep = [...cluster].sort((a, b) => (groupCounts[b.id!] || 0) - (groupCounts[a.id!] || 0))[0].id!;
                const keepId = mergeKeepIds[key] ?? defaultKeep;
                const keep = cluster.find(g => g.id === keepId) || cluster[0];
                return (
                  <div key={key} className="border border-gray-200 rounded-sm overflow-hidden">
                    <div className="divide-y divide-gray-200">
                      {cluster.map(g => (
                        <label key={g.id} className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-gray-50">
                          <input
                            type="radio"
                            name={`keep-${key}`}
                            checked={keepId === g.id}
                            onChange={() => setMergeKeepIds(prev => ({ ...prev, [key]: g.id! }))}
                          />
                          <span className="flex-1 min-w-0 text-sm font-medium text-slate-900 truncate" title={g.name}>{g.name}</span>
                          <span className="text-xs text-slate-500 tabular-nums flex-shrink-0">{groupCounts[g.id!] || 0} items</span>
                        </label>
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-gray-50 border-t border-gray-200">
                      <span className="text-xs text-slate-500 truncate">Keep "{keep.name}"</span>
                      <button
                        onClick={() => setPendingMerge({ keep, duplicates: cluster.filter(g => g.id !== keep.id) })}
                        className={`h-8 px-3 rounded-sm text-[13px] font-medium text-white transition-colors flex-shrink-0 ${actionBg} ${actionHoverBg}`}
                      >
                        Merge
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {pendingMerge && (
        <Modal
          type={State.WARNING}
          message={`Merge ${pendingMerge.duplicates.map(g => `"${g.name}"`).join(', ')} into "${pendingMerge.keep.name}"? Items will move to "${pendingMerge.keep.name}" and the other group(s) will be deleted.`}
          onClose={() => setPendingMerge(null)}
          onConfirm={() => handleMergeGroups(pendingMerge.keep, pendingMerge.duplicates)}
          showConfirmButton={true}
        />
      )}

      <AddOnManager
        isOpen={isAddOnManagerOpen}
        onClose={() => setIsAddOnManagerOpen(false)}
        companyId={addOnsEnabled ? currentUser?.companyId : undefined}
        items={allItems}
        actionClass={`${actionBg} ${actionHoverBg}`}
      />

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