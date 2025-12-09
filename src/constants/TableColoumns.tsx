import { type TableColumn } from '../Components/CustomTable';

const formatDate = (date: Date | number): string => {
  if (!date) return 'N/A';
  const d = new Date(date);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
};

const UNASSIGNED_GROUP_NAME = 'Uncategorized';

// --- 1. Item Report Columns ---
export const getItemColumns = (itemGroups: any[]): TableColumn<any>[] => [
  { 
    header: 'Item Name', 
    accessor: 'name', 
    sortKey: 'name',
    className: 'font-medium text-left' 
  },
  { 
    header: 'Item Group', 
    accessor: (item) => {
       const group = itemGroups.find(g => g.id === item.itemGroupId);
       return group?.name || item.itemGroupId || UNASSIGNED_GROUP_NAME;
    },
    className: 'text-slate-600'
  },
  { 
    header: 'MRP', 
    accessor: (item) => `₹${item.mrp?.toFixed(2) || '0.00'}`, 
    sortKey: 'mrp', 
    className: 'text-right' 
  },
  { 
    header: 'Cost Price', 
    accessor: (item) => `₹${item.purchasePrice?.toFixed(2) || '0.00'}`, 
    sortKey: 'purchasePrice', 
    className: 'text-right' 
  }
];

// --- 2. Sales Report Columns ---
export const getSalesColumns = (): TableColumn<any>[] => [
    {
      header: 'Date',
      accessor: (row) => formatDate(row.createdAt),
      sortKey: 'createdAt',
      className: 'text-slate-600'
    },
    {
      header: 'Party Name',
      accessor: 'partyName',
      sortKey: 'partyName',
      className: 'font-medium'
    },
    {
      header: 'Items',
      accessor: (row) => row.items.reduce((sum: number, i: any) => sum + (i.quantity || 0), 0),
      sortKey: 'items',
      className: 'text-slate-600'
    },
    {
      header: 'Amount',
      accessor: (row) => `₹${row.totalAmount.toLocaleString('en-IN')}`,
      sortKey: 'totalAmount',
      className: 'text-slate-600'
    }
];

// --- 3. Purchase Report Columns ---
export const getPurchaseColumns = (): TableColumn<any>[] => [
    {
      header: 'Date',
      accessor: (row) => formatDate(row.createdAt),
      sortKey: 'createdAt',
      className: 'text-slate-600'
    },
    {
      header: 'Name',
      accessor: 'partyName',
      sortKey: 'partyName',
      className: 'font-medium'
    },
    {
      header: 'Items',
      accessor: (row) => row.items.reduce((sum: number, i: any) => sum + (i.quantity || 0), 0),
      sortKey: 'items',
      className: 'text-slate-600'
    },
    {
      header: 'Amount',
      accessor: (row) => `₹${row.totalAmount.toLocaleString('en-IN')}`,
      sortKey: 'totalAmount',
      className: 'text-right text-slate-600'
    }
];

// --- 4. P&L Report Columns ---
export const getPnlColumns = (): TableColumn<any>[] => [
    { 
        header: 'Date', 
        accessor: (row) => formatDate(row.createdAt), 
        sortKey: 'createdAt',
        className: 'text-slate-600'
    },
    { 
        header: 'Invoice', 
        accessor: 'invoiceNumber', 
        sortKey: 'invoiceNumber',
        className: 'font-medium'
    },
    { 
        header: 'Sales', 
        accessor: (row) => `₹${row.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, 
        sortKey: 'totalAmount',
        className: 'text-green-600'
    },
    { 
        header: 'Cost', 
        accessor: (row) => `₹${(row.costOfGoodsSold || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, 
        sortKey: 'costOfGoodsSold',
        className: 'text-red-600'
    },
    { 
        header: 'Profit', 
        sortKey: 'profit',
        accessor: (row) => {
            const profit = row.profit || 0;
            const colorClass = profit >= 0 ? 'text-blue-600' : 'text-red-600';
            return (
                <span className={colorClass}>
                    {`₹${profit.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                </span>
            );
        },
        className: 'font-medium'
    }
];