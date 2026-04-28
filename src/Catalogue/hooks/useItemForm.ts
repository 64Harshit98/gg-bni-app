import { useState, useEffect, useRef } from 'react';
import type { ItemGroup } from '../../constants/models';
import { State } from '../../enums';
import XLSX from 'xlsx-js-style';
import { useAuth, useDatabase } from '../../context/auth-context';
import { useItemSettings } from '../../context/SettingsContext';
import {
  collection, query, where, getDocs, limit,
  doc, runTransaction, getDoc,
} from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { formatImageUrl } from '../../Components/formatImageUrl';
import { getUnitMultiplier } from '../../Components/itemUnits';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ModalState { message: string; type: State }
export interface UploadProgress { current: number; total: number }

// Options accepted by the hook so each consumer can pass variant-specific deps
export interface UseItemFormOptions {
  /** Called after a successful single-item save so the consumer can do
   *  extra work (e.g. uploading an image file) before the item is written.
   *  Should return the final imageUrl string (or null) to store. */
  resolveImageUrl?: (barcode: string) => Promise<string | null>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export const useItemForm = (options: UseItemFormOptions = {}) => {
  const dbOperations = useDatabase();
  const { currentUser, loading: authLoading } = useAuth();
  const { itemSettings, loadingSettings: loadingItemSettings } = useItemSettings();

  // ── Form fields ──────────────────────────────────────────────────────────
  const [itemName,          setItemName]          = useState('');
  const [itemMRP,           setItemMRP]           = useState('');
  const [itemSalesPrice,    setItemSalesPrice]    = useState('');
  const [itemPurchasePrice, setItemPurchasePrice] = useState('');
  const [itemDiscount,      setItemDiscount]      = useState('');
  const [PurchaseDiscount,  setPurchaseDiscount]  = useState('');
  const [itemTax,           setItemTax]           = useState('');
  const [itemAmount,        setItemAmount]        = useState('');
  const [restockQuantity,   setRestockQuantity]   = useState('');
  const [selectedCategory,  setSelectedCategory]  = useState('');
  const [itemBarcode,       setItemBarcode]       = useState('');
  const [hsnCode,           setHsnCode]           = useState('');
  const [itemUnit,          setItemUnit]          = useState('');
  const [packetSize,        setPacketSize]        = useState('');
  const [moq,               setMoq]               = useState('1');

  // ── UI state ─────────────────────────────────────────────────────────────
  const [itemGroups,      setItemGroups]      = useState<ItemGroup[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [pageIsLoading,   setPageIsLoading]   = useState(true);
  const [error,           setError]           = useState<string | null>(null);
  const [success,         setSuccess]         = useState<string | null>(null);
  const [modal,           setModal]           = useState<ModalState | null>(null);
  const [isSaving,        setIsSaving]        = useState(false);
  const [isScannerOpen,   setIsScannerOpen]   = useState(false);
  const [isUploading,     setIsUploading]     = useState(false);
  const [uploadProgress,  setUploadProgress]  = useState<UploadProgress | null>(null);

  // ── Refs ─────────────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Page loading gate ────────────────────────────────────────────────────
  useEffect(() => {
    setPageIsLoading(authLoading || loadingItemSettings || !dbOperations);
  }, [authLoading, loadingItemSettings, dbOperations]);

  // ── Fetch item groups ────────────────────────────────────────────────────
  const fetchGroups = async () => {
    if (!dbOperations) return;
    try {
      setLoading(true);
      const groups = await dbOperations.getItemGroups();
      setItemGroups(groups);
      if (groups.length === 0) setSelectedCategory('');
    } catch (err) {
      console.error('Failed to fetch item groups:', err);
      setError('Failed to load item categories.');
    } finally {
      setLoading(false);
    }
  };

  // ── Fetch / peek next barcode ────────────────────────────────────────────
  const fetchNextBarcode = async () => {
    if (!currentUser?.companyId) return;

    // If the consumer's settings say NOT to auto-generate, clear the field
    if (itemSettings && !itemSettings.autoGenerateBarcode) {
      setItemBarcode('');
      return;
    }

    try {
      const counterRef = doc(db, 'companies', currentUser.companyId, 'counters', 'items');
      const snap = await getDoc(counterRef);
      const nextSeq = snap.exists() ? (snap.data().currentSequence || 1000) + 1 : 1001;
      setItemBarcode(String(nextSeq));
    } catch (e) {
      console.error('Failed to fetch next barcode', e);
    }
  };

  useEffect(() => {
    if (dbOperations && currentUser && itemSettings) {
      fetchGroups();
      fetchNextBarcode();
    }
  }, [dbOperations, currentUser, itemSettings]);

  // ── Reset form ───────────────────────────────────────────────────────────
  const resetForm = (extraReset?: () => void) => {
    setItemName('');
    setItemMRP('');
    setItemSalesPrice('');
    setItemPurchasePrice('');
    setItemDiscount('');
    setPurchaseDiscount('');
    setItemTax('');
    setItemAmount('');
    setRestockQuantity('');
    setHsnCode('');
    setItemUnit('');
    setPacketSize('');
    setSelectedCategory('');
    setMoq('1');
    fetchNextBarcode();
    extraReset?.();
  };

  // ── Transactional sequence block for bulk uploads ────────────────────────
  const reserveSequenceBlock = async (count: number): Promise<number> => {
    if (!currentUser?.companyId) throw new Error('No Company ID');
    const counterRef = doc(db, 'companies', currentUser.companyId, 'counters', 'items');
    try {
      return await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        const lastSeq = counterDoc.exists() ? (counterDoc.data().currentSequence || 1000) : 1000;
        transaction.set(counterRef, { currentSequence: lastSeq + count }, { merge: true });
        return lastSeq + 1;
      });
    } catch {
      return Date.now();
    }
  };

