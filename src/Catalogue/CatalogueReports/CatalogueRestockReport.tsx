import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    Eye,
    EyeOff,
    IndianRupee,
    LayoutGrid,
    PackageMinus,
    PackagePlus,
    PackageX,
    Search,
    TrendingDown,
    X,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import { doc, getDoc } from 'firebase/firestore';

import { db } from '../../lib/Firebase';
import { resolveCompanyLogoBase64 } from '../hooks/useCompanyLogo';
import { useAuth } from '../../context/auth-context';
import { Modal } from '../../constants/Modal';
import { Spinner } from '../../constants/Spinner';
import sellarLogo from '../../assets/sellar-logo.png';
import BackButton from '../../Components/BackButton';
import SearchableSelect from '../../Components/SearchableSelect';
import { State } from '../../enums';
import { Cata_Permissions } from '../enum/cata_permissions.enum';
import { ItemEditDrawer } from '../../Components/ItemDrawer';
import type { Item } from '../../constants/models';
import DownloadMenu from '../../Pages/Reports/SalesReportComponents/DownloadMenu';
import { formatDateForInput } from '../../Pages/Reports/SalesReportComponents/salesReport.utils';
import useRestockReport from '../../Pages/Reports/RestockReportComponents/useRestockReport';
import {
    summarizeRestock,
    type RestockFilter,
    type RestockRow,
} from '../../Pages/Reports/RestockReportComponents/restockReport.utils';

type SortKey = 'stock' | 'orderQty' | 'estCost' | 'name';

const PAGE_SIZE = 100;
const inrRound = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const qty = (n: number) => n.toLocaleString('en-IN');

// Catalogue (orange) Excel colors
const XL = { title: 'F97316', sub: 'FFEDD5', head: 'EA580C', border: 'F6E1D0', foot: 'FFF7ED' };

/* ---------- PDF HELPERS (same look as Orders / Sales Report PDF) ---------- */
type RGB = [number, number, number];
const PDF_RADIUS = 0.5; // ≈ Tailwind rounded-sm

