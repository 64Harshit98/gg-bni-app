import { useMemo } from 'react';
import { useCatalogueData } from '../../../context/CatalogueDataContext';
import { buildRestockRows } from './restockReport.utils';

// Items come from the shared CatalogueDataContext (already loaded app-wide),
// so this report costs no extra reads.
const useRestockReport = () => {
  const { items, itemsLoading, itemGroups, itemGroupsLoading } = useCatalogueData();

  const rows = useMemo(() => buildRestockRows(items, itemGroups), [items, itemGroups]);

  return { rows, itemGroups, loading: itemsLoading || itemGroupsLoading };
};

export default useRestockReport;
