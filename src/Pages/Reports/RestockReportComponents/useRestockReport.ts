import { useMemo } from 'react';
import { useCatalogueData } from '../../../context/CatalogueDataContext';
import { type ItemDoc } from './restockReport.utils';

const useRestockReport = () => {
  const { items: catalogueItems, itemsLoading } = useCatalogueData();

  // items now come from the shared CatalogueDataContext instead of this hook
  // fetching them itself.
  const items = useMemo(() => (catalogueItems as ItemDoc[])
    .filter(item => (item.stock ?? 0) <= item.restockQuantity)
    .sort((a, b) => {
      const aDeficit = (a.stock || 0) - a.restockQuantity;
      const bDeficit = (b.stock || 0) - b.restockQuantity;
      return aDeficit - bDeficit;
    }), [catalogueItems]);

  return { items, loading: itemsLoading, error: null };
};

export default useRestockReport;