const toDataUrl = async (src: string): Promise<string | null> => {
    try {
        const blob = await (await fetch(src)).blob();
        return await new Promise((resolve) => {
            const r = new FileReader();
            r.onloadend = () => resolve(r.result as string);
            r.onerror = () => resolve(null);
            r.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
};

const drawGradientRect = (pdf: jsPDF, x: number, y: number, w: number, h: number, from: RGB, to: RGB) => {
    const steps = 120;
    const sw = w / steps;
    for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1);
        pdf.setFillColor(
            Math.round(from[0] + (to[0] - from[0]) * t),
            Math.round(from[1] + (to[1] - from[1]) * t),
            Math.round(from[2] + (to[2] - from[2]) * t),
        );
        pdf.rect(x + i * sw, y, sw + 0.3, h, 'F');
    }
};

const CatalogueRestockReport: React.FC = () => {
    const { currentUser, hasCataloguePermission } = useAuth();
    const canEditItems = hasCataloguePermission(Cata_Permissions.ManageItems);
    const { rows, itemGroups, loading } = useRestockReport();

    const [companyName, setCompanyName] = useState('');
    useEffect(() => {
        const fetchCompanyName = async () => {
            if (!currentUser?.companyId) return;
            try {
                const snap = await getDoc(doc(db, 'companies', currentUser.companyId, 'business_info', currentUser.companyId));
                if (snap.exists()) setCompanyName(snap.data().businessName || '');
            } catch (e) {
                console.error('Failed to fetch company name', e);
            }
        };
        fetchCompanyName();
    }, [currentUser?.companyId]);

    /* ---------- STATE ---------- */
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [statusFilter, setStatusFilter] = useState<RestockFilter>('all');
    const [groupFilter, setGroupFilter] = useState('');
    const [isListVisible, setIsListVisible] = useState(true);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
        key: 'stock',
        direction: 'asc',
    });
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const [countingItem, setCountingItem] = useState<Item | null>(null);
    const [feedbackModal, setFeedbackModal] = useState({ isOpen: false, type: State.INFO, message: '' });

    /* ---------- FILTER + SORT ---------- */
    const baseRows = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return rows.filter(
            (r) =>
                (!groupFilter || r.group === groupFilter) &&
                (!q || r.name.toLowerCase().includes(q) || r.barcode.toLowerCase().includes(q)),
        );
    }, [rows, searchQuery, groupFilter]);

    const summary = useMemo(() => summarizeRestock(baseRows), [baseRows]);

    const listRows = useMemo(() => {
        const list = baseRows.filter((r) => statusFilter === 'all' || r.status === statusFilter);
        const dir = sortConfig.direction === 'asc' ? 1 : -1;
        list.sort((a, b) => {
            if (sortConfig.key === 'name') return a.name.localeCompare(b.name, undefined, { numeric: true }) * dir;
            if (sortConfig.key === 'estCost') return ((a.estCost ?? -1) - (b.estCost ?? -1)) * dir;
            return (a[sortConfig.key] - b[sortConfig.key]) * dir;
        });
        return list;
    }, [baseRows, statusFilter, sortConfig]);

    useEffect(() => {
        setVisibleCount(PAGE_SIZE);
    }, [baseRows, statusFilter, sortConfig]);

    const groupOptions = useMemo(
        () =>
            [...new Set([...itemGroups.map((g) => g.name), ...rows.map((r) => r.group)])]
                .filter(Boolean)
                .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
        [itemGroups, rows],
    );

    const handleSort = (key: SortKey) => {
        setSortConfig((prev) => ({
            key,
            direction: prev.key === key ? (prev.direction === 'asc' ? 'desc' : 'asc') : key === 'name' || key === 'stock' ? 'asc' : 'desc',
        }));
    };

    /* ---------- DOWNLOADS ---------- */
    const filterLabel =
        statusFilter === 'out' ? 'Out of stock only' : statusFilter === 'low' ? 'Low stock only' : 'All items to reorder';
    const statusText = (r: RestockRow) => (r.status === 'out' ? 'Out of stock' : 'Low stock');

    const downloadAsPdf = async () => {
        try {
            const pdf = new jsPDF();
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const M = 14;
            const PAD = 4;
            const brandRight = pageWidth - M;
            const contentW = pageWidth - M * 2;
            const company = companyName || 'Your Business';
            const itemWord = (n: number) => (n === 1 ? 'item' : 'items');

            const generatedAtText = `Generated ${new Date().toLocaleString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
            })}`;

            // ---------- ASSETS ----------
            const base64Logo = await resolveCompanyLogoBase64(currentUser?.companyId).catch(() => null);
            const sellarImg = await toDataUrl(sellarLogo);

            const drawCompanyTile = (x: number, y: number, size: number, onDark: boolean) => {
                let drawn = false;
                if (base64Logo) {
                    try {
                        const props = pdf.getImageProperties(base64Logo);
                        const maxSide = size - size * 0.22;
                        const scale = Math.min(maxSide / props.width, maxSide / props.height);
                        const w = props.width * scale;
                        const h = props.height * scale;
                        pdf.setFillColor(255, 255, 255);
                        if (onDark) {
                            pdf.roundedRect(x, y, size, size, PDF_RADIUS, PDF_RADIUS, 'F');
                        } else {
                            pdf.setDrawColor(229, 231, 235);
                            pdf.setLineWidth(0.3);
                            pdf.roundedRect(x, y, size, size, PDF_RADIUS, PDF_RADIUS, 'FD');
                        }
                        pdf.addImage(base64Logo, props.fileType, x + (size - w) / 2, y + (size - h) / 2, w, h);
                        drawn = true;
                    } catch {
                        // invalid logo -> initial fallback
                    }
                }
                if (!drawn) {
                    if (onDark) pdf.setFillColor(154, 52, 18);
                    else pdf.setFillColor(194, 65, 12);
                    pdf.roundedRect(x, y, size, size, PDF_RADIUS, PDF_RADIUS, 'F');
                    pdf.setTextColor(255, 255, 255);
                    pdf.setFont('helvetica', 'bold');
                    pdf.setFontSize(size * 0.9);
                    pdf.text(
                        (companyName.trim().charAt(0) || 'S').toUpperCase(),
                        x + size / 2,
                        y + size / 2,
                        { align: 'center', baseline: 'middle' },
                    );
                }
            };

            // ---------- 1. HEADER (gradient) ----------
            drawGradientRect(pdf, 0, 0, pageWidth, 64, [194, 65, 12], [249, 115, 22]);
            drawCompanyTile(M, 11, 14, true);

            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            pdf.setTextColor(255, 237, 213);
            pdf.text('Prepared for', 32, 15);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(14);
            pdf.setTextColor(255, 255, 255);
            pdf.text(company, 32, 22);

            // SELLAR logo + text (top-right, white pill)
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(9);
            const brandTextW = pdf.getTextWidth('SELLAR') + 5 * 0.3;
            const sellarLh = 5;
            let sellarLw = 0;
            if (sellarImg) {
                try {
                    const lp = pdf.getImageProperties(sellarImg);
                    sellarLw = (lp.width / lp.height) * sellarLh;
                } catch {
                    // continue without SELLAR logo
                }
            }
            const pillPadX = 3;
            const pillW = brandTextW + (sellarLw ? sellarLw + 2 : 0) + pillPadX * 2;
            pdf.setFillColor(255, 255, 255);
            pdf.roundedRect(brandRight - pillW, 7.5, pillW, 8, PDF_RADIUS, PDF_RADIUS, 'F');
            if (sellarImg && sellarLw) {
                pdf.addImage(
                    sellarImg,
                    'PNG',
                    brandRight - pillPadX - brandTextW - sellarLw - 2,
                    9,
                    sellarLw,
                    sellarLh,
                );
            }
            pdf.setTextColor(0, 0, 0);
            pdf.text('SELLAR', brandRight - pillPadX, 12.6, { align: 'right', charSpace: 0.3 });

            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8.5);
            pdf.setTextColor(255, 237, 213);
            pdf.text(generatedAtText, brandRight, 21, { align: 'right' });

            // Title block (left): white tile + lucide FileText icon
            pdf.setFillColor(255, 255, 255);
            pdf.roundedRect(M, 31, 14, 14, PDF_RADIUS, PDF_RADIUS, 'F');

            const ix = M + 3.5;
            const iy = 31 + 3.5;
            const k = 7 / 24;
            const seg = (pts: [number, number][]) => {
                for (let i = 0; i < pts.length - 1; i++) {
                    pdf.line(
                        ix + pts[i][0] * k, iy + pts[i][1] * k,
                        ix + pts[i + 1][0] * k, iy + pts[i + 1][1] * k,
                    );
                }
            };
            pdf.setDrawColor(194, 65, 12);
            pdf.setLineWidth(0.5);
            pdf.setLineCap('round');
            pdf.setLineJoin('round');
            seg([[15, 2], [6, 2], [4, 4], [4, 20], [6, 22], [18, 22], [20, 20], [20, 7], [15, 2]]);
            seg([[14, 2], [14, 6], [16, 8], [20, 8]]);
            seg([[10, 9], [8, 9]]);
            seg([[16, 13], [8, 13]]);
            seg([[16, 17], [8, 17]]);
            pdf.setLineCap('butt');
            pdf.setLineJoin('miter');

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(26);
            pdf.setTextColor(255, 255, 255);
            pdf.text('Restock Report', 32, 38);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(10);
            pdf.setTextColor(255, 237, 213);
            pdf.text('What to reorder and how much', 32, 44.5);

            // Filter + count (right)
            pdf.setFontSize(9);
            pdf.text('Showing', brandRight, 34, { align: 'right' });
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(14);
            pdf.setTextColor(255, 255, 255);
            pdf.text(filterLabel, brandRight, 40.5, { align: 'right' });
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            pdf.setTextColor(255, 237, 213);
            pdf.text(`${listRows.length} ${itemWord(listRows.length)}`, brandRight, 45.5, { align: 'right' });

            // ---------- 2. SUMMARY CARDS (content-based widths) ----------
            const cardY = 50;
            const cardH = 32;
            const kpiPad = 6;
            const cardsData = [
                { label: 'Need restock', value: qty(summary.total), hint: 'below restock level' },
                { label: 'Out of stock', value: qty(summary.outOfStock), hint: 'order these first' },
                { label: 'Low stock', value: qty(summary.lowStock), hint: 'still some left' },
                {
                    label: 'Est. restock cost',
                    value: `Rs. ${Math.round(summary.estCost).toLocaleString('en-IN')}`,
                    hint: summary.withoutCost
                        ? `${qty(summary.withoutCost)} ${summary.withoutCost === 1 ? 'item has' : 'items have'} no cost price`
                        : `to bring all ${qty(summary.total)} back to level`,
                },
            ];
            const valBase = [20, 15, 15, 15];
            const measureKpi = (scale: number) =>
                cardsData.map((c, i) => {
                    pdf.setFont('helvetica', 'bold');
                    pdf.setFontSize(valBase[i] * scale);
                    const vw = pdf.getTextWidth(c.value);
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(9.5);
                    const lw = pdf.getTextWidth(c.label);
                    pdf.setFontSize(8.5);
                    const hw = pdf.getTextWidth(c.hint);
                    return Math.max(vw, lw, hw) + kpiPad * 2;
                });
            const sumOf = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

            let vScale = 1;
            let need = measureKpi(vScale);
            while (sumOf(need) > contentW && vScale > 0.55) {
                vScale -= 0.03;
                need = measureKpi(vScale);
            }
            const needTotal = sumOf(need);
            const spare = needTotal < contentW ? (contentW - needTotal) / cardsData.length : 0;
            const colWs = need.map((w) => (needTotal > contentW ? (w * contentW) / needTotal : w + spare));
            const colXs: number[] = [];
            let accX = M;
            colWs.forEach((w) => {
                colXs.push(accX);
                accX += w;
            });

            pdf.setFillColor(255, 255, 255);
            pdf.roundedRect(M, cardY, contentW, cardH, PDF_RADIUS, PDF_RADIUS, 'F');
            pdf.setFillColor(255, 237, 213);
            pdf.roundedRect(M, cardY, colWs[0], cardH, PDF_RADIUS, PDF_RADIUS, 'F');
            pdf.rect(M + colWs[0] - 2, cardY, 2, cardH, 'F');
            pdf.setDrawColor(254, 215, 170);
            pdf.setLineWidth(0.3);
            pdf.roundedRect(M, cardY, contentW, cardH, PDF_RADIUS, PDF_RADIUS, 'S');
            for (let i = 1; i < cardsData.length; i++) {
                pdf.line(colXs[i], cardY, colXs[i], cardY + cardH);
            }

            cardsData.forEach((c, i) => {
                const cx = colXs[i] + kpiPad;
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(9.5);
                pdf.setTextColor(100, 110, 135);
                pdf.text(c.label, cx, cardY + 9);

                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(valBase[i] * vScale);
                if (i === 0) pdf.setTextColor(194, 65, 12);
                else if (i === 1 && summary.outOfStock > 0) pdf.setTextColor(213, 0, 12);
                else pdf.setTextColor(17, 24, 39);
                pdf.text(c.value, cx, cardY + 20);

                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(8.5);
                pdf.setTextColor(120, 128, 150);
                pdf.text(c.hint, cx, cardY + 27);
            });

                        // ---------- 3. STOCK STATUS CARD ----------
            const statY = 90;
            const statH = 34;
            pdf.setFillColor(255, 255, 255);
            pdf.setDrawColor(254, 215, 170);
            pdf.setLineWidth(0.3);
            pdf.roundedRect(M, statY, contentW, statH, PDF_RADIUS, PDF_RADIUS, 'FD');

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(12);
            pdf.setTextColor(17, 24, 39);
            pdf.text('Stock status', M + 6, statY + 10);

            const outPct = summary.total ? Math.round((summary.outOfStock / summary.total) * 100) : 0;
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            pdf.setTextColor(107, 114, 128);
            pdf.text(
                summary.total ? `${outPct}% out of stock` : 'Nothing to reorder',
                brandRight - 6,
                statY + 10,
                { align: 'right' },
            );

            const barX = M + 6;
            const barY = statY + 16;
            const barW = contentW - 12;
            const barH = 5;
            pdf.setFillColor(255, 237, 213);
            pdf.rect(barX, barY, barW, barH, 'F');
            if (summary.total > 0) {
                const outW = (barW * summary.outOfStock) / summary.total;
                if (summary.outOfStock > 0) {
                    pdf.setFillColor(220, 38, 38);
                    pdf.rect(barX, barY, outW, barH, 'F');
                }
                if (summary.lowStock > 0) {
                    pdf.setFillColor(245, 158, 11);
                    pdf.rect(barX + outW, barY, barW - outW, barH, 'F');
                }
            }

            // legend
            const legendY = statY + 29;
            pdf.setFontSize(9);
            let lx = barX;
            const legend: { label: string; color: RGB }[] = [
                { label: `Out of stock  ${qty(summary.outOfStock)}`, color: [220, 38, 38] },
                { label: `Low stock  ${qty(summary.lowStock)}`, color: [245, 158, 11] },
            ];
            legend.forEach((l) => {
                pdf.setFillColor(l.color[0], l.color[1], l.color[2]);
                pdf.circle(lx + 1, legendY - 1, 1, 'F');
                pdf.setFont('helvetica', 'normal');
                pdf.setTextColor(71, 85, 105);
                pdf.text(l.label, lx + 4, legendY);
                lx += 4 + pdf.getTextWidth(l.label) + 10;
            });

            // ---------- 4. ITEMS HEADING ----------
            const itemsY = statY + statH + 14;
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(14);
            pdf.setTextColor(17, 24, 39);
            pdf.text('Items to reorder', M, itemsY);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(10.5);
            pdf.setTextColor(107, 114, 128);
            pdf.text(`${listRows.length} ${itemWord(listRows.length)}`, brandRight, itemsY, { align: 'right' });

                        // ---------- 5. ITEMS TABLE ----------
            // Item | ID | Stock | Level | Order qty | Est. cost | Status  (total = contentW = 182mm)
            const COLW = [50, 22, 16, 22, 24, 26, 22];
            const numericCols = new Set([2, 3, 4, 5]);
            const costCol = 5;
            const statusCol = 6;

            autoTable(pdf, {
                startY: itemsY + 4,
                margin: { top: 26, bottom: 22, left: M, right: M },
                head: [['Item', 'ID', 'Stock', 'Level', 'Order qty', 'Est. cost (Rs.)', 'Status']],
                body: listRows.map((r) => [
                    r.looksWrong ? `${r.name} *` : r.name,
                    r.barcode || '-',
                    qty(r.stock),
                    qty(r.level),
                    `${qty(r.orderQty)} ${r.unit}`,
                    r.estCost === null ? '-' : r.estCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                    statusText(r),
                ]),
                foot: [[
                    `Total: ${listRows.length} items`,
                    '',
                    '',
                    '',
                    `${qty(listRows.reduce((s, r) => s + r.orderQty, 0))}`,
                    listRows.reduce((s, r) => s + (r.estCost ?? 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                    '',
                ]],
                showFoot: 'lastPage',
                theme: 'plain',
                styles: {
                    font: 'helvetica',
                    fontSize: 9.5,
                    cellPadding: { top: 3.4, bottom: 3.4, left: PAD, right: PAD },
                    textColor: [17, 24, 39],
                    lineWidth: 0,
                },
                headStyles: { fillColor: [255, 247, 237], textColor: [154, 52, 18], fontStyle: 'bold', fontSize: 9 },
                footStyles: { fillColor: [255, 247, 237], textColor: [17, 24, 39], fontStyle: 'bold', fontSize: 10 },
                columnStyles: Object.fromEntries(
                    COLW.map((w, i) => [i, numericCols.has(i) ? { cellWidth: w, halign: 'right' } : { cellWidth: w }]),
                ),
                didParseCell: (data) => {
                    data.cell.styles.valign = 'middle';

                    // Header / Total row: numeric columns right-aligned, same as body
                    if (data.section !== 'body' && numericCols.has(data.column.index)) {
                        data.cell.styles.halign = 'right';
                    }

                    if (data.section === 'body') {
                        const row = listRows[data.row.index];
                        if (row?.looksWrong) data.cell.styles.fillColor = [255, 243, 221];
                        if (data.column.index === 2 && String(data.cell.raw).startsWith('-')) {
                            data.cell.styles.textColor = [213, 0, 12];
                            data.cell.styles.fontStyle = 'bold';
                        }
                        if (data.column.index === statusCol) {
                            data.cell.styles.textColor = data.cell.raw === 'Out of stock' ? [213, 0, 12] : [187, 77, 0];
                            data.cell.styles.fontStyle = 'bold';
                        }
                    }

                    // Very long total cost -> shrink font so it doesn't wrap
                    if (data.section === 'foot' && data.column.index === costCol) {
                        pdf.setFont('helvetica', 'bold');
                        pdf.setFontSize(10);
                        const w = pdf.getTextWidth(data.cell.text.join(' '));
                        const avail = COLW[costCol] - PAD * 2;
                        if (w > avail) data.cell.styles.fontSize = (10 * avail) / w;
                    }
                },
                didDrawCell: (data) => {
                    const { x, y, width, height } = data.cell;

                    // Vertical column lines (grid)
                    pdf.setDrawColor(254, 215, 170);
                    pdf.setLineWidth(0.2);
                    pdf.line(x + width, y, x + width, y + height);
                    if (data.column.index === 0) pdf.line(x, y, x, y + height);

                    // Horizontal lines
                    if (data.section === 'head') {
                        pdf.setDrawColor(194, 65, 12);
                        pdf.setLineWidth(0.5);
                        pdf.line(x, y + height, x + width, y + height);
                    }
                    if (data.section === 'body') {
                        pdf.setDrawColor(254, 215, 170);
                        pdf.setLineWidth(0.2);
                        pdf.line(x, y + height, x + width, y + height);
                    }
                    if (data.section === 'foot') {
                        pdf.setDrawColor(17, 24, 39);
                        pdf.setLineWidth(0.5);
                        pdf.line(x, y, x + width, y);
                        pdf.line(x, y + height, x + width, y + height);
                    }
                },
            });

            if (listRows.some((r) => r.looksWrong)) {
                let noteY = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
                if (noteY > pageHeight - 22) {
                    pdf.addPage();
                    noteY = 32;
                }
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(8);
                pdf.setTextColor(187, 77, 0);
                pdf.text('* Stock looks wrong (far below zero) — count it before ordering.', M, noteY);
            }

            // ---------- PAGE 2+ MINI HEADER + FOOTER (every page) ----------
            const totalPages = pdf.getNumberOfPages();
            for (let i = 1; i <= totalPages; i++) {
                pdf.setPage(i);

                if (i > 1) {
                    drawCompanyTile(M, 9, 9, false);
                    pdf.setFont('helvetica', 'bold');
                    pdf.setFontSize(10);
                    pdf.setTextColor(17, 24, 39);
                    pdf.text(company, M + 12, 15.4);
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(9);
                    pdf.setTextColor(107, 114, 128);
                    pdf.text(`Restock Report | ${filterLabel}`, brandRight, 15.4, { align: 'right' });
                }

                const fy = pageHeight - 12;
                let x = M;
                if (sellarImg) {
                    try {
                        const lp = pdf.getImageProperties(sellarImg);
                        const lh = 5;
                        const lw = (lp.width / lp.height) * lh;
                        pdf.addImage(sellarImg, 'PNG', x, fy - 3.8, lw, lh);
                        x += lw + 2;
                    } catch {
                        // continue without footer logo
                    }
                }

                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(9);
                pdf.setTextColor(0, 0, 0);
                pdf.text('SELLAR', x, fy, { charSpace: 0.3 });
                x += pdf.getTextWidth('SELLAR') + 5 * 0.3 + 4;

                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(8.5);
                pdf.setTextColor(107, 114, 128);
                pdf.text(generatedAtText, x, fy);

                pdf.text(`${company} | Restock Report | Page ${i} of ${totalPages}`, brandRight, fy, {
                    align: 'right',
                });
            }

            pdf.save(`Restock_Report_${formatDateForInput(new Date())}.pdf`);
        } catch (err) {
            console.error('PDF Generation Error:', err);
            setFeedbackModal({ isOpen: true, type: State.ERROR, message: 'Failed to generate PDF.' });
        }
    };

    const downloadAsExcel = () => {
        try {
            const border = { style: 'thin', color: { rgb: XL.border } };
            const cellStyle = (opts: { bold?: boolean; color?: string; fill?: string; align?: string; size?: number }) => ({
                font: { name: 'Arial', sz: opts.size ?? 9, bold: !!opts.bold, color: { rgb: opts.color ?? '0F172B' } },
                fill: opts.fill
                    ? { patternType: 'solid', fgColor: { rgb: opts.fill } }
                    : { patternType: 'none' },
                alignment: { horizontal: opts.align ?? 'left', vertical: 'center', wrapText: true },
                border: { top: border, bottom: border, left: border, right: border },
            });

            const COLS = [
                { header: '#', width: 6 },
                { header: 'Item', width: 30 },
                { header: 'ID', width: 14 },
                { header: 'Group', width: 16 },
                { header: 'Stock', width: 10 },
                { header: 'Restock Level', width: 14 },
                { header: 'Order Qty', width: 12 },
                { header: 'Unit', width: 8 },
                { header: 'Unit Cost (₹)', width: 14 },
                { header: 'Est. Cost (₹)', width: 16 },
                { header: 'Status', width: 14 },
                { header: 'Note', width: 30 },
            ];
            const colCount = COLS.length;
            const dataStart = 4;
            const aoa: (string | number)[][] = [
                [companyName ? `Restock Report — ${companyName}` : 'Restock Report'],
                [`Generated: ${new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}   |   ${filterLabel}   |   Need restock: ${summary.total}   |   Out of stock: ${summary.outOfStock}   |   Est. cost: ₹${Math.round(summary.estCost).toLocaleString('en-IN')}`],
                [],
                COLS.map((c) => c.header),
                ...listRows.map((r, i) => [
                    i + 1,
                    r.name,
                    r.barcode || '-',
                    r.group,
                    r.stock,
                    r.level,
                    r.orderQty,
                    r.unit,
                    r.unitCost ?? '',
                    r.estCost ?? '',
                    statusText(r),
                    r.looksWrong ? 'Stock looks wrong — count it first' : '',
                ]),
                ['TOTAL', `${listRows.length} items`, '', '', '', '', listRows.reduce((s, r) => s + r.orderQty, 0), '', '', listRows.reduce((s, r) => s + (r.estCost ?? 0), 0), '', ''],
            ];

            const ws: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet(aoa);
            ws['!cols'] = COLS.map((c) => ({ wch: c.width }));
            ws['!merges'] = [
                { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
                { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
            ];
            const put = (r: number, c: number, st: ReturnType<typeof cellStyle>, numFmt?: string) => {
                const addr = XLSX.utils.encode_cell({ r, c });
                if (!ws[addr]) ws[addr] = { t: 's', v: '' };
                ws[addr].s = st;
                if (numFmt && typeof ws[addr].v === 'number') ws[addr].z = numFmt;
            };

            put(0, 0, cellStyle({ bold: true, size: 16, color: 'FFFFFF', fill: XL.title, align: 'center' }));
            put(1, 0, cellStyle({ color: '45556C', fill: XL.sub, align: 'center' }));
            COLS.forEach((_, c) => put(3, c, cellStyle({ bold: true, size: 10, color: 'FFFFFF', fill: XL.head })));
            const numericCols = new Set([4, 5, 6, 8, 9]);
            listRows.forEach((r, i) => {
                const row = dataStart + i;
                for (let c = 0; c < colCount; c++) {
                    const color = c === 4 && r.stock < 0 ? 'D5000C' : c === 10 ? (r.status === 'out' ? 'D5000C' : 'BB4D00') : c === 11 ? 'BB4D00' : undefined;
                    put(row, c, cellStyle({ color, fill: r.looksWrong ? 'FFF3DD' : undefined, align: numericCols.has(c) ? 'right' : 'left' }), c === 8 || c === 9 ? '₹#,##0.00' : '#,##0');
                }
            });
            const footRow = dataStart + listRows.length;
            for (let c = 0; c < colCount; c++) {
                put(footRow, c, cellStyle({ bold: true, size: 10, fill: XL.foot, align: numericCols.has(c) ? 'right' : 'left' }), c === 9 ? '₹#,##0.00' : '#,##0');
            }

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Restock Report');
            XLSX.writeFile(wb, `Restock_Report_${formatDateForInput(new Date())}.xlsx`);
            setFeedbackModal({ isOpen: true, type: State.SUCCESS, message: 'Excel downloaded successfully!' });
        } catch {
            setFeedbackModal({ isOpen: true, type: State.ERROR, message: 'Failed to generate Excel file.' });
        }
    };

    // Shares everything that is safe to order (items with wrong stock are left out).
    const shareOnWhatsApp = () => {
        const toShare = listRows.filter((r) => !r.looksWrong);
        const text = [
            `*Order list${companyName ? ` — ${companyName}` : ''}*`,
            new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
            '',
            ...toShare.map((r, i) => `${i + 1}. ${r.name} — ${qty(r.orderQty)} ${r.unit}`),
            '',
            `${toShare.length} items · ${qty(toShare.reduce((s, r) => s + r.orderQty, 0))} pcs`,
        ].join('\n');
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    };

    const runDownload = (action: () => void) => {
        if (listRows.length === 0) {
            setFeedbackModal({ isOpen: true, type: State.INFO, message: 'Nothing to download — no items need restocking.' });
            return;
        }
        action();
    };

    /* ---------- RENDER HELPERS ---------- */
    const renderSortHeader = (label: string, key: SortKey, align: 'left' | 'right' = 'left') => {
        const isActive = sortConfig.key === key;
        const Icon = !isActive ? ArrowUpDown : sortConfig.direction === 'asc' ? ArrowUp : ArrowDown;
        return (
            <th className={`px-4 py-3 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}>
                <button
                    onClick={() => handleSort(key)}
                    className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-orange-800 ${align === 'right' ? 'flex-row-reverse' : ''} ${isActive ? 'text-orange-700' : ''}`}
                >
                    {label}
                    <Icon size={11} className={isActive ? 'opacity-100' : 'opacity-40'} />
                </button>
            </th>
        );
    };

    const renderStatus = (r: RestockRow) => (
        <span
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-0.5 text-xs font-semibold ${r.status === 'out' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                }`}
        >
            <span className={`h-1.5 w-1.5 rounded-full ${r.status === 'out' ? 'bg-red-600' : 'bg-amber-500'}`} />
            {statusText(r)}
        </span>
    );

    const countStockButton = (r: RestockRow) =>
        canEditItems ? (
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setCountingItem(r.item);
                }}
                className="whitespace-nowrap rounded-sm border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-400"
            >
                Count stock
            </button>
        ) : null;

    /* ---------- LOAD STATE ---------- */
    if (loading) return <Spinner />;

    const segments: { value: RestockFilter; label: string; short: string; count: number }[] = [
        { value: 'all', label: 'All', short: 'All', count: summary.total },
        { value: 'out', label: 'Out of stock', short: 'Out of stock', count: summary.outOfStock },
        { value: 'low', label: 'Low stock', short: 'Low', count: summary.lowStock },
    ];

    const statCards = [
        {
            label: 'Need restock',
            value: qty(summary.total),
            hint: 'below their restock level',
            icon: PackageMinus,
            iconClass: 'bg-orange-50 text-orange-600',
            valueClass: 'text-slate-900',
        },
        {
            label: 'Out of stock',
            value: qty(summary.outOfStock),
            hint: 'order these first',
            icon: PackageX,
            iconClass: 'bg-red-50 text-red-600',
            valueClass: summary.outOfStock > 0 ? 'text-red-600' : 'text-slate-900',
        },
        {
            label: 'Low stock',
            value: qty(summary.lowStock),
            hint: 'still some left',
            icon: TrendingDown,
            iconClass: 'bg-amber-50 text-amber-600',
            valueClass: 'text-slate-900',
        },
        {
            label: 'Est. restock cost',
            shortLabel: 'Est. cost',
            value: inrRound(summary.estCost),
            hint: summary.withoutCost
                ? `${qty(summary.withoutCost)} ${summary.withoutCost === 1 ? 'item has' : 'items have'} no cost price`
                : `to bring all ${qty(summary.total)} back to level`,
            icon: IndianRupee,
            iconClass: 'bg-green-50 text-green-600',
            valueClass: 'text-slate-900',
        },
    ];

    const visibleRows = listRows.slice(0, visibleCount);
    const segmentButtonClass = (active: boolean) =>
        `whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition ${active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white'
        }`;

    return (
        <div className="min-h-screen bg-[#fff5ec] px-3 pb-20 pt-3 font-poppins md:px-6 md:pb-8 md:pt-5">
            {feedbackModal.isOpen && (
                <Modal
                    theme="catalogue"
                    type={feedbackModal.type}
                    message={feedbackModal.message}
                    onClose={() => setFeedbackModal((p) => ({ ...p, isOpen: false }))}
                    showConfirmButton={false}
                />
            )}

            {canEditItems && (
                <ItemEditDrawer
                    item={countingItem}
                    isOpen={!!countingItem}
                    onClose={() => setCountingItem(null)}
                    // The shared items listener brings the corrected stock back into the list.
                    onSaveSuccess={() => { }}
                />
            )}

            {/* HEADER */}
            <header className="mb-4 flex items-center gap-2 md:gap-3">
                <BackButton />
                <div className="min-w-0 flex-1">
                    <p className="hidden text-xs text-slate-500 md:block">Reports /</p>
                    <div className="flex items-baseline gap-3">
                        <h1 className="text-lg font-bold text-slate-900 md:text-xl">Restock report</h1>
                        <span className="hidden text-xs text-slate-500 md:inline">What to reorder and how much</span>
                    </div>
                    <p className="text-xs text-slate-500 md:hidden">
                        {qty(summary.total)} {summary.total === 1 ? 'item' : 'items'} to reorder
                    </p>
                </div>

                {/* Desktop search */}
                <div className="relative hidden w-72 md:block">
                    <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search item or ID"
                        className="w-full rounded-sm border border-slate-300 bg-white py-2 pl-9 pr-8 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-orange-600 focus:ring-2 focus:ring-orange-100"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            aria-label="Clear search"
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-slate-400 hover:text-slate-600"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                {/* Mobile actions */}
                <div className="flex items-center md:hidden">
                    <button
                        onClick={() => setShowSearch((s) => !s)}
                        aria-label="Search"
                        className="rounded-sm p-2 text-slate-700 transition hover:bg-orange-100"
                    >
                        <Search size={20} />
                    </button>
                    <DownloadMenu
                        variant="icon"
                        theme="catalogue"
                        onExcel={() => runDownload(downloadAsExcel)}
                        onPdf={() => runDownload(downloadAsPdf)}
                        onWhatsApp={() => runDownload(shareOnWhatsApp)}
                    />
                </div>
            </header>

            {showSearch && (
                <div className="relative mb-3 md:hidden">
                    <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search item or ID"
                        autoFocus
                        className="w-full rounded-sm border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm outline-none focus:border-orange-600 focus:ring-2 focus:ring-orange-100"
                    />
                    <button
                        onClick={() => { setSearchQuery(''); setShowSearch(false); }}
                        aria-label="Close search"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-slate-400 hover:text-slate-600"
                    >
                        <X size={15} />
                    </button>
                </div>
            )}

            {/* SUMMARY — 2 cols on mobile, 4 cols on md+ */}
            <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4">
                {statCards.map(({ label, shortLabel, value, hint, icon: Icon, iconClass, valueClass }) => (
                    <div key={label} className="min-w-0 rounded-sm border border-[#f6e1d0] bg-white p-3 shadow-card md:p-4">
                        <div className="flex items-center gap-2">
                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm md:h-7 md:w-7 ${iconClass}`}>
                                <Icon size={14} />
                            </span>
                            <span className="truncate text-xs font-medium text-slate-700 md:text-sm">
                                {shortLabel ? (
                                    <>
                                        <span className="md:hidden">{shortLabel}</span>
                                        <span className="hidden md:inline">{label}</span>
                                    </>
                                ) : label}
                            </span>
                        </div>
                        <p className={`mt-2 truncate text-xl font-bold md:text-2xl ${valueClass}`}>{value}</p>
                        <p title={hint} className="mt-0.5 truncate text-[11px] text-slate-500 md:text-xs">{hint}</p>
                    </div>
                ))}
            </div>

            {/* MOBILE: status switch */}
            <div className="mb-3 grid grid-cols-[1fr_1.4fr_1fr] gap-1 rounded-sm bg-orange-50 p-1 md:hidden">
                {segments.map((s) => (
                    <button key={s.value} onClick={() => setStatusFilter(s.value)} className={segmentButtonClass(statusFilter === s.value)}>
                        {s.short} {s.count}
                    </button>
                ))}
            </div>

            {/* ITEMS */}
            <section className="rounded-sm border border-[#f6e1d0] bg-white shadow-card">
                <div className="hidden flex-wrap items-center gap-3 border-b border-[#f6e1d0] px-4 py-3 md:flex">
                    <div className="flex gap-1 rounded-sm bg-orange-50 p-1" role="group" aria-label="Filter by stock status">
                        {segments.map((s) => (
                            <button key={s.value} onClick={() => setStatusFilter(s.value)} className={segmentButtonClass(statusFilter === s.value)}>
                                {s.label} {qty(s.count)}
                            </button>
                        ))}
                    </div>
                    <div className="w-52 shrink-0">
                        <SearchableSelect
                            theme="orange"
                            buttonClassName="!h-[38px]"
                            leftIcon={<LayoutGrid size={14} />}
                            options={groupOptions.map((g) => ({ value: g, label: g }))}
                            value={groupFilter}
                            onChange={setGroupFilter}
                            placeholder="All groups"
                            searchPlaceholder="Search group..."
                            clearable
                        />
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                        <button
                            onClick={() => setIsListVisible((v) => !v)}
                            className="inline-flex items-center gap-1.5 rounded-sm px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-orange-50"
                        >
                            {isListVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                            {isListVisible ? 'Hide list' : 'Show list'}
                        </button>
                        <DownloadMenu
                            theme="catalogue"
                            onExcel={() => runDownload(downloadAsExcel)}
                            onPdf={() => runDownload(downloadAsPdf)}
                            onWhatsApp={() => runDownload(shareOnWhatsApp)}
                        />
                    </div>
                </div>

                {/* Empty state */}
                {listRows.length === 0 && (
                    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                        <span className="flex h-12 w-12 items-center justify-center rounded-sm bg-green-50 text-green-600">
                            <PackagePlus size={24} />
                        </span>
                        <p className="text-sm font-semibold text-slate-900">
                            {rows.length === 0
                                ? 'Nothing to reorder'
                                : groupFilter && baseRows.length === 0 && !searchQuery
                                    ? `Nothing to reorder in ${groupFilter}`
                                    : 'No items match these filters'}
                        </p>
                        <p className="max-w-sm text-xs text-slate-500">
                            {rows.length === 0
                                ? 'Every item is above its restock level. Set a restock level on items (Add or Edit item) to get reminders here.'
                                : 'Clear the search or pick another group or status.'}
                        </p>
                    </div>
                )}

                {/* Desktop table */}
                {isListVisible && listRows.length > 0 && (
                    <div className="hidden overflow-x-auto md:block">
                        <table className="w-full text-sm">
                            <thead className="bg-orange-50 text-[11px] text-orange-700/80">
                                <tr>
                                    {renderSortHeader('Item', 'name')}
                                    {renderSortHeader('Stock', 'stock', 'right')}
                                    <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide">Restock level</th>
                                    {renderSortHeader('Order qty', 'orderQty', 'right')}
                                    {renderSortHeader('Est. cost', 'estCost', 'right')}
                                    <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Status</th>
                                    <th className="w-28" />
                                </tr>
                            </thead>
                            <tbody>
                                {visibleRows.map((r) => (
                                    <tr
                                        key={r.id}
                                        className={`border-t border-[#f6e1d0] transition ${r.looksWrong ? 'bg-amber-50/80' : 'hover:bg-orange-50/50'}`}
                                    >
                                        <td className="px-4 py-3">
                                            <p className="font-medium text-slate-900">{r.name}</p>
                                            <p className="text-xs text-slate-500">{[r.barcode && `ID ${r.barcode}`, r.group].filter(Boolean).join(' · ')}</p>
                                            {r.looksWrong && <p className="text-xs font-medium text-amber-700">Stock looks wrong — count it first</p>}
                                        </td>
                                        <td className={`whitespace-nowrap px-4 py-3 text-right ${r.stock < 0 ? 'font-semibold text-red-600' : 'text-slate-700'}`}>
                                            {qty(r.stock)}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">{qty(r.level)}</td>
                                        <td className="whitespace-nowrap px-4 py-3 text-right">
                                            <span className="font-semibold text-slate-900">{qty(r.orderQty)}</span>{' '}
                                            <span className="text-xs text-slate-500">{r.unit}</span>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">
                                            {r.estCost === null ? <span className="text-slate-400">—</span> : inrRound(r.estCost)}
                                        </td>
                                        <td className="px-4 py-3">{renderStatus(r)}</td>
                                        <td className="px-4 py-3 text-right">{r.looksWrong ? countStockButton(r) : null}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Mobile list */}
                {listRows.length > 0 && (
                    <ul className="md:hidden">
                        {visibleRows.map((r, idx) => (
                            <li
                                key={r.id}
                                className={`px-4 py-3 ${idx > 0 ? 'border-t border-[#f6e1d0]' : ''} ${r.looksWrong ? 'bg-amber-50/80' : ''}`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <p className="min-w-0 text-sm font-semibold text-slate-900">{r.name}</p>
                                    <p className="shrink-0 text-sm font-semibold text-slate-900">
                                        Order {qty(r.orderQty)} <span className="text-xs font-normal text-slate-500">{r.unit}</span>
                                    </p>
                                </div>
                                <div className="mt-0.5 flex items-center justify-between gap-3 text-xs text-slate-500">
                                    <span className="truncate">
                                        {r.barcode && <>ID {r.barcode} · </>}stock{' '}
                                        <span className={r.stock < 0 ? 'font-semibold text-red-600' : ''}>{qty(r.stock)}</span> · level {qty(r.level)}
                                    </span>
                                    <span className="shrink-0">{r.estCost === null ? '—' : inrRound(r.estCost)}</span>
                                </div>
                                {r.looksWrong && (
                                    <div className="mt-1.5 flex items-center justify-between gap-2">
                                        <span className="text-xs font-medium text-amber-700">Stock looks wrong — count it first</span>
                                        {countStockButton(r)}
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}

                {/* Paging */}
                {visibleRows.length < listRows.length && (
                    // The mobile list is always shown; the desktop table can be hidden.
                    <div className={`border-t border-[#f6e1d0] px-4 py-2.5 text-center ${isListVisible ? '' : 'md:hidden'}`}>
                        <button
                            onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                            className="rounded-sm border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-400"
                        >
                            Show {Math.min(PAGE_SIZE, listRows.length - visibleRows.length)} more of {qty(listRows.length)}
                        </button>
                    </div>
                )}
            </section>

            {/* ODD STOCK NOTE */}
            {summary.looksWrong.length > 0 && (
                <div className="mt-4 flex gap-2 rounded-sm border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
                    <p>
                        <strong>
                            {summary.looksWrong.slice(0, 3).map((r) => `${r.name} (${qty(r.stock)})`).join(', ')}
                            {summary.looksWrong.length > 3 && ` and ${summary.looksWrong.length - 3} more`}
                        </strong>{' '}
                        {summary.looksWrong.length === 1 ? 'was' : 'were'} sold far more than you have — probably sold without recording
                        purchases. Count {summary.looksWrong.length === 1 ? 'it' : 'them'} before ordering, or you may buy stock you don't
                        need. {summary.looksWrong.length === 1 ? "It's" : "They're"} left out of the WhatsApp order list.
                    </p>
                </div>
            )}
        </div>
    );
};

export default CatalogueRestockReport;