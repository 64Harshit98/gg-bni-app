// RestockReportComponents/restockReport.utils.ts

export interface ItemDoc {
  id: string;
  name: string;
  amount: number;
  stock: number;
  restockQuantity: number;
  companyId: string;
  supplier?: string;
  unitCost?: number;
}

export const filterBySearch = (items: ItemDoc[], searchTerm: string) => {
  return items.filter((item) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );
};

export const calculateSummary = (items: ItemDoc[]) => {
  const totalItemsToRestock = items.length;

  const outOfStockCount = items.filter((i) => (i.stock || 0) <= 0).length;

  const estimatedCostToRestock = items.reduce((acc, item) => {
    const currentStock = item.stock || 0;
    const quantityNeeded = item.restockQuantity - currentStock;
    const cost = item.unitCost || 0;
    return acc + quantityNeeded * cost;
  }, 0);

  return {
    totalItemsToRestock,
    outOfStockCount,
    estimatedCostToRestock,
  };
};
