import React from 'react';

// --- Generic Data Type (T) ---
// T represents the structure of the data records (Invoice, Item, PnL entry, etc.)
interface GenericRecord {
    id: string | number;
    [key: string]: any;
}

// --- Component Props Interface ---
interface SortableListTableProps<T extends GenericRecord> {
    data: T[]; // The list of records to display
    sortConfig: { key: keyof T; direction: 'asc' | 'desc' };
    onSort: (key: keyof T) => void;

    // RENDERER: A function that takes a record (T) and returns the JSX for the table row 
    // This allows the parent page to control the specific content and actions (View, Edit, Delete).
    renderRow: (record: T) => React.ReactNode;

    // HEADERS: An array defining the visible and sortable columns
    headers: { key: keyof T; label: string; className?: string; sortable?: boolean; }[];
}


/**
 * Reusable component to render a generic, sortable table list for any data type (Sales, Purchase, Items, PnL).
 */
export const SortableListTable = <T extends GenericRecord>({
    data,
    sortConfig,
    onSort,
    renderRow,
    headers
}: SortableListTableProps<T>) => {

    // Define Unicode symbols for sorting arrows
    const ASC_ICON = '∧'; // Up Arrow/Wedge for Ascending
    const DESC_ICON = '∨'; // Down Arrow/Vel for Descending

    const SortableHeader: React.FC<{ sortKey: keyof T; children: React.ReactNode; className?: string; }> = ({ sortKey, children, className }) => {
        const isSorted = sortConfig.key === sortKey;
        const directionIcon = sortConfig.direction === 'asc' ? ASC_ICON : DESC_ICON;

        return (
            <th className={`py-2 px-3 text-left ${className || ''}`}>
                <button onClick={() => onSort(sortKey)} className="flex items-center gap-2 uppercase">
                    {children}
                    <span className="w-0 ml-1">
                        {isSorted ? (
                            <span className="text-blue-600 text-xs">{directionIcon}</span>
                        ) : (
                            <span className="text-gray-400 hover:text-gray-600 text-xs inline-flex flex-col leading-3">
                                <span>{ASC_ICON}</span>
                                <span className="-mt-1">{DESC_ICON}</span>
                            </span>
                        )}
                    </span>
                </button>
            </th>
        );
    };

    return (
        <div className="overflow-x-auto bg-white rounded-lg shadow">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        {/* Render Headers Dynamically */}
                        {headers.map(header => (
                            header.sortable ? (
                                <SortableHeader key={String(header.key)} sortKey={header.key} className={header.className}>
                                    {header.label}
                                </SortableHeader>
                            ) : (
                                <th key={String(header.key)} className={`py-2 px-3 text-left ${header.className || ''}`}>
                                    {header.label}
                                </th>
                            )
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                    {data.length === 0 ? (
                        <tr>
                            <td colSpan={headers.length} className="py-4 text-center text-gray-500">
                                No records found.
                            </td>
                        </tr>
                    ) : (
                        // Use the renderRow function passed from the parent for each record
                        data.map(record => (
                            <React.Fragment key={record.id}>
                                {renderRow(record)}
                            </React.Fragment>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
};