  // ── Update counter after single-add ─────────────────────────────────────
  const bumpCounterIfNumeric = async (barcode: string) => {
    const barcodeNum = parseInt(barcode, 10);
    if (isNaN(barcodeNum) || !currentUser?.companyId) return;
    const counterRef = doc(db, 'companies', currentUser.companyId, 'counters', 'items');
    await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      const current = counterDoc.exists() ? (counterDoc.data().currentSequence || 1000) : 1000;
      if (barcodeNum > current) {
        transaction.set(counterRef, { currentSequence: barcodeNum }, { merge: true });
      }
    });
  };

  // ── Add single item ──────────────────────────────────────────────────────
  const handleAddItem = async (extraReset?: () => void) => {
    if (!dbOperations || !currentUser || !itemSettings) {
      setModal({ message: 'App not ready.', type: State.ERROR }); return;
    }
    setError(null); setSuccess(null); setModal(null);

    // Required fields
    if (!itemName.trim()) {
      setModal({ message: 'Item Name and MRP are required.', type: State.ERROR }); return;
    }

    const mrpValue      = parseFloat(itemMRP) || 0;
    const saleValue     = parseFloat(itemSalesPrice) || 0;
    const purchaseValue = parseFloat(itemPurchasePrice) || 0;

    if (mrpValue === 0 && saleValue === 0) {
      setModal({ message: 'Please enter either MRP or Sales Price.', type: State.ERROR }); return;
    }

    // Settings-driven optional validation
    if (itemSettings.requireBarcode && !itemBarcode.trim()) {
      setModal({ message: 'Barcode is required.', type: State.ERROR }); return;
    }
    if (itemSettings.requireSaleDiscount && !itemDiscount.trim()) {
      setModal({ message: 'Sale Discount is required.', type: State.ERROR }); return;
    }
    if (itemSettings.requirePurchasePrice && !itemPurchasePrice.trim()) {
      setModal({ message: 'Purchase Price required.', type: State.ERROR }); return;
    }
    if (itemSettings.requirePurchaseDiscount && !PurchaseDiscount.trim()) {
      setModal({ message: 'Purchase Discount required.', type: State.ERROR }); return;
    }
    if (itemSettings.requireTax && !itemTax.trim()) {
      setModal({ message: 'Tax required.', type: State.ERROR }); return;
    }
    if (itemSettings.requireRestockQuantity && !restockQuantity.trim()) {
      setModal({ message: 'Restock quantity required.', type: State.ERROR }); return;
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

    // Resolve final barcode
    let finalBarcode = itemBarcode.trim();
    if (!finalBarcode && itemSettings.autoGenerateBarcode) {
      await fetchNextBarcode();
      finalBarcode = itemBarcode.trim();
    }
    if (!finalBarcode) finalBarcode = Date.now().toString();

    // Discount logic
    let finalSaleDiscount     = parseFloat(itemDiscount) || 0;
    let finalPurchaseDiscount = parseFloat(PurchaseDiscount) || 0;
    if (mrpValue > 0 && saleValue > 0)     finalSaleDiscount = 0;
    if (mrpValue > 0 && purchaseValue > 0) finalPurchaseDiscount = 0;

    setIsSaving(true);
    try {
      // Duplicate barcode check
      const itemsRef = collection(db, 'companies', currentUser.companyId, 'items');
      const q        = query(itemsRef, where('barcode', '==', finalBarcode), limit(1));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const existingDoc = snapshot.docs[0].data();
        if (!existingDoc.isDeleted && !existingDoc.deleted) {
          setModal({ message: `Barcode ${finalBarcode} already exists in your active items.`, type: State.ERROR });
          setIsSaving(false);
          return;
        }
      }

      // Resolve group
      const groups = await dbOperations.getItemGroups();
      const uncategorized = groups.find(g => g.name.toLowerCase().trim() === 'uncategorized');
      const finalGroupId  = selectedCategory || uncategorized?.id || '';

      // Resolve image (consumer-provided async fn, e.g. Firebase Storage upload)
      let finalImageUrl: string | null = null;
      if (options.resolveImageUrl) {
        finalImageUrl = await options.resolveImageUrl(finalBarcode);
      }

      const newItemData: any = {
        name:             itemName.trim(),
        mrp:              mrpValue,
        salesPrice:       saleValue,
        purchasePrice:    purchaseValue,
        discount:         finalSaleDiscount,
        purchasediscount: finalPurchaseDiscount,
        tax:              parseFloat(itemTax) || 0,
        hsnSac:           hsnCode.trim(),
        itemGroupId:      finalGroupId,
        stock:            parseInt(itemAmount, 10) || 0,
        amount:           parseInt(itemAmount, 10) || 0,
        barcode:          finalBarcode,
        restockQuantity:  parseInt(restockQuantity, 10) || 0,
        moq:              parseInt(moq, 10) || 1,
        unit:             itemUnit.trim(),
        unitMultiplier:   getUnitMultiplier(itemUnit, packetSize),
        packetSize:       itemUnit === 'pkt' ? parseInt(packetSize, 10) : null,
        imageUrl:         finalImageUrl,
        isDeleted:        false,
      };

      await dbOperations.createItem(newItemData, finalBarcode);
      await bumpCounterIfNumeric(finalBarcode);

      setSuccess(`Item "${itemName}" added!`);
      resetForm(extraReset);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError('Failed to add item.');
      setModal({ message: err.message, type: State.ERROR });
    } finally {
      setIsSaving(false);
    }
  };

  // ── Bulk upload ──────────────────────────────────────────────────────────
  const handleFileUpload = (
    event: React.ChangeEvent<HTMLInputElement>,
    opts: { skipFirstRow?: boolean } = {},
  ) => {
    const file = event.target.files?.[0];
    if (!file || !dbOperations || !currentUser || !itemSettings || !currentUser.companyId) return;

    setIsUploading(true);
    setUploadProgress(null);
    setError(null); setSuccess(null); setModal(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data     = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet    = workbook.Sheets[workbook.SheetNames[0]];

        const rawRange = opts.skipFirstRow ? 9 : undefined;
        const rawJson: any[] = XLSX.utils.sheet_to_json(sheet, {
          defval: null,
          ...(rawRange !== undefined ? { range: rawRange } : {}),
        });

        // When using range:9 the first row after that is a notes row — skip it
        const dataJson = opts.skipFirstRow ? rawJson.slice(1) : rawJson;
        if (dataJson.length === 0) throw new Error('File empty.');

        let createdCount = 0;
        let updatedCount = 0;
        let failedCount  = 0;
        const totalItems = dataJson.length;
        setUploadProgress({ current: 0, total: totalItems });

        // Category map
        let currentGroups = await dbOperations.getItemGroups();
        const groupMap    = new Map<string, string>();
        currentGroups.forEach(g => groupMap.set(g.name.toLowerCase().trim(), g.id!));

        // Reserve barcodes block
        const needingBarcode = dataJson.filter((r: any) => !r.barcode && !r.Barcode).length;
        let nextSeqNumber    = needingBarcode > 0 ? await reserveSequenceBlock(needingBarcode) : 0;

        for (let i = 0; i < dataJson.length; i++) {
          await new Promise(resolve => setTimeout(resolve, 0));
          setUploadProgress({ current: i + 1, total: totalItems });

          // Normalise keys
          const rawRow = dataJson[i];
          const row: any = {};
          Object.keys(rawRow).forEach(k => {
            row[k.toLowerCase().replace(/[^a-z0-9]/g, '')] = rawRow[k];
          });

          // Category resolution
          const rawCat          = row.itemgroupid || row.itemgroup || row.category || row.group || row.categoryname;
          const csvCatValue     = rawCat ? String(rawCat).trim() : 'Uncategorized';
          const categoryLower   = csvCatValue.toLowerCase();
          let targetGroupId     = '';

          if (groupMap.has(categoryLower)) {
            targetGroupId = groupMap.get(categoryLower)!;
          } else {
            try {
              const newGroupId = await dbOperations.createItemGroup({
                name: csvCatValue,
                description: 'Auto-created via Bulk Import',
              });
              if (newGroupId && typeof newGroupId === 'string') {
                groupMap.set(categoryLower, newGroupId);
                targetGroupId = newGroupId;
              }
            } catch { /* fall through with empty group */ }
          }

          // Row-level validation — support both 'name' and 'itemname' column headers
          const rowName = row.itemname || row.name;
          if (!rowName) { failedCount++; continue; }

          const rowMRP      = parseFloat(String(row.mrp ?? 0));
          const rowSale     = parseFloat(String(row.salesprice ?? row.sellingprice ?? 0));
          const rowPurchase = parseFloat(String(row.purchaseprice ?? 0));

          if (rowMRP === 0 && rowSale === 0) { failedCount++; continue; }

          let rowSaleDiscount     = parseFloat(String(row.salediscount ?? row.salesdiscount ?? row.saledisc ?? row.discount ?? 0));
          let rowPurchaseDiscount = parseFloat(String(row.purchasediscount ?? 0));
          if (rowMRP > 0 && rowSale > 0)     rowSaleDiscount = 0;
          if (rowMRP > 0 && rowPurchase > 0) rowPurchaseDiscount = 0;

          try {
            const stockVal   = parseInt(String(row.stock ?? row.amount ?? row.qty ?? row.quantity ?? 0), 10);
            let rowBarcode   = String(row.barcode || '').trim();
            const rowHsn     = String(row.hsn || row.hsncode || row.sac || row.hsnsac || '').trim();
            const rowUnitStr = String(row.unit || row.uom || '').trim();
            const rowImgUrl  = String(row.imageurl ?? row.image ?? row.picture ?? row.link ?? '').trim();

            if (!rowBarcode) { rowBarcode = String(nextSeqNumber); nextSeqNumber++; }

            const itemData: any = {
              name:             String(rowName).trim(),
              mrp:              rowMRP,
              salesPrice:       rowSale,
              purchasePrice:    rowPurchase,
              discount:         rowSaleDiscount,
              purchasediscount: rowPurchaseDiscount,
              tax:              parseFloat(String(row.tax ?? 0)),
              hsnSac:           rowHsn,
              itemGroupId:      targetGroupId,
              stock:            stockVal,
              amount:           stockVal,
              barcode:          rowBarcode,
              restockQuantity:  parseInt(String(row.restockquantity ?? 0), 10),
              taxRate:          parseFloat(String(row.tax ?? 0)),
              unit:             rowUnitStr,
              imageUrl:         formatImageUrl(rowImgUrl) || null,
              isDeleted:        false,
            };

            const iRef     = collection(db, 'companies', currentUser.companyId, 'items');
            const snap     = await getDocs(query(iRef, where('barcode', '==', rowBarcode), limit(1)));
            const isUpdate = !snap.empty;

            await dbOperations.createItem(itemData, rowBarcode);
            if (isUpdate) updatedCount++; else createdCount++;
          } catch { failedCount++; }
        }

        await fetchGroups();

        if (failedCount > 0) {
          setModal({
            message: `Error in ${failedCount} entries. Check required fields.`,
            type: State.ERROR,
          });
        } else {
          setSuccess(`Imported: ${createdCount} New, ${updatedCount} Updated.`);
          setTimeout(() => setSuccess(null), 5000);
        }
      } catch (err: any) {
        setError('File processing failed.');
      } finally {
        setIsUploading(false);
        setUploadProgress(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // ── Download sample template ─────────────────────────────────────────────
  const handleDownloadSample = () => {
    const s = (font: any, fill?: any, alignment?: any, border?: any) => ({
      font: { name: 'Arial', ...font },
      fill: fill ?? {},
      alignment: alignment ?? { horizontal: 'center', vertical: 'center', wrapText: true },
      border: border ?? {},
    });
    const solidFill  = (rgb: string) => ({ patternType: 'solid', fgColor: { rgb } });
    const thinBorder = (sides: ('top' | 'bottom' | 'left' | 'right')[]) => {
      const b: any = {};
      sides.forEach(side => { b[side] = { style: 'thin', color: { rgb: 'CBD5E1' } }; });
      return b;
    };
    const allBorders = thinBorder(['top', 'bottom', 'left', 'right']);
    const bblr       = thinBorder(['bottom', 'left', 'right']);

    const COLS = [
      { header: '★ Item Name',         note: 'Full product name  e.g. Amul Butter 500g',           type: 'R', width: 24, field: 'name' },
      { header: '◆ Barcode',           note: 'Leave blank → auto-generated',                        type: 'A', width: 16, field: 'barcode' },
      { header: '● MRP',               note: 'Max Retail Price (₹)  Required if Sale Price blank',  type: 'O', width: 13, field: 'mrp' },
      { header: '★ Sales Price',       note: 'Selling price (₹)  Required if MRP blank',            type: 'R', width: 14, field: 'salesPrice' },
      { header: '● Purchase Price',    note: 'Your cost price (₹)',                                  type: 'O', width: 17, field: 'purchasePrice' },
      { header: '● Sale Disc (%)',     note: 'Default customer discount  e.g. 5',                   type: 'O', width: 14, field: 'Sale Discount' },
      { header: '● Purchase Disc (%)', note: 'Supplier discount  e.g. 3',                           type: 'O', width: 16, field: 'purchasediscount' },
      { header: '● Tax (%)',           note: 'GST/VAT rate  e.g. 18',                               type: 'O', width: 10, field: 'tax' },
      { header: '● HSN Code',          note: '6-digit HSN / SAC code',                              type: 'O', width: 13, field: 'hsnCode' },
      { header: '▲ Category',          note: 'Group name – new category auto-created',               type: 'L', width: 18, field: 'itemGroupId' },
      { header: '● Stock',             note: 'Opening stock quantity',                               type: 'O', width: 10, field: 'stock' },
      { header: '● Restock Level',     note: 'Alert when stock falls below this',                   type: 'O', width: 15, field: 'restockQuantity' },
    ];

    const TYPE_STYLE: Record<string, { bg: string; txt: string }> = {
      R: { bg: 'FEE2E2', txt: 'DC2626' },
      O: { bg: 'DCFCE7', txt: '15803D' },
      A: { bg: 'FEFCE8', txt: '92400E' },
      L: { bg: 'E0F2FE', txt: '0369A1' },
    };

    const legendRows = [
      { bg: 'FEE2E2', txt: 'DC2626', marker: '★  Required', desc: 'Must be filled in – item will be skipped if missing' },
      { bg: 'DCFCE7', txt: '15803D', marker: '●  Optional', desc: 'Improves data quality; leave blank if not applicable' },
      { bg: 'FEFCE8', txt: '92400E', marker: '◆  Auto-fill', desc: 'Leave blank → Sellar generates a sequential barcode' },
      { bg: 'E0F2FE', txt: '0369A1', marker: '▲  Lookup',   desc: 'Accepts text name; new categories created automatically' },
    ];

    const sampleRows = [
      ['Amul Butter 500g', '',     250, 240, 190, 0, 2, 5, '0402', 'Dairy',  50,  10],
      ['Parle-G Biscuit',  '1002', 10,  10,  7,   0, 0, 0, '',     'Snacks', 200, 20],
    ];

    const colCount  = COLS.length;
    const totalRows = 13;
    const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

    aoa[0][0] = 'SELLAR  ·  Bulk Item Import Template';
    aoa[1][0] = 'Fill in the rows below and upload this file in Sellar → Items → Bulk Import.  Do NOT rename column headers.';
    aoa[3][0] = 'LEGEND';
    legendRows.forEach((l, i) => { aoa[4 + i][0] = l.marker; aoa[4 + i][1] = l.desc; });
    COLS.forEach((c, i) => { aoa[9][i] = c.header; });
    COLS.forEach((c, i) => { aoa[10][i] = c.note; });
    sampleRows.forEach((row, ri) => row.forEach((val, ci) => { aoa[11 + ri][ci] = val; }));

    const ws: any = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = COLS.map(c => ({ wch: c.width }));
    ws['!rows'] = [
      { hpt: 34 }, { hpt: 24 }, { hpt: 8 },  { hpt: 20 },
      { hpt: 18 }, { hpt: 18 }, { hpt: 18 }, { hpt: 18 },
      { hpt: 8 },  { hpt: 30 }, { hpt: 22 }, { hpt: 18 }, { hpt: 18 },
    ];
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: colCount - 1 } },
      ...legendRows.map((_, i) => ({ s: { r: 4 + i, c: 1 }, e: { r: 4 + i, c: 3 } })),
    ];

    const styleCell = (addr: string, st: any) => {
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      ws[addr].s = st;
    };

    styleCell('A1', s({ sz: 15, bold: true, color: { rgb: 'FFFFFF' } }, solidFill('0369A1'), { horizontal: 'center', vertical: 'center' }));
    styleCell('A2', s({ sz: 9, italic: true, color: { rgb: '475569' } }, solidFill('DBEAFE'), { horizontal: 'center', vertical: 'center', wrapText: true }));
    styleCell('A4', s({ sz: 10, bold: true, color: { rgb: '0369A1' } }, solidFill('E0F2FE'), { horizontal: 'left', vertical: 'center' }, allBorders));

    legendRows.forEach((l, i) => {
      const row = 5 + i;
      styleCell(`A${row}`, s({ sz: 9, bold: true, color: { rgb: l.txt } }, solidFill(l.bg), { horizontal: 'left', vertical: 'center' }, bblr));
      styleCell(`B${row}`, s({ sz: 9, color: { rgb: '334155' } }, solidFill(l.bg), { horizontal: 'left', vertical: 'center' }, bblr));
      ['C', 'D'].forEach(col => {
        const addr = `${col}${row}`;
        if (!ws[addr]) ws[addr] = { t: 's', v: '' };
        ws[addr].s = s({ sz: 9 }, solidFill(l.bg), {}, bblr);
      });
    });

    COLS.forEach((c, i) => {
      const { bg, txt } = TYPE_STYLE[c.type];
      styleCell(XLSX.utils.encode_cell({ r: 9, c: i }), s({ sz: 9, bold: true, color: { rgb: txt } }, solidFill(bg), { horizontal: 'center', vertical: 'center', wrapText: true }, allBorders));
    });
    COLS.forEach((_c, i) => {
      styleCell(XLSX.utils.encode_cell({ r: 10, c: i }), s({ sz: 7, italic: true, color: { rgb: '64748B' } }, solidFill('F8FAFC'), { horizontal: 'center', vertical: 'center', wrapText: true }, bblr));
    });

    sampleRows.forEach((row, ri) => {
      const altBg = ri % 2 === 1 ? 'F1F5F9' : 'FFFFFF';
      if (ri === 0) {
        const bAddr = XLSX.utils.encode_cell({ r: 11, c: 1 });
        ws[bAddr] = { t: 's', v: '' };
        ws[bAddr].s = s({ sz: 8, italic: true, color: { rgb: '94A3B8' } }, solidFill(altBg), { horizontal: 'center', vertical: 'center' }, bblr);
      }
      row.forEach((_val, ci) => {
        styleCell(XLSX.utils.encode_cell({ r: 11 + ri, c: ci }), s({ sz: 9, color: { rgb: '1E293B' } }, solidFill(altBg), { horizontal: 'center', vertical: 'center' }, bblr));
      });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Items');
    XLSX.writeFile(wb, 'Sellar_Items_Import_Template.xlsx');
  };

  // ── Barcode scanner ──────────────────────────────────────────────────────
  const handleBarcodeScanned = (barcode: string) => {
    setItemBarcode(barcode);
    setIsScannerOpen(false);
  };

  // ── Expose ───────────────────────────────────────────────────────────────
  return {
    // Fields
    itemName,          setItemName,
    itemMRP,           setItemMRP,
    itemSalesPrice,    setItemSalesPrice,
    itemPurchasePrice, setItemPurchasePrice,
    itemDiscount,      setItemDiscount,
    PurchaseDiscount,  setPurchaseDiscount,
    itemTax,           setItemTax,
    itemAmount,        setItemAmount,
    restockQuantity,   setRestockQuantity,
    selectedCategory,  setSelectedCategory,
    itemBarcode,       setItemBarcode,
    hsnCode,           setHsnCode,
    itemUnit,          setItemUnit,
    packetSize,        setPacketSize,
    moq,               setMoq,

    // Derived
    itemSettings,
    itemGroups,

    // UI flags
    loading,
    pageIsLoading,
    error,
    success,
    modal,             setModal,
    isSaving,
    isScannerOpen,     setIsScannerOpen,
    isUploading,
    uploadProgress,

    // Refs
    fileInputRef,

    // Actions
    handleAddItem,
    handleFileUpload,
    handleDownloadSample,
    handleBarcodeScanned,
    fetchGroups,
  };
};
