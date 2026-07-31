import { ArrowUpDown, PackageSearch } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../Components/ui/table';
import { Badge } from '../../../Components/ui/badge';
import { Pagination } from '../../../Components/ui/pagination';
import { EmptyState } from '../../../Components/ui/empty-state';
import { Spinner } from '../../../Components/ui/spinner';
import { usePagination } from '../../../hooks/usePagination';
import { formatNumber } from '../../../utils/formatters';
import type { ItemDoc } from './restockReport.utils';

interface RestockTableProps {
  items: ItemDoc[];
  loading: boolean;
  sortOrder: 'asc' | 'desc';
  onToggleSortOrder: () => void;
}

const PAGE_SIZE = 10;

function StatusBadge({ stock }: { stock: number }) {
  if (stock <= 0) return <Badge variant="destructive">Out of stock</Badge>;
  if (stock <= 5) return <Badge variant="warning">Low stock</Badge>;
  return <Badge variant="success">In stock</Badge>;
}

export default function RestockTable({ items, loading, sortOrder, onToggleSortOrder }: RestockTableProps) {
  const { currentPage, totalPages, pageItems, goToPage } = usePagination<ItemDoc>({
    totalItems: items.length,
    pageSize: PAGE_SIZE,
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
        <Spinner size="lg" />
        <p>Loading inventory...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<PackageSearch />}
        title="No items currently need restocking"
        description="Every product is above its restock threshold. Good job!"
      />
    );
  }

  const pageItemsList = pageItems(items);

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product Name</TableHead>
            <TableHead className="text-center">
              <button
                type="button"
                onClick={onToggleSortOrder}
                className="mx-auto inline-flex items-center gap-1 transition-colors hover:text-foreground"
              >
                Current Stock
                <ArrowUpDown className={sortOrder === 'asc' ? 'size-3.5 rotate-180' : 'size-3.5'} />
              </button>
            </TableHead>
            <TableHead className="text-center">Min. Stock Needed</TableHead>
            <TableHead className="text-center">Units Short</TableHead>
            <TableHead className="text-center">Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageItemsList.map((item) => {
            const currentStock = item.stock ?? 0;
            const deficit = Math.max((item.restockQuantity ?? 0) - currentStock, 0);

            return (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="font-medium text-foreground">{item.name}</div>
                  <div className="text-xs text-muted-foreground">ID: {item.id.slice(0, 8)}</div>
                </TableCell>
                <TableCell className="text-center font-medium">
                  <span className={currentStock <= 0 ? 'text-destructive' : 'text-foreground'}>
                    {formatNumber(currentStock)}
                  </span>
                </TableCell>
                <TableCell className="text-center text-muted-foreground">
                  {formatNumber(item.restockQuantity ?? 0)}
                </TableCell>
                <TableCell className="text-center font-medium text-destructive">
                  {deficit > 0 ? `-${formatNumber(deficit)}` : '-'}
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex justify-center">
                    <StatusBadge stock={currentStock} />
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <span
                    className="cursor-not-allowed text-sm font-medium text-muted-foreground select-none"
                    title="Coming soon"
                  >
                    Order
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {totalPages > 1 ? (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={goToPage}
          totalItems={items.length}
          pageSize={PAGE_SIZE}
        />
      ) : null}
    </div>
  );
}
