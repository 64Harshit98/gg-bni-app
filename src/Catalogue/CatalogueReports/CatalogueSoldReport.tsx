import React, { useMemo, useState, useEffect } from 'react';
import FilterSelect from '../../Pages/Reports/SalesReportComponents/FilterSelect';
import { useNavigate } from 'react-router-dom';
import {
    formatDate,
    formatDateForInput,
} from '../../Pages/Reports/SalesReportComponents/salesReport.utils';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { type TableColumn } from '../../Components/CustomTable';
import { State } from '../../enums';
import { CustomTable } from '../../Components/CustomTable';
import { IconClose } from '../../constants/Icons';
import ReportDetails from '../../Pages/Reports/SalesReportComponents/ReportDetails';
import DownloadChoiceModal from '../../Pages/Reports/ItemReportComponents/DownloadChoiceModal';
import { Modal } from '../../constants/Modal';
import { DatePreset } from '../../Catalogue/enum/datePreset.enum';

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

    const [datePreset, setDatePreset] = useState<DatePreset>(DatePreset.TODAY);
    const [customStartDate, setCustomStartDate] = useState<string>('');
    const [customEndDate, setCustomEndDate] = useState<string>('');
    const [appliedFilters, setAppliedFilters] = useState<{ start: number; end: number } | null>(null);
    const [isListVisible, setIsListVisible] = useState(false);

    const [sales, setSales] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const authLoading = false;

    /* ---------- LOCAL STATES ---------- */
    const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
    const [feedbackModal, setFeedbackModal] = useState({
        isOpen: false,
        type: State.INFO,
        message: '',
    });

    const { currentUser } = useAuth();
    const [itemGroupMap, setItemGroupMap] = useState<Record<string, string>>({});

    //fetching items groups
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

    //----fetching sales here-----
    const fetchSales = async () => {
        if (!currentUser?.companyId) return;

        setIsLoading(true);
        try {
            const ordersRef = collection(db, 'companies', currentUser.companyId, 'Orders');
            const snapshot = await getDocs(ordersRef);

            const fetchedSales = snapshot.docs
                .map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        createdAt: data.createdAt?.toMillis?.() || Date.now(),
                        status: data.status || "",
                        items: Array.isArray(data.items) ? data.items : [],
                    };
                })
                .filter(order => {
                    const status = (order.status || "").toLowerCase();
                    return status === 'completed' || status === 'paid';
                })

            setSales(fetchedSales);
        } catch (err) {
            console.error("Error fetching sales:", err);
            setError('Failed to fetch sales');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchSales();
    }, [currentUser?.companyId]);

    const [sortConfig, setSortConfig] = useState<{
        key: keyof AggregatedItem;
        direction: 'asc' | 'desc';
    }>({ key: 'valueSold', direction: 'desc' });

    /* ---------- DATE PRESET ---------- */
    const handleDatePresetChange = (preset: DatePreset) => {
        setDatePreset(preset);
        const start = new Date();
        const end = new Date();

        switch (preset) {
            case DatePreset.TODAY:
                break;
            case DatePreset.YESTERDAY:
                start.setDate(start.getDate() - 1);
                end.setDate(end.getDate() - 1);
                break;
            case DatePreset.LAST_7_DAYS:
                start.setDate(start.getDate() - 6);
                break;
            case DatePreset.LAST_30_DAYS:
                start.setDate(start.getDate() - 29);
                break;
            case DatePreset.CUSTOM:
                return;
        }

        setCustomStartDate(formatDateForInput(start));
        setCustomEndDate(formatDateForInput(end));
    };

    const handleApplyFilters = () => {
        let start = new Date();
        let end = new Date();

        switch (datePreset) {
            case DatePreset.TODAY:
                break;

            case DatePreset.YESTERDAY:
                start.setDate(start.getDate() - 1);
                end.setDate(end.getDate() - 1);
                break;

            case DatePreset.LAST_7_DAYS:
                start.setDate(start.getDate() - 6);
                break;

            case DatePreset.LAST_30_DAYS:
                start.setDate(start.getDate() - 29);
                break;

            case DatePreset.CUSTOM:
                start = customStartDate ? new Date(customStartDate) : new Date(0);
                end = customEndDate ? new Date(customEndDate) : new Date();
                break;
        }

        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        setAppliedFilters({
            start: start.getTime(),
            end: end.getTime()
        });
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
            sale.items
                .filter((item: any) => item && item.quantity > 0)
                .forEach((item: any) => {
                    const id = item.productId || item.id || 'unknown';
                    const groupId =
                        item.groupId ||
                        item.itemGroupId ||
                        item.groupid ||
                        item.itemGroup ||
                        item.group?.id ||
                        null;

                    if (!itemMap.has(id)) {
                        itemMap.set(id, {
                            id,
                            name: item.name || 'Unknown Item',
                            //itemGroup: itemGroupMap[item.itemGroupId] || item.category || 'Uncategorized',
                            itemGroup:
                                (groupId && itemGroupMap[groupId]) ||
                                item.groupName ||
                                item.category ||
                                'Uncategorized',
                            quantitySold: 0,
                            valueSold: 0,
                        });
                    }

                    const existingItem = itemMap.get(id)!;
                    const qty = item.quantity || 1;

                    const pricePerItem = item.effectiveUnitPrice || item.customPrice || item.salesPrice || item.mrp || 0;
                    if (!pricePerItem) return;
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
        doc.setFontSize(18);
        doc.text('Items Sold Report', 14, 22);
        doc.setFontSize(11);
        doc.setTextColor(100);

        doc.text(
            `Date Range: ${formatDate(appliedFilters.start)} to ${formatDate(appliedFilters.end)}`,
            14,
            29
        );

        autoTable(doc, {
            startY: 35,
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
                        onChange={(e) => handleDatePresetChange(e.target.value as DatePreset)}
                    >
                        <option value={DatePreset.TODAY}>Today</option>
                        <option value={DatePreset.YESTERDAY}>Yesterday</option>
                        <option value={DatePreset.LAST_7_DAYS}>Last 7 Days</option>
                        <option value={DatePreset.LAST_30_DAYS}>Last 30 Days</option>
                        <option value={DatePreset.CUSTOM}>Custom</option>
                    </FilterSelect>

                    <div className="grid grid-cols-2 gap-4">
                        <input
                            type="date"
                            value={customStartDate}
                            onChange={(e) => {
                                setCustomStartDate(e.target.value);
                                setDatePreset(DatePreset.CUSTOM);
                            }}
                            className="w-full p-2 text-sm bg-gray-50 border rounded-md"
                        />
                        <input
                            type="date"
                            value={customEndDate}
                            onChange={(e) => {
                                setCustomEndDate(e.target.value);
                                setDatePreset(DatePreset.CUSTOM);
                            }}
                            className="w-full p-2 text-sm bg-gray-50 border rounded-md"
                        />
                    </div>
                </div>

                <button
                    onClick={handleApplyFilters}
                    className="w-full mt-2 px-3 py-1 bg-[#F97316] text-white text-lg font-semibold rounded-lg hover:bg-orange-700"
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
                isCatalogueMode = {true}
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