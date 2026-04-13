import React, { useMemo, useState, useEffect } from 'react';
import FilterSelect from './SalesReportComponents/FilterSelect';
import { useNavigate } from 'react-router-dom';
import {
    formatDate,
    formatDateForInput,
} from './SalesReportComponents/salesReport.utils';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import useSalesReport from './SalesReportComponents/useSalesReport';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { type TableColumn } from '../../Components/CustomTable';
import { State } from '../../enums';
import { CustomTable } from '../../Components/CustomTable';
import { IconClose } from '../../constants/Icons';
import ReportDetails from './SalesReportComponents/ReportDetails';
import DownloadChoiceModal from './ItemReportComponents/DownloadChoiceModal';
import { Modal } from '../../constants/Modal';

// 1. Define the strictly 4-column structure
export interface AggregatedItem {
    id: string;
    name: string;
    itemGroup: string;
    quantitySold: number;
    valueSold: number;
}

const ItemsSoldReport: React.FC = () => {
    const navigate = useNavigate();

    const {
        setDatePreset,
        setCustomStartDate,
        setCustomEndDate,
        customStartDate,
        customEndDate,
        setAppliedFilters,
        appliedFilters,
        sales,
        isLoading,
        error,
        datePreset,
        isListVisible,
        setIsListVisible,
        authLoading,
    } = useSalesReport();

    /* ---------- LOCAL STATES ---------- */
    const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
    const [feedbackModal, setFeedbackModal] = useState({
        isOpen: false,
        type: State.INFO,
        message: '',
    });

    const { currentUser } = useAuth();
    const [itemGroupMap, setItemGroupMap] = useState<Record<string, string>>({});

    useEffect(() => {
        const fetchItemGroups = async () => {
            if (!currentUser?.companyId) return;
            try {
                const groupsRef = collection(db, 'companies', currentUser.companyId, 'itemGroups');
                const groupsSnap = await getDocs(groupsRef);

                const map: Record<string, string> = {};
                groupsSnap.docs.forEach(doc => {
                    const data = doc.data();
                    map[doc.id] = data.name || data.groupName || 'Unknown Group';
                });

                setItemGroupMap(map);
            } catch (err) {
                console.error("Error fetching item groups:", err);
            }
        };

        fetchItemGroups();
    }, [currentUser?.companyId]);

    const [sortConfig, setSortConfig] = useState<{
        key: keyof AggregatedItem;
        direction: 'asc' | 'desc';
    }>({ key: 'valueSold', direction: 'desc' });

    /* ---------- DATE PRESET ---------- */
    const handleDatePresetChange = (preset: string) => {
        setDatePreset(preset);
        const start = new Date();
        const end = new Date();

        switch (preset) {
            case 'today':
                break;
            case 'yesterday':
                start.setDate(start.getDate() - 1);
                end.setDate(end.getDate() - 1);
                break;
            case 'last7':
                start.setDate(start.getDate() - 6);
                break;
            case 'last30':
                start.setDate(start.getDate() - 29);
                break;
            case 'custom':
                return;
        }

        setCustomStartDate(formatDateForInput(start));
        setCustomEndDate(formatDateForInput(end));
    };

    const handleApplyFilters = () => {
        const start = customStartDate ? new Date(customStartDate) : new Date(0);
        start.setHours(0, 0, 0, 0);

        const end = customEndDate ? new Date(customEndDate) : new Date();
        end.setHours(23, 59, 59, 999);

        setAppliedFilters({ start: start.getTime(), end: end.getTime() });
    };

    /* ---------- SORT ---------- */
    const handleSort = (key: keyof AggregatedItem) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    /* ---------- AGGREGATE ITEMS & SUMMARY ---------- */
    const { aggregatedItems, summary } = useMemo(() => {
        if (!appliedFilters) {
            return {
                aggregatedItems: [],
                summary: {
                    totalValueSold: 0,
                    totalQuantitySold: 0,
                    uniqueItemCount: 0,
                },
            };
        }

        const billsInRange = sales.filter(
            (sale) =>
                sale.createdAt >= appliedFilters.start &&
                sale.createdAt <= appliedFilters.end
        );

        const itemMap = new Map<string, AggregatedItem>();
        let overallValue = 0;
        let overallQty = 0;

        billsInRange.forEach((sale) => {
            sale.items.forEach((item: any) => {
                const id = item.productId || item.id || 'unknown';

                if (!itemMap.has(id)) {
                    itemMap.set(id, {
                        id,
                        name: item.name || 'Unknown Item',
                        itemGroup: itemGroupMap[item.itemGroupId] || item.category || 'Uncategorized',
                        quantitySold: 0,
                        valueSold: 0,
                    });
                }

                const existingItem = itemMap.get(id)!;
                const qty = item.quantity || 1;

                const pricePerItem = item.effectiveUnitPrice || item.customPrice || item.salesPrice || item.mrp || 0;
                const lineValue = pricePerItem * qty;

                existingItem.quantitySold += qty;
                existingItem.valueSold += lineValue;

                overallQty += qty;
                overallValue += lineValue;
            });
        });

        const itemsArray = Array.from(itemMap.values());
        itemsArray.sort((a, b) => {
            const key = sortConfig.key;
            const direction = sortConfig.direction === 'asc' ? 1 : -1;

            const valA = a[key];
            const valB = b[key];

            if (typeof valA === 'string' && typeof valB === 'string') {
                return valA.localeCompare(valB) * direction;
            }
            if (typeof valA === 'number' && typeof valB === 'number') {
                return (valA - valB) * direction;
            }
            return 0;
        });

        return {
            aggregatedItems: itemsArray,
            summary: {
                totalValueSold: overallValue,
                totalQuantitySold: overallQty,
                uniqueItemCount: itemsArray.length,
            },
        };
    }, [appliedFilters, sales, sortConfig, itemGroupMap]); // Added itemGroupMap dependency

    /* ---------- DEFINE TABLE COLUMNS ---------- */
    const tableColumns = useMemo<TableColumn<AggregatedItem>[]>(() => [
        {
            header: 'Item Name',
            accessor: 'name',
            sortKey: 'name',
            className: 'font-medium'
        },
        {
            header: 'Category',
            accessor: 'itemGroup',
            sortKey: 'itemGroup',
            className: 'text-slate-600'
        },
        {
            header: 'Qty Sold',
            accessor: 'quantitySold',
            sortKey: 'quantitySold',
            className: 'text-slate-600 font-medium'
        },
        {
            header: 'Value Sold',
            accessor: (row) => `₹${Math.round(row.valueSold).toLocaleString('en-IN')}`,
            sortKey: 'valueSold',
            className: 'text-slate-800 font-medium'
        }
    ], []);

    /* ---------- PDF DOWNLOAD ---------- */
    const downloadAsPdf = () => {
        if (!appliedFilters) return;

        const doc = new jsPDF();

        // ===== CLEAN GENERATION TAG =====
        const now = new Date();
        const generatedAt = now.toLocaleString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 14;

        const tagText = `Generated using SELLAR • ${generatedAt}`;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);

        const textWidth = doc.getTextWidth(tagText);
        const paddingX = 2;

        const boxWidth = textWidth + paddingX * 2;
        const boxHeight = 5;

        const boxX = pageWidth - margin - boxWidth;
        const boxY = 10;

        // light gray background
        doc.setFillColor(245, 245, 245);
        doc.rect(boxX, boxY, boxWidth, boxHeight, "F");

        // text
        doc.setTextColor(80, 80, 80);
        doc.text(tagText, boxX + paddingX, boxY + 3.5);

        // reset styles
        doc.setTextColor(0, 0, 0);

        doc.setFontSize(18);
        doc.text('Items Sold Report', 14, 20);
        doc.setFontSize(11);
        doc.setTextColor(100);

        doc.text(
            `Date Range: ${formatDate(appliedFilters.start)} to ${formatDate(appliedFilters.end)}`,
            14,
            27
        );

        autoTable(doc, {
            startY: 33,
            head: [['Item Name', 'Category', 'Qty Sold', 'Total Value']],
            body: aggregatedItems.map((item) => [
                item.name,
                item.itemGroup,
                item.quantitySold,
                `Rs.${Math.round(item.valueSold).toLocaleString('en-IN')}`,
            ]),
            foot: [
                [
                    'Total',
                    '', // Mapped to Category column
                    `${summary.totalQuantitySold}`, // Mapped to Qty Sold column
                    `Rs.${Math.round(summary.totalValueSold).toLocaleString('en-IN')}`, // Mapped to Total Value column
                ],
            ],
            footStyles: { fontStyle: 'bold' },
        });

        doc.save(`items_sold_report_${formatDateForInput(new Date())}.pdf`);
        setIsDownloadModalOpen(false);
    };

    /* ---------- EXCEL DOWNLOAD ---------- */
    const downloadAsExcel = () => {
        try {
            const excelData = aggregatedItems.map((item) => ({
                'Item Name': item.name,
                Category: item.itemGroup,
                'Quantity Sold': item.quantitySold,
                'Value Sold': Math.round(item.valueSold),
            }));

            const worksheet = XLSX.utils.json_to_sheet(excelData);
            const workbook = XLSX.utils.book_new();

            XLSX.utils.sheet_add_json(worksheet, [{
                'Item Name': 'TOTAL',
                Category: '',
                'Quantity Sold': summary.totalQuantitySold,
                'Value Sold': Math.round(summary.totalValueSold),
            }], { skipHeader: true, origin: -1 });

            XLSX.utils.book_append_sheet(workbook, worksheet, 'Items Sold');

            XLSX.writeFile(
                workbook,
                `items_sold_report_${formatDateForInput(new Date())}.xlsx`
            );

            setIsDownloadModalOpen(false);
            setFeedbackModal({
                isOpen: true,
                type: State.SUCCESS,
                message: 'Excel downloaded successfully!',
            });
        } catch {
            setFeedbackModal({
                isOpen: true,
                type: State.ERROR,
                message: 'Failed to generate Excel file.',
            });
        }
    };

    /* ---------- LOAD STATES ---------- */
    if (isLoading || authLoading)
        return <div className="p-4 text-center">Loading...</div>;
    if (error) return <div className="p-4 text-center text-red-500">{error}</div>;

    return (
        <div className="min-h-screen bg-gray-100 p-2 pb-16">
            {feedbackModal.isOpen && (
                <Modal
                    type={feedbackModal.type}
                    message={feedbackModal.message}
                    onClose={() => setFeedbackModal((p) => ({ ...p, isOpen: false }))}
                    showConfirmButton={false}
                />
            )}

            <DownloadChoiceModal
                isOpen={isDownloadModalOpen}
                onClose={() => setIsDownloadModalOpen(false)}
                onDownloadPdf={downloadAsPdf}
                onDownloadExcel={downloadAsExcel}
            />

            {/* HEADER */}
            <div className="flex items-center justify-between pb-3 border-b mb-2">
                <h1 className="flex-1 text-xl text-center font-bold text-gray-800">
                    Items Sold Report
                </h1>
                <button onClick={() => navigate(-1)} className="p-2">
                    <IconClose width={20} height={20} />
                </button>
            </div>

            {/* FILTERS */}
            <div className="bg-white p-2 rounded-lg shadow-md mb-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <FilterSelect
                        value={datePreset}
                        onChange={(e) => handleDatePresetChange(e.target.value)}
                    >
                        <option value="today">Today</option>
                        <option value="yesterday">Yesterday</option>
                        <option value="last7">Last 7 Days</option>
                        <option value="last30">Last 30 Days</option>
                        <option value="custom">Custom</option>
                    </FilterSelect>

                    <div className="grid grid-cols-2 gap-4">
                        <input
                            type="date"
                            value={customStartDate}
                            onChange={(e) => {
                                setCustomStartDate(e.target.value);
                                setDatePreset('custom');
                            }}
                            className="w-full p-2 text-sm bg-gray-50 border rounded-md"
                        />
                        <input
                            type="date"
                            value={customEndDate}
                            onChange={(e) => {
                                setCustomEndDate(e.target.value);
                                setDatePreset('custom');
                            }}
                            className="w-full p-2 text-sm bg-gray-50 border rounded-md"
                        />
                    </div>
                </div>

                <button
                    onClick={handleApplyFilters}
                    className="w-full mt-2 px-3 py-1 bg-blue-600 text-white text-lg font-semibold rounded-lg hover:bg-blue-700"
                >
                    Apply
                </button>
            </div>

            {/* REPORT DETAILS */}
            <ReportDetails
                downloadAsPdf={() => {
                    if (aggregatedItems.length === 0) {
                        setFeedbackModal({
                            isOpen: true,
                            type: State.INFO,
                            message: 'No data available to download.',
                        });
                    } else {
                        setIsDownloadModalOpen(true);
                    }
                }}
                filteredSales={aggregatedItems as any}
                isListVisible={isListVisible}
                setIsListVisible={setIsListVisible}
            />

            {/* DATA TABLE */}
            {isListVisible && (
                <CustomTable<AggregatedItem>
                    data={aggregatedItems}
                    columns={tableColumns}
                    keyExtractor={(item) => item.id}
                    sortConfig={sortConfig as any}
                    onSort={handleSort as any}
                    emptyMessage="No items were sold during the selected period."
                />
            )}
        </div>
    );
};

export default ItemsSoldReport;