import { useMemo } from 'react';
import { useCatalogueData } from '../../../context/CatalogueDataContext';
import { useRestaurantData } from '../../../context/RestaurantDataContext';
import type { Item, ItemGroup } from '../../../constants/models';
import { buildRestockRows } from './restockReport.utils';

// Items come from the shared CatalogueDataContext (already loaded app-wide),
// so this report costs no extra reads. In restaurant mode, restock rows are
// built from raw materials instead of menu items.
const useRestockReport = () => {
  const { items, itemsLoading, itemGroups, itemGroupsLoading } = useCatalogueData();
  const { isRestaurant, rawMaterials, loading: rmLoading } = useRestaurantData();

  const { effectiveItems, effectiveGroups } = useMemo(() => {
    if (!isRestaurant) return { effectiveItems: items, effectiveGroups: itemGroups };
    const cats = [...new Set(rawMaterials.map((r) => r.category || 'General'))];
    const groups: ItemGroup[] = cats.map((name) => ({ id: name, name, description: '', createdAt: 0, updatedAt: 0 }));
    const mapped: Item[] = rawMaterials.map((r) => ({
      id: r.id,
      name: `${r.name} (${r.baseUnit})`,
      mrp: 0,
      salesPrice: 0,
      purchasePrice: r.avgCost || 0,
      discount: 0,
      tax: 0,
      itemGroupId: r.category || 'General',
      stock: r.stock || 0,
      amount: 0,
      barcode: '',
      restockQuantity: r.restockLevel || 0,
      unit: r.baseUnit,
      createdAt: r.createdAt || 0,
      updatedAt: 0,
    }));
    return { effectiveItems: mapped, effectiveGroups: groups };
  }, [isRestaurant, items, itemGroups, rawMaterials]);

  const rows = useMemo(
    () => buildRestockRows(effectiveItems, effectiveGroups),
    [effectiveItems, effectiveGroups],
  );

  return {
    rows,
    itemGroups: effectiveGroups,
    loading: isRestaurant ? rmLoading : itemsLoading || itemGroupsLoading,
  };
};

export default useRestockReport;
