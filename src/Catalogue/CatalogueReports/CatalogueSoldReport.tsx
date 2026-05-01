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
import { IconClose, IconSearch } from '../../constants/Icons';
import ReportDetails from '../../Pages/Reports/SalesReportComponents/ReportDetails';
import DownloadChoiceModal from '../../Pages/Reports/ItemReportComponents/DownloadChoiceModal';
import { Modal } from '../../constants/Modal';
import { DatePreset } from '../../Catalogue/enum/datePreset.enum';
//import { Cata_Permissions } from '../enum/cata_permissions.enum';
//import CataShowWrapper from '../../context/CataShowWrapper';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
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
    const [appliedFilters, setAppliedFilters] = useState<{ start: number; end: number } | null>(() => {
        const now = new Date();
        const start = new Date(now);
        const end = new Date(now);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        return {
            start: start.getTime(),
            end: end.getTime(),
        };
    });
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

    // Auto-apply filters on load and when preset changes (except CUSTOM)
    useEffect(() => {
        if (datePreset !== DatePreset.CUSTOM) {
            handleApplyFilters();
        }
    }, [datePreset, sales]);

    const [sortConfig, setSortConfig] = useState<{
        key: keyof AggregatedItem;
        direction: 'asc' | 'desc';
    }>({ key: 'valueSold', direction: 'desc' });
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);

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

        let itemsArray = Array.from(itemMap.values());

        // SEARCH (ONLY ITEM NAME)
        const trimmedQuery = searchQuery.toLowerCase().trim();

        if (trimmedQuery) {
            const searchTokens = trimmedQuery.split(/\s+/);

            itemsArray = itemsArray.filter((item) => {
                const name = item.name.toLowerCase();

                const matchesName = searchTokens.every(token =>
                    name.includes(token)
                );

                return matchesName;
            });
        }

        return {
            aggregatedItems: itemsArray,
            summary: {
                totalValueSold: overallValue,
                totalQuantitySold: overallQty,
                uniqueItemCount: itemsArray.length,
            },
        };
    }, [appliedFilters, sales, sortConfig, itemGroupMap, searchQuery]);// Added itemGroupMap dependency

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
    const downloadAsPdf = async () => {
        if (!appliedFilters) return;

        try {
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();

            // ===== LOGO =====
            try {
                const base64Logo = await resolveCompanyLogoBase64(currentUser?.companyId);
                if (base64Logo) {
                    const img = new Image();
                    img.src = base64Logo;
                    await new Promise<void>((resolve) => {
                        img.onload = () => {
                            const logoWidth = 13;
                            const logoHeight = (img.naturalHeight / img.naturalWidth) * logoWidth;
                            const logoX = pageWidth - logoWidth - 14;
                            doc.addImage(base64Logo, 'PNG', logoX, 8, logoWidth, logoHeight);
                            resolve();
                        };
                        img.onerror = () => resolve();
                    });
                }
            } catch {}

            // ===== GENERATION TAG =====
            const generatedAt = new Date().toLocaleString('en-IN');
            const margin = 14;

            const tagText = `Generated by SELLAR • ${generatedAt}`;

            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);

            const textWidth = doc.getTextWidth(tagText);
            const paddingX = 2;

            const boxWidth = textWidth + paddingX * 2;
            const boxHeight = 5;

            const boxX = pageWidth - margin - boxWidth;
            const boxY = 10;

            doc.setFillColor(245, 245, 245);
            doc.rect(boxX, boxY, boxWidth, boxHeight, "F");

            doc.setTextColor(80, 80, 80);
            doc.text(tagText, boxX + paddingX, boxY + 3.5);

            doc.setTextColor(0, 0, 0);

            // ===== ORANGE HEADER BAR =====
            doc.setFillColor(249, 115, 22);
            doc.rect(0, 0, pageWidth, 6, 'F');

            // ===== TITLE =====
            doc.setFontSize(22);
            doc.setTextColor(17, 24, 39);
            doc.setFont('helvetica', 'bold');
            doc.text('Items Sold Report', 14, 24);

            // ===== SUBTITLE =====
            doc.setFontSize(10);
            doc.setTextColor(107, 114, 128);
            doc.setFont('helvetica', 'normal');

            const generationDate = new Date().toLocaleDateString('en-IN', {
                year: 'numeric', month: 'short', day: 'numeric',
            });

            const subtitleText = `Generated on: ${generationDate}   |   Period: ${formatDate(appliedFilters.start)} to ${formatDate(appliedFilters.end)}`;
            doc.text(subtitleText, 14, 31);

            // ===== TABLE =====
            autoTable(doc, {
                startY: 38,
                head: [['ITEM NAME', 'CATEGORY', 'QTY SOLD', 'VALUE (Rs.)']],
                body: aggregatedItems.map((item) => [
                    item.name,
                    item.itemGroup,
                    item.quantitySold.toString(),
                    Math.round(item.valueSold).toLocaleString('en-IN')
                ]),
                foot: [[
                    'TOTAL',
                    '-',
                    summary.totalQuantitySold.toString(),
                    Math.round(summary.totalValueSold).toLocaleString('en-IN')
                ]],
                theme: 'plain',
                styles: {
                    font: 'helvetica',
                    cellPadding: 7,
                    fontSize: 10,
                    textColor: [55, 65, 81],
                },
                headStyles: {
                    fillColor: [249, 250, 251],
                    textColor: [17, 24, 39],
                    fontStyle: 'bold',
                    halign: 'center',
                    lineWidth: { top: 1, bottom: 1 },
                    lineColor: [229, 231, 235],
                },
                footStyles: {
                    fillColor: [255, 255, 255],
                    textColor: [17, 24, 39],
                    fontStyle: 'bold',
                    halign: 'right',
                    lineWidth: { top: 1, bottom: 2 },
                    lineColor: [17, 24, 39],
                },
                alternateRowStyles: {
                    fillColor: [252, 252, 252],
                },
                columnStyles: {
                    0: { halign: 'left', cellWidth: 'auto' },
                    1: { halign: 'left', cellWidth: 40 },
                    2: { halign: 'right', cellWidth: 30 },
                    3: { halign: 'right', cellWidth: 40 },
                },
                didDrawPage: function () {
                    const pageCount = doc.getNumberOfPages();
                    doc.setFontSize(9);
                    doc.setTextColor(156, 163, 175);
                    doc.text(`Page ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
                },
            });

            doc.save(`items_sold_report_${formatDateForInput(new Date())}.pdf`);

        } catch (error) {
            console.error('Error generating PDF:', error);
        }

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

                {/* LEFT (Search Icon) */}
                <button onClick={() => setShowSearch(true)} className="p-2">
                    <IconSearch />
                </button>

                {/* TITLE */}
                <h1 className="flex-1 text-xl text-center font-bold text-gray-800">
                    Items Sold Report
                </h1>

                {/* RIGHT */}
                <button onClick={() => navigate(-1)} className="p-2">
                    <IconClose width={20} height={20} />
                </button>

            </div>

            {showSearch && (
                <div className="flex justify-center mb-2 px-2">
                    <div className="flex items-center w-full max-w-md border-b-2 border-slate-300 focus-within:border-[#F97316]">

                        <input
                            type="text"
                            placeholder="Search by Item Name..."
                            className="flex-1 text-base font-light p-2 outline-none bg-transparent text-center"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            autoFocus
                        />

                        <button
                            onClick={() => {
                                setSearchQuery('');
                                setShowSearch(false);
                            }}
                            className="p-1 text-gray-500 hover:text-black"
                        >
                            <IconClose />
                        </button>

                    </div>
                </div>
            )}

            {/* FILTERS */}
            <div className="bg-white p-2 rounded-sm shadow-md mb-2">
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
                            className="w-full p-2 text-sm bg-gray-50 border rounded-sm"
                        />
                        <input
                            type="date"
                            value={customEndDate}
                            onChange={(e) => {
                                setCustomEndDate(e.target.value);
                                setDatePreset(DatePreset.CUSTOM);
                            }}
                            className="w-full p-2 text-sm bg-gray-50 border rounded-sm"
                        />
                    </div>
                </div>

                <button
                    onClick={handleApplyFilters}
                    className="w-full mt-2 px-3 py-1 bg-[#F97316] text-white text-lg font-semibold rounded-sm hover:bg-orange-700"
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
                isCatalogueMode={true}
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