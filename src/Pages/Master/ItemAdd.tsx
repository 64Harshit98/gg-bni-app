import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { ItemGroup } from '../../constants/models';
import { ROUTES } from '../../constants/routes.constants';
import { CustomButton } from '../../Components';
import { Variant, State } from '../../enums';
import XLSX from 'xlsx-js-style';
import BarcodeScanner from '../../UseComponents/BarcodeScanner';
import { useAuth, useDatabase } from '../../context/auth-context';
import { Spinner } from '../../constants/Spinner';
import { Modal } from '../../constants/Modal';
import { useItemSettings } from '../../context/SettingsContext';
import { IconScanCircle } from '../../constants/Icons';
import { collection, query, where, getDocs, limit, doc, runTransaction, getDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { InfoTooltip } from '../../Components/InfoToolTip';

const UNIT_OPTIONS = [
  { value: 'pcs', label: 'Pieces (1 pcs)' },
  { value: 'box', label: 'Box(10 pcs)' },
  { value: 'pkt', label: 'Packet (Custom)' },
  { value: 'doz', label: 'Dozen (12 pcs)' },
  { value: 'qt', label: 'Quintal(100 pcs)' },
  { value: 'ton', label: 'Ton(1000 pcs)' },
];

const ItemAdd: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dbOperations = useDatabase();
  const { currentUser, loading: authLoading } = useAuth();
  const { itemSettings, loadingSettings: loadingItemSettings } = useItemSettings();

  // --- STATE ---
  const [itemName, setItemName] = useState<string>('');
  const [itemMRP, setItemMRP] = useState<string>('');
  const [itemSalesPrice, setItemSalesPrice] = useState<string>('');
  const [itemPurchasePrice, setItemPurchasePrice] = useState<string>('');
  const [itemDiscount, setItemDiscount] = useState<string>('');
  const [PurchaseDiscount, setPurchaseDiscount] = useState<string>('');
  const [itemTax, setItemTax] = useState<string>('');
  const [itemAmount, setItemAmount] = useState<string>('');
  const [restockQuantity, setRestockQuantity] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [itemBarcode, setItemBarcode] = useState<string>('');
  const [hsnCode, setHsnCode] = useState<string>('');
  const [itemUnit, setItemUnit] = useState<string>('');
  const [packetSize, setPacketSize] = useState<string>('');
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [pageIsLoading, setPageIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);

  // --- UPLOAD STATE ---
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPageIsLoading(authLoading || loadingItemSettings || !dbOperations);
  }, [authLoading, loadingItemSettings, dbOperations]);

  const isActive = (path: string) => location.pathname === path;

  // --- 1. Fetch Categories ---
  const fetchGroups = async () => {
    if (!dbOperations) return;
    try {
      setLoading(true);
      const groups = await dbOperations.getItemGroups();
      setItemGroups(groups);

      if (groups.length === 0) {
        setSelectedCategory('');
      }
    } catch (err) {
      console.error('Failed to fetch item groups:', err);
      setError('Failed to load item categories.');
    } finally {
      setLoading(false);
    }
  };

  // --- 2. Fetch Suggested Barcode (Peek Logic) ---
  const fetchNextBarcode = async () => {
    if (!currentUser?.companyId || !itemSettings?.autoGenerateBarcode) {
      setItemBarcode('');
      return;
    }
    try {
      const counterRef = doc(db, 'companies', currentUser.companyId, 'counters', 'items');
      const snap = await getDoc(counterRef);
      let nextSeq = 1001;
      if (snap.exists()) {
        nextSeq = (snap.data().currentSequence || 1000) + 1;
      }
      setItemBarcode(String(nextSeq));
    } catch (e) {
      console.error("Failed to fetch next barcode", e);
    }
  };

  useEffect(() => {
    if (dbOperations && currentUser && itemSettings) {
      fetchGroups();
      fetchNextBarcode();
    }
  }, [dbOperations, currentUser, itemSettings]);

  const resetForm = () => {
    setItemName('');
    setItemMRP('');
    setItemSalesPrice('');
    setItemPurchasePrice('');
    setItemDiscount('');
    setPurchaseDiscount('');
    setItemTax('');
    setItemAmount('');
    fetchNextBarcode();
    setRestockQuantity('');
    setHsnCode('');
    setItemUnit('');
    setPacketSize('');
    setSelectedCategory(itemGroups.length > 0 ? itemGroups[0].id! : '');
  };

  // --- HELPER: Transactional Sequence for Bulk Uploads ---
  const reserveSequenceBlock = async (count: number): Promise<number> => {
    if (!currentUser?.companyId) throw new Error("No Company ID");
    const counterRef = doc(db, 'companies', currentUser.companyId, 'counters', 'items');
    try {
      return await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let lastSeq = 1000;
        if (counterDoc.exists()) {
          lastSeq = counterDoc.data().currentSequence || 1000;
        }
        const nextSeq = lastSeq + count;
        transaction.set(counterRef, { currentSequence: nextSeq }, { merge: true });
        return lastSeq + 1;
      });
    } catch (e) {
      return Date.now();
    }
  };

  const handleAddItem = async () => {
    if (!dbOperations || !currentUser || !itemSettings) {
      setModal({ message: 'App not ready.', type: State.ERROR }); return;
    }
    setError(null); setSuccess(null); setModal(null);

    // --- 1. Strictly Required Field Validation ---
    if (!itemName.trim() || !itemBarcode.trim()) {
      setModal({ message: 'Item Name, and Barcode are strictly required.', type: State.ERROR }); return;
    }

    const mrpValue = parseFloat(itemMRP) || 0;
    const saleValue = parseFloat(itemSalesPrice) || 0;
    const purchaseValue = parseFloat(itemPurchasePrice) || 0;

    if (mrpValue === 0 && saleValue === 0) {
      setModal({ message: 'Please enter either MRP or Sales Price.', type: State.ERROR }); return;
    }

    // --- 2. Dynamic Optional Settings Validation ---
    if (itemSettings.requirePurchasePrice && !itemPurchasePrice.trim()) {
      setModal({ message: 'Purchase Price is required as per your settings.', type: State.ERROR }); return;
    }
    if (itemSettings.requireDiscount && !itemDiscount.trim() && !PurchaseDiscount.trim()) {
      setModal({ message: 'Discount is required as per your settings.', type: State.ERROR }); return;
    }
    if (itemSettings.requireTax && !itemTax.trim()) {
      setModal({ message: 'Tax is required as per your settings.', type: State.ERROR }); return;
    }
    if (itemSettings.requireRestockQuantity && !restockQuantity.trim()) {
      setModal({ message: 'Restock Level is required as per your settings.', type: State.ERROR }); return;
    }
    if (itemUnit === 'pkt' && (!packetSize.trim() || parseInt(packetSize, 10) <= 0)) {
      setModal({ message: 'Please enter a valid quantity for the Packet.', type: State.ERROR }); return;
    }
    if ((itemSettings as any).requireUnit && !itemUnit.trim()) {
      setModal({ message: 'Unit is required as per your settings.', type: State.ERROR }); return;
    }
    if ((itemSettings as any).requireCategory && !selectedCategory) {
      setModal({ message: 'Category is required as per your settings.', type: State.ERROR }); return;
    }
    if ((itemSettings as any).requireStock && !itemAmount.trim()) {
      setModal({ message: 'Stock is required as per your settings.', type: State.ERROR }); return;
    }

    // --- 3. Discount Logic ---
    let finalSaleDiscount = parseFloat(itemDiscount) || 0;
    if (mrpValue > 0 && saleValue > 0) {
      finalSaleDiscount = 0;
    }

    let finalPurchaseDiscount = parseFloat(PurchaseDiscount) || 0;
    if (mrpValue > 0 && purchaseValue > 0) {
      finalPurchaseDiscount = 0;
    }

    const finalBarcode = itemBarcode.trim();

    setIsSaving(true);
    try {
      // Check for Duplicate Barcode
      const itemsRef = collection(db, 'companies', currentUser.companyId, 'items');
      const q = query(itemsRef, where('barcode', '==', finalBarcode), limit(1));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        setModal({ message: `Barcode ${finalBarcode} already exists.`, type: State.ERROR });
        setIsSaving(false);
        return;
      }
      let currentMultiplier = 1;
      if (itemUnit === 'box') currentMultiplier = 10;
      if (itemUnit === 'doz') currentMultiplier = 12;
      if (itemUnit === 'qt') currentMultiplier = 100;
      if (itemUnit === 'ton') currentMultiplier = 1000;
      if (itemUnit === 'pkt') currentMultiplier = parseInt(packetSize, 10) || 1;

      const customDocId = finalBarcode;
      const newItemData: any = {
        name: itemName.trim(),
        mrp: mrpValue,
        salesPrice: saleValue,
        purchasePrice: purchaseValue,
        discount: finalSaleDiscount,
        purchasediscount: finalPurchaseDiscount,
        tax: parseFloat(itemTax) || 0,
        hsnSac: hsnCode.trim(),
        itemGroupId: selectedCategory,
        stock: parseInt(itemAmount, 10) || 0,
        amount: parseInt(itemAmount, 10) || 0,
        barcode: finalBarcode,
        restockQuantity: parseInt(restockQuantity, 10) || 0,
        unit: itemUnit.trim(),
        unitMultiplier: currentMultiplier,
        packetSize: itemUnit === 'pkt' ? parseInt(packetSize, 10) : null,
      };

      await dbOperations.createItem(newItemData, customDocId);

      // Update Counter if numeric
      const barcodeNum = parseInt(finalBarcode, 10);
      if (!isNaN(barcodeNum)) {
        const counterRef = doc(db, 'companies', currentUser.companyId, 'counters', 'items');
        await runTransaction(db, async (transaction) => {
          const counterDoc = await transaction.get(counterRef);
          const currentDBSeq = counterDoc.exists() ? (counterDoc.data().currentSequence || 1000) : 1000;
          if (barcodeNum > currentDBSeq) {
            transaction.set(counterRef, { currentSequence: barcodeNum }, { merge: true });
          }
        });
      }

      setSuccess(`Item "${itemName}" added!`);
      resetForm();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError('Failed to add item.');
      setModal({ message: err.message, type: State.ERROR });
    } finally {
      setIsSaving(false);
    }
  };

  // --- BULK UPLOAD ---
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !dbOperations || !currentUser || !itemSettings || !currentUser.companyId) return;

    setIsUploading(true);
    setUploadProgress(null);
    setError(null); setSuccess(null); setModal(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, {
          defval: null,
          range: 9
        });
