// RestockReportComponents/restockReport.utils.ts

export interface ItemDoc {
  id: string;
  name: string;
  amount: number;
  stock: number;
  restockQuantity: number;
  companyId: string;
  supplier?: string;
  purchasePrice?: number;
  salesPrice?: number;
  mrp?: number;
}

export const filterBySearch = (items: ItemDoc[], searchTerm: string) => {
  return items.filter((item) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );
};

export const calculateSummary = (items: ItemDoc[]) => {
  // Only count items where stock is actually below their own restock threshold
  const itemsNeedingRestock = items.filter(
    (i) => (i.stock ?? 0) < (i.restockQuantity ?? 0)
  );

  const totalItemsToRestock = itemsNeedingRestock.length;

  const outOfStockCount = items.filter(
  (i) => (i.stock ?? 0) <= 0 && i.restockQuantity != null && i.restockQuantity > 0
).length;

  const estimatedCostToRestock = itemsNeedingRestock.reduce((acc, item) => {
    const currentStock = item.stock ?? 0;
    const restockQuantity = item.restockQuantity ?? 0;
    const deficit = Math.max(restockQuantity - currentStock, 0);
    const unitCost = item.purchasePrice ?? item.salesPrice ?? 0;
    return acc + (deficit * unitCost);
  }, 0);
  return { totalItemsToRestock, outOfStockCount, estimatedCostToRestock };
};
