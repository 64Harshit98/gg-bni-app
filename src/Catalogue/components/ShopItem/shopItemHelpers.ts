import type { Item, ItemGroup } from '../../../constants/models';
import type { ShopSortOrder } from './SortDropdown';

/** URL-safe slug for a category name, e.g. "Home & Kitchen" -> "home-kitchen". */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/** Resolves a route `groupId` (which may be a slug) to the actual item-group id. */
export function resolveGroupId(groupId: string | undefined, allItemGroups: ItemGroup[]): string | undefined {
  if (!groupId || allItemGroups.length === 0) return groupId;
  const matchedGroup = allItemGroups.find((group) => generateSlug(group.name) === groupId);
  return matchedGroup?.id || groupId;
}

/** Human-readable heading for the currently selected category. */
export function getCurrentCategoryName(resolvedGroupId: string | undefined, allItemGroups: ItemGroup[]): string {
  if (resolvedGroupId === 'uncategorized') return 'Uncategorized';
  if (resolvedGroupId === 'All' || !resolvedGroupId) return 'All Products';
  const group = allItemGroups.find((g) => g.id === resolvedGroupId);
  return group ? group.name : 'Catalogue';
}

/** Builds a `{ groupId: groupName }` lookup map from the item groups list. */
export function buildItemGroupMap(allItemGroups: ItemGroup[]): Record<string, string> {
  return allItemGroups.reduce((acc, group) => {
    if (group.id) acc[group.id] = group.name;
    return acc;
  }, {} as Record<string, string>);
}

export interface FilterAndSortShopItemsParams {
  allItems: Item[];
  allItemGroups: ItemGroup[];
  activeCategory: string;
  searchQuery: string;
  isViewMode: boolean;
  sortOrder: ShopSortOrder;
  pinnedIds: Set<string>;
}

/** Filters items by active category/search and sorts them (pinned-first, then by sort order). */
export function filterAndSortShopItems({
  allItems,
  allItemGroups,
  activeCategory,
  searchQuery,
  isViewMode,
  sortOrder,
  pinnedIds,
}: FilterAndSortShopItemsParams): Item[] {
  const validGroupIds = new Set(allItemGroups.map((g) => g.id));

  const result = allItems.filter((item) => {
    if (!item) return false;

    const isSearching = searchQuery.trim().length > 0;

    if (isViewMode && !item.isListed && !isSearching) {
      return false;
    }

    let matchesCategory = false;

    if (isSearching) {
      matchesCategory = true;
    } else if (activeCategory === 'All') {
      matchesCategory = true;
    } else if (activeCategory === 'uncategorized') {
      const allIds = [...(item.itemGroupId ? [item.itemGroupId] : []), ...(item.itemGroupIds || [])];
      matchesCategory = allIds.length === 0 || allIds.every((id) => !validGroupIds.has(id));
    } else {
      const allIds = [...(item.itemGroupId ? [item.itemGroupId] : []), ...(item.itemGroupIds || [])];
      matchesCategory = allIds.includes(activeCategory);
    }

    const itemName = item.name?.toLowerCase() || '';
    const matchesSearch =
      !isSearching || itemName.includes(searchQuery.toLowerCase()) || (item.barcode && item.barcode.includes(searchQuery));

    return matchesCategory && matchesSearch;
  });

  return [...result].sort((a, b) => {
    const aPinned = pinnedIds.has(a.id!);
    const bPinned = pinnedIds.has(b.id!);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    const nameA = a.name || '';
    const nameB = b.name || '';
    if (sortOrder === 'A-Z') return nameA.localeCompare(nameB);
    if (sortOrder === 'Z-A') return nameB.localeCompare(nameA);
    if (sortOrder === 'Price: Low-High') return (a.salesPrice || a.mrp || 0) - (b.salesPrice || b.mrp || 0);
    if (sortOrder === 'Price: High-Low') return (b.salesPrice || b.mrp || 0) - (a.salesPrice || a.mrp || 0);
    return 0;
  });
}

/**
 * Resolves the "variant group" (root item + all its variant ids) that `item` belongs to,
 * by walking the variant graph to find the item with the most variants transitively
 * connected to it.
 */
export function resolveVariantGroup(item: Item, allItems: Item[]): string[] {
  const itemId = String(item.id!);

  const findTrueRoot = (startId: string): Item | null => {
    const visited = new Set<string>();
    const queue = [startId];
    let bestRoot: Item | null = null;
    let bestCount = -1;

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const currentItem = allItems.find((i) => String(i.id) === currentId);
      if (!currentItem) continue;

      const currentVariants: string[] = (currentItem.variants || []).map(String);

      if (currentVariants.length > bestCount) {
        bestCount = currentVariants.length;
        bestRoot = currentItem;
      }

      currentVariants.forEach((vid) => {
        if (!visited.has(vid)) queue.push(vid);
      });

      allItems.forEach((i) => {
        const iVariants: string[] = (i.variants || []).map(String);
        if (iVariants.includes(currentId) && !visited.has(String(i.id))) {
          queue.push(String(i.id));
        }
      });
    }

    return bestRoot;
  };

  const trueRoot = findTrueRoot(itemId);

  if (trueRoot) {
    const rootId = String(trueRoot.id!);
    const rootVariants: string[] = (trueRoot.variants || []).map(String);
    return [rootId, ...rootVariants];
  }

  return [itemId];
}