console.log('Raw headers (first row):', Object.keys(rawJson[0]));
console.log('First data row:', rawJson[1]);
        // Skip the notes/hints row (row index 0 after range:9 = your notes row)
        const dataJson = rawJson.slice(1); // skip first row which is the notes row

        if (dataJson.length === 0) throw new Error("File empty.");

        let processedCount = 0;
        let createdCount = 0;
        let updatedCount = 0;
        let failedCount = 0;

        const totalItems = dataJson.length;
        setUploadProgress({ current: 0, total: totalItems });

        // --- PREP CATEGORIES ---
        let currentGroups = await dbOperations.getItemGroups();
        const groupMap = new Map<string, string>();
        currentGroups.forEach(g => groupMap.set(g.name.toLowerCase().trim(), g.id!));

        // --- PREP SEQUENTIAL BARCODES ---
        const itemsNeedingBarcode = dataJson.filter((row: any) => !row.barcode && !row.Barcode).length;
        let nextSeqNumber = 0;

        if (itemsNeedingBarcode > 0) {
          nextSeqNumber = await reserveSequenceBlock(itemsNeedingBarcode);
        }

        for (let i = 0; i < dataJson.length; i++) {
          await new Promise(resolve => setTimeout(resolve, 0));
          setUploadProgress({ current: i + 1, total: totalItems });

          const rawRow = dataJson[i];
          const row: any = {};

          Object.keys(rawRow).forEach(k => {
            const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, "");
            row[cleanKey] = rawRow[k];
          });

          const rawCat = row.itemgroupid || row.itemgroup || row.category || row.group || row.categoryname;
          let targetGroupId = "";

          if (rawCat) {
            const csvCategoryValue = String(rawCat).trim();
            const categoryLower = csvCategoryValue.toLowerCase();

            if (groupMap.has(categoryLower)) {
              targetGroupId = groupMap.get(categoryLower)!;
            } else {
              try {
                const newGroupData: any = {
                  name: csvCategoryValue,
                  description: 'Auto-created via Bulk Import'
                };
                const newGroupId = await dbOperations.createItemGroup(newGroupData);
                if (newGroupId && typeof newGroupId === 'string') {
                  groupMap.set(categoryLower, newGroupId);
                  targetGroupId = newGroupId;
                }
              } catch (grpErr) {
                console.warn("Failed to create group via bulk import.");
              }
            }
          }

          // --- BULK VALIDATION LOGIC ---
          if (!row.itemname) {
            failedCount++;
            continue;
          }

          const rowMRP = parseFloat(String(row.mrp ?? row.MRP ?? 0));
          const rowSale = parseFloat(String(row.salesprice ?? row.sellingprice ?? 0));
          const rowPurchase = parseFloat(String(row.purchaseprice ?? row.purchasePrice ?? row.PurchasePrice ?? 0));

          if (rowMRP === 0 && rowSale === 0) {
            failedCount++;
            continue;
          }

          let rowSaleDiscount = parseFloat(String(row.salediscount ?? row.salediscount ?? row.salesdiscount ?? row.saledisc ?? 0));
          if (rowMRP > 0 && rowSale > 0) {
            rowSaleDiscount = 0;
          }

          let rowPurchaseDiscount = parseFloat(String(row.purchasediscount ?? 0));
          if (rowMRP > 0 && rowPurchase > 0) {
            rowPurchaseDiscount = 0;
          }

          try {
            const stockVal = parseInt(String(row.stock ?? row.amount ?? row.qty ?? row.quantity ?? 0), 10);

            let rowBarcode = String(row.barcode || '').trim();
            const rowHsn = String(row.hsn || row.hsncode || row.sac || row.hsnsac || '').trim();
            const rowUnitStr = String(row.unit || row.uom || '').trim();

            if (!rowBarcode) {
              rowBarcode = String(nextSeqNumber);
              nextSeqNumber++;
            }

            const itemData: any = {
              name: String(row.itemname).trim(),
              mrp: rowMRP,
              salesPrice: rowSale,
              purchasePrice: rowPurchase,
              discount: rowSaleDiscount,
              purchasediscount: rowPurchaseDiscount,
              tax: parseFloat(String(row.tax ?? 0)),
              hsnSac: rowHsn,
              itemGroupId: targetGroupId,
              stock: stockVal,
              amount: stockVal,
              barcode: rowBarcode,
              restockQuantity: parseInt(String(row.restockquantity ?? 0), 10),
              taxRate: parseFloat(String(row.tax ?? 0)),
              unit: rowUnitStr,
            };

            let isUpdate = false;
            const itemsRef = collection(db, 'companies', currentUser.companyId, 'items');
            const q = query(itemsRef, where('barcode', '==', rowBarcode), limit(1));
            const snapshot = await getDocs(q);
            if (!snapshot.empty) isUpdate = true;

            await dbOperations.createItem(itemData, rowBarcode);

            if (isUpdate) updatedCount++;
            else createdCount++;

            processedCount++;
          } catch (e: any) {
            failedCount++;
          }
        }

        await fetchGroups();

        if (failedCount > 0) {
          setModal({
            message: `Error in ${failedCount} entries. Please check for missing required fields (Item Name, Sale Price, MRP, Stock, Barcode) or invalid data.`,
            type: State.ERROR
          });
        } else {
          setSuccess(`Imported: ${createdCount} New, ${updatedCount} Updated.`);
        }

        setTimeout(() => setSuccess(null), 5000);

      } catch (err: any) {
        console.error(err);
        setError("File processing failed.");
      } finally {
        setIsUploading(false);
        setUploadProgress(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleBarcodeScanned = (barcode: string) => {
    setItemBarcode(barcode);
    setIsScannerOpen(false);
  };

  const handleDownloadSample = () => {

    // ── Style helpers ─────────────────────────────────────────────────────────
    const s = (font: any, fill?: any, alignment?: any, border?: any) => ({
      font: { name: 'Arial', ...font },
      fill: fill ?? {},
      alignment: alignment ?? { horizontal: 'center', vertical: 'center', wrapText: true },
      border: border ?? {},
    });

    const solidFill = (rgb: string) => ({ patternType: 'solid', fgColor: { rgb } });

    const thinBorder = (sides: ('top' | 'bottom' | 'left' | 'right')[]) => {
      const b: any = {};
      sides.forEach(side => { b[side] = { style: 'thin', color: { rgb: 'CBD5E1' } }; });
      return b;
    };

    const allBorders = thinBorder(['top', 'bottom', 'left', 'right']);
    const bblr = thinBorder(['bottom', 'left', 'right']);

    // ── Column definitions ────────────────────────────────────────────────────
    // type: R=Required  O=Optional  A=Auto-generated  L=Lookup
    const COLS = [
      { header: '★ Item Name', note: 'Full product name  e.g. Amul Butter 500g', type: 'R', width: 24, field: 'name' },
      { header: '◆ Barcode', note: 'Leave blank → auto-generated', type: 'A', width: 16, field: 'barcode' },
      { header: '● MRP', note: 'Max Retail Price (₹)  Required if Sale Price blank', type: 'O', width: 13, field: 'mrp' },
      { header: '★ Sales Price', note: 'Selling price (₹)  Required if MRP blank', type: 'R', width: 14, field: 'salesPrice' },
      { header: '● Purchase Price', note: 'Your cost price (₹)', type: 'O', width: 17, field: 'purchasePrice' },
      { header: '● Sale Disc (%)', note: 'Default customer discount  e.g. 5', type: 'O', width: 14, field: 'Sale Discount' },
      { header: '● Purchase Disc (%)', note: 'Supplier discount  e.g. 3', type: 'O', width: 16, field: 'purchasediscount' },
      { header: '● Tax (%)', note: 'GST/VAT rate  e.g. 18', type: 'O', width: 10, field: 'tax' },
      { header: '● HSN Code', note: '6-digit HSN / SAC code', type: 'O', width: 13, field: 'hsnCode' },
      { header: '▲ Category', note: 'Group name – new category auto-created', type: 'L', width: 18, field: 'itemGroupId' },
      { header: '● Stock', note: 'Opening stock quantity', type: 'O', width: 10, field: 'stock' },
      { header: '● Restock Level', note: 'Alert when stock falls below this', type: 'O', width: 15, field: 'restockQuantity' },
    ];

    // type → { bg, textRgb }
    const TYPE_STYLE: Record<string, { bg: string; txt: string }> = {
      R: { bg: 'FEE2E2', txt: 'DC2626' },   // red  – required
      O: { bg: 'DCFCE7', txt: '15803D' },   // green – optional
      A: { bg: 'FEFCE8', txt: '92400E' },   // yellow – auto
      L: { bg: 'E0F2FE', txt: '0369A1' },   // sky – lookup
    };

    // ── Build worksheet data (row arrays) ────────────────────────────────────
    // We'll use aoa_to_sheet and then apply cell styles manually.

    const colCount = COLS.length;

    // Row layout (0-based):
    // R0 = branding banner  R1 = subtitle  R2 = spacer
    // R3 = LEGEND title     R4-R7 = legend items  R8 = spacer
    // R9 = column headers   R10 = hint notes
    // R11-R12 = sample data

    const legendRows = [
      { bg: 'FEE2E2', txt: 'DC2626', marker: '★  Required', desc: 'Must be filled in – item will be skipped if missing' },
      { bg: 'DCFCE7', txt: '15803D', marker: '●  Optional', desc: 'Improves data quality; leave blank if not applicable' },
      { bg: 'FEFCE8', txt: '92400E', marker: '◆  Auto-fill', desc: 'Leave blank → Sellar generates a sequential barcode' },
      { bg: 'E0F2FE', txt: '0369A1', marker: '▲  Lookup', desc: 'Accepts text name; new categories created automatically' },
    ];

    // Barcode col (index 1):
    //   Row 1 → blank string → Sellar assigns next sequential number (e.g. 1001)
    //   Row 2 → explicit '1002' → user-supplied barcode
    const sampleRows = [
      ['Amul Butter 500g', '', 250, 240, 190, 0, 2, 5, '0402', 'Dairy', 50, 10],
      ['Parle-G Biscuit', '1002', 10, 10, 7, 0, 0, 0, '', 'Snacks', 200, 20],
    ];

    // Build AOA (array of arrays) – just enough rows
    const totalRows = 13;
    const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

    // R0: branding
    aoa[0][0] = 'SELLAR  ·  Bulk Item Import Template';

    // R1: subtitle
    aoa[1][0] = 'Fill in the rows below and upload this file in Sellar → Items → Bulk Import.  Do NOT rename column headers.';

    // R2: blank

    // R3: legend title
    aoa[3][0] = 'LEGEND';

    // R4-R7: legend marker column A, description column B
    legendRows.forEach((l, i) => {
      aoa[4 + i][0] = l.marker;
      aoa[4 + i][1] = l.desc;
    });

    // R8: blank

    // R9: column headers
    COLS.forEach((c, i) => { aoa[9][i] = c.header; });

    // R10: notes
    COLS.forEach((c, i) => { aoa[10][i] = c.note; });

    // R11-R12: sample data
    sampleRows.forEach((row, ri) => {
      row.forEach((val, ci) => { aoa[11 + ri][ci] = val; });
    });

    // ── Create worksheet ──────────────────────────────────────────────────────
    const ws: any = XLSX.utils.aoa_to_sheet(aoa);

    // Set column widths
    ws['!cols'] = COLS.map(c => ({ wch: c.width }));

    // Set row heights (in points, xlsx-js-style uses hpt)
    ws['!rows'] = [
      { hpt: 34 },  // R0 banner
      { hpt: 24 },  // R1 subtitle
      { hpt: 8 },  // R2 spacer
      { hpt: 20 },  // R3 legend title
      { hpt: 18 },  // R4
      { hpt: 18 },  // R5
      { hpt: 18 },  // R6
      { hpt: 18 },  // R7
      { hpt: 8 },  // R8 spacer
      { hpt: 30 },  // R9 headers
      { hpt: 22 },  // R10 notes
      { hpt: 18 },  // R11 sample1
      { hpt: 18 },  // R12 sample2
    ];

    // ── Merges ────────────────────────────────────────────────────────────────
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },  // R0  banner
      { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },  // R1  subtitle
      { s: { r: 3, c: 0 }, e: { r: 3, c: colCount - 1 } },  // R3  LEGEND title
      // Legend rows: col A = label (1 col), col B-D = description (merge 3 cols)
      ...legendRows.map((_, i) => ({
        s: { r: 4 + i, c: 1 }, e: { r: 4 + i, c: 3 }
      })),
    ];

    // ── Helper: apply style to a cell address ────────────────────────────────
    const style = (addr: string, st: any) => {
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      ws[addr].s = st;
    };

    // ── R0  Banner ────────────────────────────────────────────────────────────
    style('A1', s(
      { sz: 15, bold: true, color: { rgb: 'FFFFFF' } },
      solidFill('0369A1'),
      { horizontal: 'center', vertical: 'center' }
    ));

    // ── R1  Subtitle ──────────────────────────────────────────────────────────
    style('A2', s(
      { sz: 9, italic: true, color: { rgb: '475569' } },
      solidFill('DBEAFE'),
      { horizontal: 'center', vertical: 'center', wrapText: true }
    ));

    // ── R3  Legend title ──────────────────────────────────────────────────────
    style('A4', s(
      { sz: 10, bold: true, color: { rgb: '0369A1' } },
      solidFill('E0F2FE'),
      { horizontal: 'left', vertical: 'center' },
      allBorders
    ));

    // ── R4-R7  Legend rows ────────────────────────────────────────────────────
    legendRows.forEach((l, i) => {
      const row = 5 + i;   // excel row (1-based)
      style(`A${row}`, s(
        { sz: 9, bold: true, color: { rgb: l.txt } },
        solidFill(l.bg),
        { horizontal: 'left', vertical: 'center' },
        bblr
      ));
      style(`B${row}`, s(
        { sz: 9, color: { rgb: '334155' } },
        solidFill(l.bg),
        { horizontal: 'left', vertical: 'center' },
        bblr
      ));
      // Fill merged cells C-D same bg
      ['C', 'D'].forEach(col => {
        const addr = `${col}${row}`;
        if (!ws[addr]) ws[addr] = { t: 's', v: '' };
        ws[addr].s = s({ sz: 9 }, solidFill(l.bg), {}, bblr);
      });
    });

    // ── R9  Column headers ────────────────────────────────────────────────────
    COLS.forEach((c, i) => {
      const { bg, txt } = TYPE_STYLE[c.type];
      const addr = XLSX.utils.encode_cell({ r: 9, c: i });
      style(addr, s(
        { sz: 9, bold: true, color: { rgb: txt } },
        solidFill(bg),
        { horizontal: 'center', vertical: 'center', wrapText: true },
        allBorders
      ));
    });

    // ── R10  Notes row ────────────────────────────────────────────────────────
    COLS.forEach((_c, i) => {
      const addr = XLSX.utils.encode_cell({ r: 10, c: i });
      style(addr, s(
        { sz: 7, italic: true, color: { rgb: '64748B' } },
        solidFill('F8FAFC'),
        { horizontal: 'center', vertical: 'center', wrapText: true },
        bblr
      ));
    });

    // ── R11-R12  Sample data rows ─────────────────────────────────────────────
    // Barcode cell in row 1 is intentionally empty – show a placeholder hint via cell value
    const BARCODE_COL = 1;
    sampleRows.forEach((row, ri) => {
      const altBg = ri % 2 === 1 ? 'F1F5F9' : 'FFFFFF';
      // For row 0 barcode cell: inject a visual hint that won't break import
      if (ri === 0) {
        const bAddr = XLSX.utils.encode_cell({ r: 11, c: BARCODE_COL });
        ws[bAddr] = { t: 's', v: '' };
        ws[bAddr].s = s(
          { sz: 8, italic: true, color: { rgb: '94A3B8' } },
          solidFill(altBg),
          { horizontal: 'center', vertical: 'center' },
          bblr
        );
      }
      row.forEach((_val, ci) => {
        const addr = XLSX.utils.encode_cell({ r: 11 + ri, c: ci });
        style(addr, s(
          { sz: 9, color: { rgb: '1E293B' } },
          solidFill(altBg),
          { horizontal: 'center', vertical: 'center' },
          bblr
        ));
      });
    });

    // ── Write workbook ────────────────────────────────────────────────────────
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Items');
    XLSX.writeFile(wb, 'Sellar_Items_Import_Template.xlsx');
  };

  const reqClasses = " after:content-['*'] after:ml-0.5 after:text-red-500";
  if (pageIsLoading) return <Spinner />;

  const renderHeader = () => (
    <div className="fixed top-0 left-0 right-0 z-10 p-4 bg-gray-100 border-b border-gray-300 flex flex-col md:static md:flex-row md:justify-between md:items-center md:p-3 md:bg-white md:shadow-sm">
      <h1 className="text-2xl font-bold text-gray-800 text-center mb-4 md:mb-0 md:text-left">
        Add Item
      </h1>
      <div className="flex items-center justify-center gap-6">
        <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.ITEM_ADD)} active={isActive(ROUTES.ITEM_ADD)}>Item Add</CustomButton>
        <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.ITEM_GROUP)} active={isActive(ROUTES.ITEM_GROUP)}>Item Groups</CustomButton>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen w-full bg-gray-100 font-poppins text-gray-800 relative">
      <BarcodeScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleBarcodeScanned} />
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

      {/* --- PROGRESS MODAL --- */}
      {uploadProgress && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-8 rounded-sm shadow-xl w-80 text-center">
            <h3 className="text-lg font-bold mb-4 text-gray-800">Uploading Items...</h3>
            <div className="w-full bg-gray-200 rounded-sm h-4 mb-2 overflow-hidden">
              <div
                className="bg-sky-500 h-4 rounded-sm transition-all duration-100"
                style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
              ></div>
            </div>
            <p className="text-sm text-gray-600 font-mono">
              {uploadProgress.current} / {uploadProgress.total} processed
            </p>
            <p className="text-xs text-gray-400 mt-2">Please do not close this window.</p>
          </div>
        </div>
      )}

      {renderHeader()}

      <div className="flex-1 flex flex-col md:flex-row relative">

        {/* LEFT PANEL */}
        <div className="flex-1 w-full md:w-[65%] bg-gray-100 md:bg-gray-50 md:border-r border-gray-200 pt-28 pb-24 px-2 md:pt-6 md:px-6 md:pb-6 overflow-y-auto">

          {error && <div className="mb-4 text-center p-3 bg-red-100 text-red-700 rounded-sm">{error}</div>}
          {success && <div className="mb-4 text-center p-3 bg-green-100 text-green-700 rounded-sm">{success}</div>}

          {/* MOBILE BULK IMPORT */}
          <div className="md:hidden bg-white p-2 rounded-sm shadow-md mb-4">
            <div className="flex flex-col items-center justify-center mb-4">
              <h2 className="text-lg font-semibold text-gray-700 mb-2">Bulk Import</h2>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".xlsx, .xls, .csv" />
              <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="w-full max-w-xs bg-sky-500 text-white py-2 px-4 rounded-sm hover:bg-sky-600 disabled:bg-gray-400 flex items-center justify-center gap-2">
                {isUploading ? <Spinner /> : 'Import from Excel'}
              </button>
              <button type="button" onClick={handleDownloadSample} disabled={isUploading} className="w-full max-w-xs bg-white text-sky-500 border border-sky-500 py-2 px-4 rounded-sm mt-4 hover:bg-sky-50">
                Download Sample
              </button>
            </div>
          </div>

          {/* SINGLE ITEM FORM */}
          <div className="bg-white p-4 rounded-sm shadow-md md:mb-0 md:rounded-sm md:shadow-sm md:border md:border-gray-200 mb-10">
            <h2 className="text-lg font-bold text-gray-800 mb-4 md:mb-6 md:border-b md:pb-2">Add a Single Item</h2>
            <div className="space-y-4">

              <div>
                <div className="flex items-center mb-1">
                  <label className="text-sm font-medium text-gray-600 after:content-['*'] after:ml-0.5 after:text-red-500 mr-2">Item Name</label>
                  <InfoTooltip text="The name of the product being added." />
                </div>
                <input type="text" value={itemName} onChange={(e) => setItemName(e.target.value)} className="w-full p-3 border border-gray-300 rounded-sm focus:ring-sky-500 outline-none" placeholder="e.g. Apple" />
              </div>

              <div>
                <div className="flex items-center mb-1">
                  <label className="text-sm font-medium text-gray-600 after:content-['*'] after:ml-0.5 after:text-red-500 mr-2">
                    Barcode
                  </label>
                  <InfoTooltip text="Unique identifier for scanning the product." />
                </div>
                <div className="flex gap-2">
                  <input type="text" value={itemBarcode} onChange={(e) => setItemBarcode(e.target.value)} className="flex-grow p-3 border border-gray-300 rounded-sm focus:ring-sky-500 outline-none" placeholder="Scan or Type" />
                  <button type="button" onClick={() => setIsScannerOpen(true)} className="bg-gray-700 text-white p-3 rounded-sm"><IconScanCircle width={20} height={20} /></button>
                </div>
                <p className="text-xs text-gray-400 mt-1">This is the next available number. You can change it if needed.</p>
              </div>

              <div className='grid grid-cols-2 gap-2'>
                <div>
                  <div className="flex items-center mb-1">
                    <label className="text-sm font-medium text-gray-600  mr-2">MRP</label>
                    <InfoTooltip text="Maximum Retail Price printed on the product." />
                  </div>
                  <input type="number" value={itemMRP} onChange={(e) => setItemMRP(e.target.value)} className="w-full p-3 border border-gray-300 rounded-sm focus:ring-sky-500" placeholder="0.00" />
                  <p className="text-[10px] text-gray-400">Required if Sale Price is empty</p>
                </div>
                <div>
                  <div className="flex items-center mb-1">
                    <label className={`text-sm font-medium text-gray-600 ${(itemSettings as any)?.requireCategory ? reqClasses : ''} mr-2`}>
                      Category
                    </label>
                    <InfoTooltip text="Group this item belongs to (e.g., Electronics)." />
                  </div>
                  <select
                    value={selectedCategory}
                    onChange={(e) => {
                      if (e.target.value === 'ADD_NEW_GROUP') {
                        navigate(ROUTES.ITEM_GROUP);
                      } else {
                        setSelectedCategory(e.target.value);
                      }
                    }}
                    className="w-full p-3 border border-gray-300 rounded-sm bg-white focus:ring-sky-500"
                  >
                    <option value="">Uncategorized</option>

                    {/* MOVED TO TOP */}
                    <option value="ADD_NEW_GROUP" className="font-semibold border border-grey-300 bg-gray-100 hover:bg-gray-200">
                      + Add New Group
                    </option>

                    {itemGroups.map(g => <option key={g.id} value={g.id!}>{g.name}</option>)}
                  </select>
                </div>
                <div>
                  <div className="flex items-center mb-1">
                    <label className="text-sm font-medium text-gray-600 after:content-['*'] after:text-red-500 mr-2">Sales Price</label>
                    <InfoTooltip text="The price you are selling this item for." />
                  </div>
                  <input type="number" value={itemSalesPrice} onChange={(e) => setItemSalesPrice(e.target.value)} className="w-full p-3 border border-gray-300 rounded-sm focus:ring-sky-500" placeholder="0.00" />
                  <p className="text-[10px] text-gray-400">Required if MRP is empty</p>
                </div>

                <div>
                  <div className="flex items-center mb-1">
                    <label className={`text-sm font-medium text-gray-600 ${itemSettings?.requirePurchasePrice ? reqClasses : ''} mr-2`}>
                      Purchase Price
                    </label>
                    <InfoTooltip text="The price you paid to acquire this item." />
                  </div>
                  <input type="number" value={itemPurchasePrice} onChange={(e) => setItemPurchasePrice(e.target.value)} className="w-full p-3 border border-gray-300 rounded-sm focus:ring-sky-500" placeholder="0.00" />
                </div>
                <div>
                  <div className="flex items-center mb-1">
                    <label className={`text-sm font-medium text-gray-600 ${itemSettings?.requireDiscount ? reqClasses : ''} mr-2`}>
                      Sale Disc (%)
                    </label>
                    <InfoTooltip text="Default discount percentage given to customers." />
                  </div>
                  <input type="number" value={itemDiscount} onChange={(e) => setItemDiscount(e.target.value)} className="w-full p-3 border border-gray-300 rounded-sm focus:ring-sky-500" placeholder="0" />
                </div>
                <div>
                  <div className="flex items-center mb-1">
                    <label className="text-sm font-medium text-gray-600 mr-2">Purchase Disc (%)</label>
                    <InfoTooltip text="Discount percentage received from the supplier." />
                  </div>
                  <input type="number" value={PurchaseDiscount} onChange={(e) => setPurchaseDiscount(e.target.value)} className="w-full p-3 border border-gray-300 rounded-sm focus:ring-sky-500" placeholder="0" />
                </div>

                <div>
                  <div className="flex items-center mb-1">
                    <label className={`text-sm font-medium text-gray-600 ${itemSettings?.requireTax ? reqClasses : ''} mr-2`}>
                      Tax (%)
                    </label>
                    <InfoTooltip text="Applicable tax percentage for this item." />
                  </div>
                  <input type="number" value={itemTax} onChange={(e) => setItemTax(e.target.value)} className="w-full p-3 border border-gray-300 rounded-sm focus:ring-sky-500" placeholder="0" />
                </div>

                <div>
                  <div className="flex items-center mb-1">
                    <label className="text-sm font-medium text-gray-600 mr-2">HSN Code</label>
                    <InfoTooltip text="Harmonized System Nomenclature code for taxation." />
                  </div>
                  <input type="text" value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} className="w-full p-3 border border-gray-300 rounded-sm focus:ring-sky-500" placeholder="e.g. 123456" />
                </div>
                <div>
                  <div className="flex items-center mb-1">
                    {/* Make the required asterisk dynamic based on the new setting */}
                    <label className={`text-sm font-medium text-gray-600 ${(itemSettings as any)?.requireStock ? reqClasses : ''} mr-2`}>
                      Stock
                    </label>
                    <InfoTooltip text="Current available quantity in your inventory." />
                  </div>
                  <input type="number" value={itemAmount} onChange={(e) => setItemAmount(e.target.value)} className="w-full p-3 border border-gray-300 rounded-sm focus:ring-sky-500" placeholder="0" />
                </div>

                <div>
                  <div className="flex items-center mb-1">
                    <label className={`text-sm font-medium text-gray-600 ${itemSettings?.requireRestockQuantity ? reqClasses : ''} mr-2`}>
                      Restock Level
                    </label>
                    <InfoTooltip text="Minimum stock level to trigger a reorder alert." />
                  </div>
                  <input type="number" value={restockQuantity} onChange={(e) => setRestockQuantity(e.target.value)} className="w-full p-3 border border-gray-300 rounded-sm focus:ring-sky-500" placeholder="0" />
                </div>
              </div>
              <div>
                <div className="mb-1">
                  <div className="flex items-center">
                    <label className={`text-sm font-medium text-gray-600 ${(itemSettings as any)?.requireUnit ? reqClasses : ''} mr-2`}>
                      Unit
                    </label>
                    <InfoTooltip text="Measurement unit (e.g., pieces, box, kg)." />
                  </div>
                  <p className='text-[10px] text-gray-500 mt-0.5'>(Number of items to be added per single stock unit. E.g. 1 for pcs, 10 for box, etc.)</p>
                </div>
                <div className="flex gap-2">
                  <select
                    value={itemUnit}
                    onChange={(e) => {
                      setItemUnit(e.target.value);
                      if (e.target.value !== 'pkt') setPacketSize('');
                    }}
                    className={`p-3 border border-gray-300 rounded-sm bg-white focus:ring-sky-500 ${itemUnit === 'pkt' ? 'w-1/2' : 'w-full'}`}
                  >
                    {UNIT_OPTIONS.map(unit => (
                      <option key={unit.value} value={unit.value} disabled={unit.value === ''}>
                        {unit.label}
                      </option>
                    ))}
                  </select>

                  {itemUnit === 'pkt' && (
                    <input
                      type="number"
                      value={packetSize}
                      onChange={(e) => setPacketSize(e.target.value)}
                      className="w-1/2 p-3 border border-gray-300 rounded-sm focus:ring-sky-500"
                      placeholder="Qty per pkt"
                      min="1"
                    />
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
        <div className="hidden md:flex w-[35%] flex-col bg-white h-full relative border-l border-gray-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10">
          <div className="flex-1 p-6 flex flex-col">

            <div className="bg-sky-50 rounded-sm p-5 border border-sky-100">
              <h2 className="text-lg font-bold text-sky-800 mb-2">Bulk Import</h2>
              <p className="text-sm text-sky-600 mb-4">
                Upload Excel/CSV. Missing categories created automatically.
              </p>
              <div className="flex flex-col gap-3">
                <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="w-full bg-white text-sky-600 border border-sky-200 py-3 px-4 rounded-sm font-semibold hover:bg-sky-50 disabled:bg-gray-100 flex items-center justify-center gap-2 transition-colors">
                  {isUploading ? <Spinner /> : 'Upload Excel File'}
                </button>
                <button type="button" onClick={handleDownloadSample} disabled={isUploading} className="text-sm text-sky-500 hover:text-sky-700 underline text-center">
                  Download Sample Template
                </button>
              </div>
            </div>

            <div className="flex-grow"></div>

            <div className=" border-t border-gray-100 pb-10">
              <button onClick={handleAddItem} disabled={isSaving || pageIsLoading || (loading && itemGroups.length === 0)} className="w-full bg-sky-600 text-white py-4 px-6 rounded-sm text-lg font-bold hover:bg-sky-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-sky-200 transition-all active:scale-[0.98]">
                {isSaving ? <Spinner /> : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
        {/* --- MOBILE FIXED FOOTER --- */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-transparent flex justify-center pb-18">
          <button onClick={handleAddItem} disabled={isSaving || pageIsLoading || (loading && itemGroups.length === 0)} className="w-48 max-w-sm bg-sky-500 text-white py-3 px-6 rounded-sm text-lg font-semibold hover:bg-sky-600 disabled:bg-gray-400 flex items-center justify-center gap-2 shadow-md">
            {isSaving ? <Spinner /> : 'Add Item'}
          </button>
        </div>

      </div>
    </div>
  );
};

export default ItemAdd;