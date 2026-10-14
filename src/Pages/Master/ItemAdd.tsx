import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { ItemGroup, PriceTier, QuantitySlab } from '../../constants/models';
import { validateQuantitySlabs } from '../../constants/models';
//import { CustomButton } from '../../Components';
import { State } from '../../enums';
import XLSX from 'xlsx-js-style';
import BarcodeScanner from '../../UseComponents/BarcodeScanner';
import { useAuth, useDatabase } from '../../context/auth-context';
import { useCatalogueData } from '../../context/CatalogueDataContext';
import { Spinner } from '../../constants/Spinner';
import { Modal } from '../../constants/Modal';
import { useItemSettings } from '../../context/SettingsContext';
import { IconScanCircle } from '../../constants/Icons';
import { collection, query, where, getDocs, limit, doc, runTransaction, getDoc } from 'firebase/firestore';
import { useGodowns, SHOP_NAME } from '../hooks/useStockTransfer';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import ExcelJS from 'exceljs';
import { db, storage } from '../../lib/Firebase';
import imageCompression from 'browser-image-compression';
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
//import { InfoTooltip } from '../../Components/InfoToolTip';
import { VariantPicker } from '../../Components/VariantPicker';

interface ItemAddProps {
  theme?: 'blue' | 'orange';
  routes?: {
    itemAdd: string;
    itemGroup: string;
  };
  // NEW: when used as a popup (e.g. from Purchase page for unlinked scanned items)
  isModal?: boolean;
  prefillData?: {
    name?: string;
    mrp?: number;
    salesPrice?: number;
    purchasePrice?: number;
    discount?: number;
    purchasediscount?: number;
    tax?: number;
    barcode?: string;
    unit?: string;
  };
  onItemCreated?: (item: any) => void; // fired instead of normal reset flow when in modal mode
  onCancel?: () => void; // close button handler for modal mode
}

const formatImageUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  let cleanUrl = url.trim();

  if (cleanUrl.includes('drive.google.com')) {
    let fileId = null;
    const matchFileD = cleanUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);

    if (matchFileD) {
      fileId = matchFileD[1];
    } else {
      const matchIdParam = cleanUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (matchIdParam) fileId = matchIdParam[1];
    }

    // THE FIX: Use Google's lh3 image CDN endpoint
    if (fileId) {
      return `https://lh3.googleusercontent.com/d/${fileId}`;
    }
  }

  if (cleanUrl.includes('dropbox.com')) {
    return cleanUrl.replace('dl=0', 'raw=1').replace('www.dropbox.com', 'dl.dropboxusercontent.com');
  }

  return cleanUrl;
};

const UNIT_OPTIONS = [
  { value: 'pcs', label: 'Pieces (1 pcs)' },
  { value: 'box', label: 'Box(10 pcs)' },
  { value: 'pkt', label: 'Packet (Custom)' },
  { value: 'doz', label: 'Dozen (12 pcs)' },
  { value: 'qt', label: 'Quintal(100 pcs)' },
  { value: 'ton', label: 'Ton(1000 pcs)' },
];

const AI_ICONS = {
  tag: (<><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" /><circle cx="7.5" cy="7.5" r="1.5" /></>),
  doc: (<><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>),
  box: (<><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></>),
  grid: (<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>),
  image: (<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 17-5-5-9 8" /></>),
  link: (<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />),
  search: (<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>),
  upload: (<path d="M12 21V9M7 14l5-5 5 5M4 3h16" />),
  download: (<path d="M12 3v12M7 10l5 5 5-5M4 21h16" />),
  check: (<path d="M5 12.5l4.5 4.5L19 7" />),
  x: (<path d="M6 6l12 12M18 6 6 18" />),
  plus: (<path d="M12 5v14M5 12h14" />),
  back: (<path d="M15 18l-6-6 6-6" />),
};

const AiIcon: React.FC<{ name: keyof typeof AI_ICONS; sm?: boolean }> = ({ name, sm }) => (
  <svg className={`ai-ico${sm ? ' ai-ico--sm' : ''}`} viewBox="0 0 24 24" aria-hidden="true">{AI_ICONS[name]}</svg>
);

const ADD_ITEM_CSS = `
.ai-root{
  --canvas:#eef2ff;--surface:#fff;--surface-sunken:#f5f7ff;--surface-inverse:#0f172b;--ink:#0f172b;--ink-muted:#45556c;--ink-subtle:#5b6b86;
  --border:#dfe6fb;--border-control:#7a8aa3;--primary:#155dfc;--primary-hover:#1447e6;--primary-text:#155dfc;--primary-soft:#e6eeff;--primary-soft-ink:#155dfc;
  --success:#008236;--success-soft:#e9faef;--warning:#bb4d00;--warning-soft:#fff3dd;--danger:#d5000c;--danger-soft:#ffeef0;
  --shadow-card:0 1px 2px rgba(21,48,140,.05),0 2px 6px rgba(21,48,140,.06);--shadow-float:0 10px 28px rgba(21,48,140,.14),0 2px 6px rgba(21,48,140,.08);
  font-family:Poppins,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--canvas);
  display:flex;flex-direction:column;position:relative;overflow:hidden;min-height:0;font-size:14px;line-height:22px;
}
.ai-root.ai-orange{--canvas:#fff5ec;--primary:#c2410c;--primary-hover:#9a3412;--primary-text:#c2410c;--primary-soft:#ffedd5;--primary-soft-ink:#c2410c;--warning:#a16207}
.ai-root *{box-sizing:border-box}
.ai-root--page{height:100vh;width:100%}
.ai-root--modal{height:100%;width:100%;background:var(--surface)}
.ai-ico{width:20px;height:20px;flex:none;stroke:currentColor;fill:none;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
.ai-ico--sm{width:16px;height:16px}
.ai-overline{font-size:11px;line-height:16px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-subtle)}

/* header
   <768px  : phone  -> back button, caption under title, toggle row below, pinned save bar
   768-1279: tablet -> sidebar is on screen, so NO right panel; toggle row below, Save buttons in header
   >=1280px: desktop-> toggle inside header, right panel with preview + save */
.ai-bar{display:flex;align-items:center;gap:8px 12px;min-height:56px;padding:8px 16px;background:var(--surface);border-bottom:1px solid var(--border)}
.ai-bar h1{margin:0;font-size:18px;line-height:24px;font-weight:600;flex:1;min-width:0}
.ai-bar__cap{display:block;font-size:12px;line-height:16px;font-weight:400;color:var(--ink-subtle)}
.ai-bar__meta{display:none;margin-left:auto;font-size:12px;color:var(--ink-subtle)}
.ai-bar--modal{justify-content:space-between}
.ai-bar .ai-bar__back{margin-left:-8px;flex:none}
.ai-bar .ai-seg{display:none}
.ai-bar__save{display:none;gap:8px;flex:none}
.ai-tabs{padding:10px 16px 0}
.ai-tabs .ai-seg{display:flex}
.ai-tabs .ai-seg button{flex:1;height:34px;font-size:13px;justify-content:center}
@media(min-width:768px){
  .ai-bar{padding:12px 20px}
  .ai-bar .ai-bar__back{display:none}
  .ai-bar h1{font-size:20px;line-height:28px}
  .ai-tabs{padding:12px 20px 0}
}
@media(min-width:768px) and (max-width:1279px){
  .ai-bar__save{display:flex}
}
@media(min-width:1280px){
  .ai-bar{padding:16px 24px}
  .ai-bar h1{font-size:22px;line-height:30px;flex:none}
  .ai-bar__cap{display:none}
  .ai-bar__meta{display:block}
  .ai-bar .ai-seg{display:inline-flex}
  .ai-tabs{display:none}
}
.ai-seg{display:inline-flex;padding:3px;gap:2px;background:var(--surface-sunken);border:1px solid var(--border);border-radius:11px}
.ai-seg button{height:28px;padding:0 12px;border:0;border-radius:8px;background:transparent;color:var(--ink-muted);font-size:12px;font-weight:500;line-height:28px;font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.ai-seg button[aria-pressed="true"]{background:var(--surface);color:var(--primary-text);box-shadow:var(--shadow-card)}
.ai-count{min-width:22px;height:20px;padding:0 6px;border-radius:999px;background:var(--surface-sunken);color:var(--ink-muted);font-size:11px;line-height:20px;text-align:center}
.ai-seg button[aria-pressed="true"] .ai-count{background:var(--primary-soft);color:var(--primary-soft-ink)}

/* layout */
.ai-work{flex:1;display:flex;min-height:0}
.ai-left{flex:1;min-width:0;overflow-y:auto;padding:12px 16px 150px;display:flex;flex-direction:column;gap:12px}
.ai-root--modal .ai-left{padding:16px}
.ai-left > *{flex-shrink:0}
@media(min-width:768px){.ai-left{padding:20px 20px 24px;gap:14px}}
.ai-right{display:none}
@media(min-width:1280px){.ai-right{display:flex;flex-direction:column;gap:16px;width:340px;flex:none;background:var(--surface);border-left:1px solid var(--border);padding:20px;overflow-y:auto}}

/* cards + form */
.ai-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow-card);min-width:0;overflow:hidden}
.ai-fs-h{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border)}
.ai-fs-h b{font-size:15px;font-weight:600}
.ai-fs-h small{margin-left:auto;font-size:12px;color:var(--ink-subtle);text-align:right}
.ai-fs-b{padding:14px 16px;display:grid;gap:12px 16px;grid-template-columns:repeat(2,minmax(0,1fr));align-items:start}
@media(min-width:768px){.ai-c3{grid-template-columns:repeat(3,minmax(0,1fr))}}
.ai-full{grid-column:1/-1}
.ai-pair{display:grid;gap:12px;grid-template-columns:minmax(0,1fr)}
@media(min-width:1024px){.ai-pair{grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}}
.ai-fl{display:grid;gap:4px;min-width:0;align-content:start}
.ai-lab{font-size:12px;font-weight:500;color:var(--ink-muted)}
.ai-req::after{content:'*';margin-left:2px;color:var(--danger)}
.ai-hint{font-size:11px;line-height:15px;color:var(--ink-subtle)}
.ai-field{display:flex;align-items:center;gap:8px;height:40px;padding:0 12px;border:1px solid var(--border-control);border-radius:8px;background:var(--surface);color:var(--ink-subtle);min-width:0}
.ai-field input,.ai-field select,.ai-field textarea{flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--ink);font-size:14px;font-family:inherit;height:100%}
.ai-field input::placeholder,.ai-field textarea::placeholder{color:var(--ink-subtle)}
.ai-field:focus-within{outline:2px solid var(--primary);outline-offset:1px}
.ai-field i{font-style:normal;font-size:13px;color:var(--ink-subtle)}
.ai-field--dis{background:var(--surface-sunken)}
.ai-field--sm{height:36px;padding:0 8px}
.ai-field--area{height:auto;align-items:flex-start;padding:10px 12px}
.ai-field--area textarea{resize:none;height:auto;line-height:20px}
.ai-field select{cursor:pointer}
.ai-field--tags{height:auto;min-height:40px;padding:6px 10px;flex-wrap:wrap}
.ai-margin{background:var(--success-soft);border-color:transparent;color:var(--success);font-weight:600;justify-content:space-between}
.ai-margin--neg{background:var(--danger-soft);color:var(--danger)}
.ai-margin--empty{background:var(--surface-sunken);color:var(--ink-subtle);font-weight:400}
.ai-margin i{color:inherit;font-weight:400;font-size:12px}

/* image block */
.ai-img{display:grid;grid-template-columns:96px minmax(0,1fr);gap:12px 16px;align-items:center}
@media(min-width:768px){.ai-img{grid-template-columns:112px minmax(0,1fr)}}
.ai-drop{width:96px;height:96px;border:1.5px dashed var(--border-control);border-radius:12px;display:grid;place-content:center;justify-items:center;gap:4px;color:var(--ink-subtle);font-size:11px;text-align:center;background:var(--surface-sunken);cursor:pointer;overflow:hidden;transition:background-color .12s}
.ai-drop:hover{background:var(--primary-soft)}
.ai-drop .ai-ico{width:24px;height:24px;color:var(--primary-text)}
.ai-drop__img{width:100%;height:100%;object-fit:cover}
@media(min-width:768px){.ai-drop{width:112px;height:112px}}
.ai-stack{display:grid;gap:10px;min-width:0}
.ai-linkbtn{background:none;border:0;padding:0;font:inherit;font-size:12px;color:var(--danger);cursor:pointer;text-align:left}
.ai-linkbtn:hover{text-decoration:underline}
.ai-linkbtn--primary{color:var(--primary-text);font-weight:500}
.ai-thumbs{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.ai-thumb{position:relative;width:56px;height:56px}
.ai-thumb img{width:100%;height:100%;object-fit:cover;border-radius:8px;border:1px solid var(--border)}
.ai-thumb button{position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;border:0;background:var(--danger);color:#fff;display:grid;place-items:center;cursor:pointer;padding:0}
.ai-thumb .ai-ico{width:12px;height:12px;stroke-width:2.5}
.ai-file{font-size:12px;color:var(--ink-muted);max-width:100%}

/* tags */
.ai-tag{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 6px 0 10px;border-radius:999px;background:var(--primary-soft);color:var(--primary-soft-ink);font-size:12px;font-weight:500}
.ai-tag button{border:0;background:none;color:inherit;display:grid;place-items:center;cursor:pointer;padding:0}
.ai-tag .ai-ico{width:14px;height:14px}
.ai-tag button:hover{color:var(--danger)}

/* buttons */
.ai-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;padding:0 16px;border-radius:8px;border:1px solid transparent;background:transparent;font-size:14px;font-weight:500;line-height:20px;font-family:inherit;cursor:pointer;white-space:nowrap;transition:background-color .12s,border-color .12s}
.ai-btn--primary{background:var(--primary);color:#fff}
.ai-btn--primary:hover:not([disabled]){background:var(--primary-hover)}
.ai-btn--secondary{background:var(--surface);color:var(--ink);border-color:var(--border-control)}
.ai-btn--secondary:hover:not([disabled]){background:var(--surface-sunken)}
.ai-btn--ghost{color:var(--ink-muted)}
.ai-btn--ghost:hover:not([disabled]){background:var(--surface-sunken);color:var(--ink)}
.ai-btn--sm{height:32px;padding:0 12px;font-size:13px}
.ai-btn--lg{height:48px;padding:0 20px;font-size:15px}
.ai-btn--icon{width:32px;padding:0}
.ai-btn--block{width:100%}
.ai-btn[disabled]{opacity:.45;cursor:not-allowed}
.ai-btn:focus-visible,.ai-seg button:focus-visible,.ai-drop:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
.ai-iconbtn{width:32px;height:32px;display:grid;place-items:center;border:0;border-radius:8px;background:transparent;color:var(--ink-subtle);cursor:pointer}
.ai-iconbtn:hover{background:var(--surface-sunken);color:var(--ink)}

/* chips */
.ai-tint{width:32px;height:32px;flex:none;display:inline-grid;place-items:center;border-radius:8px;background:var(--primary-soft);color:var(--primary-soft-ink)}
.ai-tint .ai-ico{width:18px;height:18px}
.ai-tint--green{background:var(--success-soft);color:var(--success)}
.ai-tint--amber{background:var(--warning-soft);color:var(--warning)}
.ai-badge{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:999px;font-size:11px;font-weight:600;letter-spacing:.03em;background:var(--success-soft);color:var(--success)}

/* tiers + slabs */
.ai-sub{border:1px solid var(--border);border-radius:8px;padding:12px;background:var(--surface-sunken);position:relative;display:grid;gap:10px}
.ai-sub .ai-x{position:absolute;top:6px;right:6px}
.ai-g2{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}
.ai-g3{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}
@media(min-width:1024px){.ai-g3{grid-template-columns:repeat(4,minmax(0,1fr))}}
.ai-slab{position:relative;display:grid;gap:8px;grid-template-columns:repeat(2,minmax(0,1fr));align-items:end;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--surface-sunken)}
.ai-slab__x{position:absolute;top:2px;right:2px;width:24px;height:24px}
.ai-slab__price{grid-column:1/-1}
.ai-slabhead{font-size:11px;font-weight:500;color:var(--ink-subtle)}
.ai-slabhdr{display:none}
.ai-slab__lab{display:block}
@media(min-width:768px){
  .ai-slab{position:static;grid-template-columns:repeat(3,minmax(0,1fr)) 28px;align-items:center;padding:0;border:0;background:none}
  .ai-slab__x{position:static;width:28px;height:28px}
  .ai-slab__price{grid-column:auto}
  .ai-slabhdr{display:grid}
  .ai-slab__lab{display:none}
}
.ai-note{font-size:12px;color:var(--warning)}
.ai-empty{font-size:12px;color:var(--ink-subtle)}

/* alerts */
.ai-alert{padding:10px 14px;border-radius:8px;font-size:13px;font-weight:500;display:flex;align-items:center;justify-content:space-between;gap:8px}
.ai-alert--danger{background:var(--danger-soft);color:var(--danger)}
.ai-alert--success{background:var(--success-soft);color:var(--success)}
.ai-alert span{flex:1;text-align:center}
.ai-alert button{border:0;background:none;color:inherit;cursor:pointer;display:grid;place-items:center;padding:0}

/* right panel (desktop >=1280 only) */
.ai-prev__img{height:96px;background:var(--surface-sunken);display:grid;place-items:center;color:var(--ink-subtle);border-bottom:1px solid var(--border);overflow:hidden}
.ai-prev__img img{width:100%;height:100%;object-fit:cover}
.ai-prev__b{padding:14px 16px;display:grid;gap:10px}
.ai-prev__name{font-size:15px;font-weight:600;line-height:22px;word-break:break-word}
.ai-meta{font-size:12px;color:var(--ink-subtle)}
.ai-price{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.ai-price b{font-size:22px;line-height:30px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.ai-mrp{color:var(--ink-subtle);text-decoration:line-through;font-size:12px}
.ai-kv{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 12px;font-size:13px;margin:0}
.ai-kv dt{color:var(--ink-muted);margin:0}
.ai-kv dd{margin:0;text-align:right;font-weight:600;font-variant-numeric:tabular-nums}
.ai-bulk{background:var(--primary-soft);padding:14px 16px;display:grid;gap:10px}
.ai-bulk__h{display:flex;gap:10px;align-items:flex-start}
.ai-bulk__h b{font-size:14px}
.ai-bulk__h div div{font-size:12px;line-height:18px;color:var(--ink-muted)}
.ai-bulk__btns{display:grid;grid-template-columns:1fr auto;gap:8px}
.ai-spacer{flex:1}
@media(min-width:1280px){.ai-bulk.ai-mobonly{display:none}}

/* phone pinned bar (<768 only) */
.ai-savebar{position:fixed;left:0;right:0;bottom:64px;z-index:20;background:var(--surface);border-top:1px solid var(--border);padding:12px 16px;display:grid;grid-template-columns:1fr 1.4fr;gap:8px}
.ai-savepair{display:grid;grid-template-columns:1fr 1fr;gap:8px}
@media(min-width:768px){.ai-savebar{display:none}}
.ai-modalbar{border-top:1px solid var(--border);padding:12px 16px;display:flex;justify-content:flex-end;gap:8px;background:var(--surface)}

/* overlays */
.ai-overlay{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;background:rgba(2,6,24,.5);padding:16px}
.ai-dialog{background:var(--surface);border-radius:12px;box-shadow:var(--shadow-float);width:100%;max-width:512px;padding:20px;display:flex;flex-direction:column;gap:16px;max-height:90vh;overflow:auto}
.ai-dialog--sm{max-width:340px;text-align:center}
.ai-dialog h2,.ai-dialog h3{margin:0;font-size:18px;line-height:26px;font-weight:600}
.ai-dialog p{margin:0;font-size:13px;color:var(--ink-muted)}
.ai-dialog__f{display:flex;justify-content:flex-end;gap:8px}
@media(max-width:767px){.ai-overlay{align-items:flex-end;padding:0}.ai-dialog{border-radius:20px 20px 0 0;max-width:none}.ai-dialog--sm{border-radius:20px 20px 0 0}}
.ai-meter{height:8px;border-radius:999px;background:var(--surface-sunken);overflow:hidden}
.ai-meter div{height:100%;background:var(--primary);border-radius:999px;transition:width .1s}
.ai-opt{display:flex;align-items:flex-start;gap:12px;padding:12px;border:1px solid var(--border-control);border-radius:8px;cursor:pointer;transition:background-color .12s}
.ai-opt:hover{background:var(--surface-sunken)}
.ai-opt--on{border:2px solid var(--primary);background:var(--primary-soft);padding:11px}
.ai-opt input{margin-top:4px;accent-color:var(--primary)}
.ai-opt b{display:block;font-weight:600;font-size:14px}
.ai-opt small{font-size:12px;color:var(--ink-muted)}
.ai-fields{background:var(--surface-sunken);border:1px solid var(--border);border-radius:8px;padding:12px}
.ai-fields__g{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;font-size:13px}
.ai-fields__g label{display:flex;align-items:center;gap:8px;cursor:pointer;text-transform:capitalize}
.ai-fields__g input{accent-color:var(--primary)}
.ai-cropwrap{display:flex;justify-content:center;max-height:60vh;overflow:auto}
`;
const DRAFT_STORAGE_KEY = 'sellar_item_add_draft';

const ItemAdd: React.FC<ItemAddProps> = ({
  theme = 'blue',
  routes = { itemAdd: '/item-add', itemGroup: '/item-group' },
  isModal = false,
  prefillData,
  onItemCreated,
  onCancel,
}) => {
  const themeStyles = {
    blue: {
      primaryBg: 'bg-blue-600',
      primaryHover: 'hover:bg-blue-600',
      text: 'text-blue-500',
      textHover: 'hover:text-blue-700',
      border: 'border-blue-500',
      focusRing: 'focus:ring-blue-500',
      panelBg: 'bg-blue-50',
      panelBorder: 'border-blue-100',
      panelHeader: 'text-blue-800',
      panelSubText: 'text-blue-600',
      panelBtn: 'text-blue-600 border-blue-200 hover:bg-blue-50',
    },
    orange: {
      primaryBg: 'bg-[#F97316]',
      primaryHover: 'hover:bg-[#ea580c]',
      text: 'text-[#F97316]',
      textHover: 'hover:text-[#c2410c]',
      border: 'border-[#F97316]',
      focusRing: 'focus:ring-[#F97316]',
      panelBg: 'bg-[#F97316]/10',
      panelBorder: 'border-[#F97316]/20',
      panelHeader: 'text-[#ea580c]',
      panelSubText: 'text-[#F97316]',
      panelBtn: 'text-[#F97316] border-[#F97316]/20 hover:bg-[#F97316]/10',
    }
  };

  const activeTheme = themeStyles[theme];
  const navigate = useNavigate();
  const location = useLocation();
  const dbOperations = useDatabase();
  const { currentUser, loading: authLoading } = useAuth();
  const { itemSettings, loadingSettings: loadingItemSettings } = useItemSettings();
  // Needed to resolve a Location column value (e.g. "Warehouse A") to a godown id during bulk import.
  const { godowns } = useGodowns(currentUser?.companyId);
  const [itemName, setItemName] = useState<string>('');
  const [itemMRP, setItemMRP] = useState<string>('');
  const [itemSalesPrice, setItemSalesPrice] = useState<string>('');
  const [itemPurchasePrice, setItemPurchasePrice] = useState<string>('');
  const [itemDiscount, setItemDiscount] = useState<string>('');
  const [PurchaseDiscount, setPurchaseDiscount] = useState<string>('');
  const [itemTax, setItemTax] = useState<string>('');
  const [itemAmount, setItemAmount] = useState<string>('');
  const [restockQuantity, setRestockQuantity] = useState<string>('');
  const [itemDescription, setItemDescription] = useState<string>('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState<boolean>(false);
  const [itemBarcode, setItemBarcode] = useState<string>('');
  const [fetchedAutoBarcode, setFetchedAutoBarcode] = useState<string>('');
  const [hsnCode, setHsnCode] = useState<string>('');
  const [itemUnit, setItemUnit] = useState<string>('pcs');
  const [packetSize, setPacketSize] = useState<string>('');
  const { items: catalogueItems, itemGroups: catalogueItemGroups, itemGroupsLoading: catalogueGroupsLoading } = useCatalogueData();
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>(catalogueItemGroups);
  const [allItems, setAllItems] = useState<any[]>(catalogueItems);
  // Seeds from the shared CatalogueDataContext on mount/update instead of
  // this page re-fetching groups/items itself. `fetchGroups()` below is
  // still used as an explicit one-shot refresh after the bulk CSV import
  // writes many items/groups in a tight loop and needs a deterministic
  // fresh read to keep going — that path is unchanged.
  useEffect(() => { setItemGroups(catalogueItemGroups); }, [catalogueItemGroups]);
  useEffect(() => { setAllItems(catalogueItems); }, [catalogueItems]);
  const [moq, setMoq] = useState<string>('1');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [additionalImageFiles, setAdditionalImageFiles] = useState<File[]>([]);
  const [additionalImagePreviews, setAdditionalImagePreviews] = useState<string[]>([]);
  const [itemVariants, setItemVariants] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [pageIsLoading, setPageIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);

  const [isImageCompressing, setIsImageCompressing] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<Crop | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const pendingRawFile = useRef<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [priceTiers, setPriceTiers] = useState<PriceTier[]>([]);
  const [quantitySlabs, setQuantitySlabs] = useState<QuantitySlab[]>([]);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importMode, setImportMode] = useState<'create_update' | 'update_only'>('create_update');
  const [updateFields, setUpdateFields] = useState({
    name: true,
    mrp: true,
    salesPrice: true,
    purchasePrice: true,
    stock: true,
    category: true,
    discount: true,
    tax: true,
    hsnCode: true,
    restockQuantity: true,
    moq: true,
    description: true,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const successBannerRef = useRef<HTMLDivElement>(null);
  const keepForNextRef = useRef(false); // "+ Another": carry unit, tax and groups to the next item

  useEffect(() => {
    // NEW: If opened as a popup with prefill data (e.g. from Purchase Smart Scan),
    // seed the form from that instead of the regular saved draft.
    if (isModal && prefillData) {
      if (prefillData.name) setItemName(prefillData.name);
      if (prefillData.mrp) setItemMRP(String(prefillData.mrp));
      if (prefillData.salesPrice) setItemSalesPrice(String(prefillData.salesPrice));
      if (prefillData.purchasePrice) setItemPurchasePrice(String(prefillData.purchasePrice));
      if (prefillData.discount) setItemDiscount(String(prefillData.discount));
      if (prefillData.purchasediscount) setPurchaseDiscount(String(prefillData.purchasediscount));
      if (prefillData.tax) setItemTax(String(prefillData.tax));
      if (prefillData.barcode) setItemBarcode(prefillData.barcode);
      if (prefillData.unit) setItemUnit(prefillData.unit);
      return; // skip loading the regular draft in modal mode
    }
    // FIX: search bar's "+ Add Item" click (Purchase/Sales SearchableItemInput
    // onAddItem) passes the typed query via router state — grab it here.
    const prefillNameFromSearch = (location.state as { prefillName?: string } | null)?.prefillName;
    const draft = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        if (parsed.itemName) setItemName(parsed.itemName);
        if (parsed.itemMRP) setItemMRP(parsed.itemMRP);
        if (parsed.priceTiers) setPriceTiers(parsed.priceTiers);
        if (parsed.quantitySlabs) setQuantitySlabs(parsed.quantitySlabs);
        if (parsed.itemSalesPrice) setItemSalesPrice(parsed.itemSalesPrice);
        if (parsed.itemPurchasePrice) setItemPurchasePrice(parsed.itemPurchasePrice);
        if (parsed.itemDiscount) setItemDiscount(parsed.itemDiscount);
        if (parsed.PurchaseDiscount) setPurchaseDiscount(parsed.PurchaseDiscount);
        if (parsed.itemTax) setItemTax(parsed.itemTax);
        if (parsed.itemAmount) setItemAmount(parsed.itemAmount);
        if (parsed.restockQuantity) setRestockQuantity(parsed.restockQuantity);
        if (parsed.itemDescription) setItemDescription(parsed.itemDescription);
        if (parsed.selectedCategories) setSelectedCategories(parsed.selectedCategories);
        if (parsed.itemBarcode) setItemBarcode(parsed.itemBarcode);
        if (parsed.hsnCode) setHsnCode(parsed.hsnCode);
        if (parsed.itemUnit) setItemUnit(parsed.itemUnit);
        if (parsed.packetSize) setPacketSize(parsed.packetSize);
        if (parsed.moq) setMoq(parsed.moq);
        if (parsed.imageUrl) setImageUrl(parsed.imageUrl);
      } catch (e) {
        console.error("Failed to parse draft storage", e);
      }
    }
    // FIX: apply AFTER the draft restore so the searched name always wins
    // over a stale/old saved draft — this is the actual missing prefill step.
    if (prefillNameFromSearch) {
      setItemName(prefillNameFromSearch);
    }
  }, []);

  useEffect(() => {
    if (isModal) return; // NEW: don't pollute the normal Add-Item draft when used as a popup
    const draft = {
      itemName, itemMRP, itemSalesPrice, itemPurchasePrice, itemDiscount,
      PurchaseDiscount, itemTax, itemAmount, restockQuantity, itemDescription, selectedCategories,
      itemBarcode, hsnCode, itemUnit, packetSize, moq, imageUrl, priceTiers, quantitySlabs
    };
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [itemName, itemMRP, itemSalesPrice, itemPurchasePrice, itemDiscount, PurchaseDiscount, itemTax, itemAmount, restockQuantity, itemDescription, selectedCategories, itemBarcode, hsnCode, itemUnit, packetSize, moq, imageUrl, priceTiers, quantitySlabs]);

  const getUnitLabel = () => {
    if (itemUnit === 'box') return '10 pcs';
    if (itemUnit === 'doz') return '12 pcs';
    if (itemUnit === 'qt') return '100 pcs';
    if (itemUnit === 'ton') return '1000 pcs';
    if (itemUnit === 'pkt') return `${packetSize || 1} pcs`;
    return '1 pcs';
  };


  useEffect(() => {
    setPageIsLoading(authLoading || loadingItemSettings || !dbOperations);
  }, [authLoading, loadingItemSettings, dbOperations]);

  const isActive = (path: string) => location.pathname === path;

  const fetchGroups = async () => {
    if (!dbOperations) return;
    try {
      setLoading(true);
      const groups = await dbOperations.getItemGroups();
      setItemGroups(groups);
      if (groups.length === 0) setSelectedCategories([]);
      const items = await dbOperations.syncItems();
      setAllItems(items || []);
    } catch (err) {
      setError('Failed to load item categories.');
    } finally {
      setLoading(false);
    }
  };

  const fetchNextBarcode = async (forceRefresh = false) => {
    if (!currentUser?.companyId || !itemSettings?.autoGenerateBarcode) return;

    if (!forceRefresh) {
      // Modal mode never loads the saved draft, so a stale draft barcode must not block
      // fetching one — but a prefilled barcode should be kept as-is.
      if (isModal && prefillData?.barcode) return;
      const draft = !isModal ? sessionStorage.getItem(DRAFT_STORAGE_KEY) : null;
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          if (parsed.itemBarcode) return;
        } catch (e) { }
      }
    }

    try {
      const counterRef = doc(db, 'companies', currentUser.companyId, 'counters', 'items');
      const snap = await getDoc(counterRef);
      let nextSeq = 1001;
      if (snap.exists()) {
        nextSeq = (snap.data().currentSequence || 1000) + 1;
      }
      setItemBarcode(String(nextSeq));
      setFetchedAutoBarcode(String(nextSeq));
    } catch (e) {
      console.error("Failed to fetch next barcode", e);
    }
  };

  useEffect(() => { setLoading(catalogueGroupsLoading); }, [catalogueGroupsLoading]);

  useEffect(() => {
    if (dbOperations && currentUser && itemSettings) {
      fetchNextBarcode();
    }
  }, [dbOperations, currentUser, itemSettings]);

  const resetForm = () => {
    const keep = keepForNextRef.current; // true only when "+ Another" / "Save & new" was clicked
    setItemName('');
    setItemMRP('');
    setItemSalesPrice('');
    setItemPurchasePrice('');
    setItemDiscount('');
    setPurchaseDiscount('');
    if (!keep) setItemTax('');
    setItemAmount('');
    setRestockQuantity('');
    setItemDescription('');
    setHsnCode('');
    if (!keep) {
      setItemUnit('pcs');
      setPacketSize('');
    }
    setImageUrl('');
    setImageFile(null);
    setImagePreview(null);
    setAdditionalImageFiles([]);
    setAdditionalImagePreviews([]);
    setMoq('1');
    if (!keep) setSelectedCategories([]);
    setShowCategoryDropdown(false);
    setItemVariants([]);
    setPriceTiers([]);
    setQuantitySlabs([]);
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    if (imageInputRef.current) imageInputRef.current.value = '';
    fetchNextBarcode();
    keepForNextRef.current = false;
  };

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
  const getCroppedBlob = (image: HTMLImageElement, crop: Crop): Promise<Blob> => {
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    canvas.width = crop.width;
    canvas.height = crop.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(
      image,
      crop.x * scaleX, crop.y * scaleY,
      crop.width * scaleX, crop.height * scaleY,
      0, 0,
      crop.width, crop.height
    );
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas is empty')), 'image/jpeg', 0.95);
    });
  };
  const handleAdditionalImagesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setIsImageCompressing(true);
    try {
      const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1024, useWebWorker: true };
      const compressed = await Promise.all(files.map(f => imageCompression(f, options)));
      setAdditionalImageFiles(prev => [...prev, ...compressed]);
      setAdditionalImagePreviews(prev => [...prev, ...compressed.map(f => URL.createObjectURL(f))]);
    } catch {
      setModal({ message: 'Failed to process one or more images.', type: State.ERROR });
    } finally {
      setIsImageCompressing(false);
    }
  };

  const removeAdditionalImage = (idx: number) => {
    setAdditionalImageFiles(prev => prev.filter((_, i) => i !== idx));
    setAdditionalImagePreviews(prev => prev.filter((_, i) => i !== idx));
  };
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show crop modal first before compressing
    const objectUrl = URL.createObjectURL(file);
    pendingRawFile.current = file;
    setRawImageSrc(objectUrl);
    setCrop(undefined);
    setCompletedCrop(null);
    setShowCropModal(true);
  };

  const handleCropConfirm = async () => {
    if (!imgRef.current || !completedCrop || completedCrop.width === 0 || completedCrop.height === 0) {
      // No crop selected — use original file
      if (!pendingRawFile.current) return;
      applyCompression(pendingRawFile.current);
      setShowCropModal(false);
      return;
    }

    try {
      const croppedBlob = await getCroppedBlob(imgRef.current, completedCrop);
      const croppedFile = new File([croppedBlob], pendingRawFile.current?.name || 'cropped.jpg', { type: 'image/jpeg' });
      await applyCompression(croppedFile);
    } catch {
      setModal({ message: 'Failed to crop image.', type: State.ERROR });
    } finally {
      setShowCropModal(false);
    }
  };

  const applyCompression = async (file: File) => {
    setIsImageCompressing(true);
    try {
      const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1024, useWebWorker: true };
      const compressedFile = await imageCompression(file, options);
      setImageFile(compressedFile);
      setImagePreview(URL.createObjectURL(compressedFile));
    } catch {
      setModal({ message: 'Failed to compress image.', type: State.ERROR });
    } finally {
      setIsImageCompressing(false);
    }
  };

  const handleImageLoaded = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    // Default to a centered square crop
    const centeredCrop = centerCrop(
      makeAspectCrop({ unit: '%', width: 80 }, 1, width, height),
      width, height
    );
    setCrop(centeredCrop);
  };
  const addPriceTier = () => {
    setPriceTiers(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label: '',
        quantity: 1,
        mrp: 0,
        salesPrice: 0,
        purchasePrice: 0,
        discount: 0,
        purchasediscount: 0,
        barcode: '',
      },
    ]);
  };

  const updatePriceTier = (id: string, field: keyof PriceTier, value: string | number) => {
    setPriceTiers(prev =>
      prev.map(t => (t.id === id ? { ...t, [field]: value } : t))
    );
  };

  const removePriceTier = (id: string) => {
    setPriceTiers(prev => prev.filter(t => t.id !== id));
  };

  const addQuantitySlab = () => {
    setQuantitySlabs(prev => {
      // Auto-suggest next "From Qty" = previous "To Qty" + 1
      const last = prev[prev.length - 1];
      const nextMin = prev.length === 0 ? 1 : (last.maxQty !== null ? last.maxQty + 1 : last.minQty + 1);
      return [
        ...prev,
        { id: crypto.randomUUID(), minQty: nextMin, maxQty: null, salesPrice: 0 },
      ];
    });
  };

  const updateQuantitySlab = (id: string, field: 'minQty' | 'maxQty' | 'salesPrice', raw: string) => {
    setQuantitySlabs(prev =>
      prev.map(s => {
        if (s.id !== id) return s;
        if (field === 'maxQty') return { ...s, maxQty: raw === '' ? null : (parseInt(raw, 10) || 0) };
        if (field === 'minQty') return { ...s, minQty: parseInt(raw, 10) || 0 };
        return { ...s, salesPrice: parseFloat(raw) || 0 };
      })
    );
  };

  const removeQuantitySlab = (id: string) => {
    setQuantitySlabs(prev => prev.filter(s => s.id !== id));
  };
  const handleAddItem = async () => {
    if (!dbOperations || !currentUser || !itemSettings) {
      setModal({ message: 'App not ready.', type: State.ERROR }); return;
    }
    setError(null); setSuccess(null); setModal(null);
    if (!itemName.trim()) {
      setModal({ message: 'Item Name is required.', type: State.ERROR }); return;
    }

    if (itemSettings.requireBarcode && !itemBarcode.trim()) {
      setModal({ message: 'Barcode is required.', type: State.ERROR }); return;
    }

    const mrpValue = parseFloat(itemMRP) || 0;
    const saleValue = parseFloat(itemSalesPrice) || 0;
    const purchaseValue = parseFloat(itemPurchasePrice) || 0;

    if (mrpValue === 0 && saleValue === 0) {
      setModal({ message: 'Please enter either MRP or Sales Price.', type: State.ERROR }); return;
    }
    // Only validate/save tiers when the feature is enabled in settings
    const activeTiers = itemSettings.enablePriceTiers ? priceTiers : [];

    // Validate price tiers
    for (const tier of activeTiers) {
      if (!tier.label.trim()) {
        setModal({ message: 'Every pricing option needs a label (e.g. "Box of 10").', type: State.ERROR });
        return;
      }
      if (!tier.quantity || tier.quantity <= 0) {
        setModal({ message: `Pricing option "${tier.label}" needs a valid quantity.`, type: State.ERROR });
        return;
      }
      if (tier.mrp === 0 && tier.salesPrice === 0) {
        setModal({ message: `Pricing option "${tier.label}" needs either MRP or Sales Price.`, type: State.ERROR });
        return;
      }
    }

    // Check duplicate tier barcodes don't collide with each other or main barcode
    const allTierBarcodes = activeTiers.map(t => t.barcode?.trim()).filter(Boolean);
    if (new Set(allTierBarcodes).size !== allTierBarcodes.length) {
      setModal({ message: 'Two pricing options cannot share the same barcode.', type: State.ERROR });
      return;
    }
    if (allTierBarcodes.includes(itemBarcode.trim())) {
      setModal({ message: 'A pricing option barcode cannot be the same as the item barcode.', type: State.ERROR });
      return;
    }

    // Quantity slabs (volume pricing) — only when enabled in settings
    const activeSlabs = (itemSettings as any).enableQuantitySlabs ? quantitySlabs : [];
    if (activeSlabs.length > 0 && activeTiers.length > 0) {
      setModal({ message: 'Use either Pricing Options or Quantity Pricing, not both.', type: State.ERROR });
      return;
    }
    const slabError = validateQuantitySlabs(activeSlabs, mrpValue);
    if (slabError) {
      setModal({ message: slabError, type: State.ERROR });
      return;
    }
    if (mrpValue > 0 && saleValue > 0 && saleValue > mrpValue) {
      setModal({ message: 'Sales Price cannot be greater than MRP', type: State.ERROR }); return;
    }

    if (itemSettings.requireImage && !imageFile && !imageUrl.trim()) {
      setModal({ message: 'Product Image is required.', type: State.ERROR }); return;
    }
    if (itemSettings.requireCategory && selectedCategories.length === 0) {
      setModal({ message: 'Category is required.', type: State.ERROR }); return;
    }
    if (itemSettings.requirePurchasePrice && !itemPurchasePrice.trim()) {
      setModal({ message: 'Purchase Price is required.', type: State.ERROR }); return;
    }
    if (itemSettings.requireSaleDiscount && !itemDiscount.trim()) {
      setModal({ message: 'Sale Discount is required.', type: State.ERROR }); return;
    }
    if (itemSettings.requirePurchaseDiscount && !PurchaseDiscount.trim()) {
      setModal({ message: 'Purchase Discount is required.', type: State.ERROR }); return;
    }
    if (itemSettings.requireDiscount && !itemDiscount.trim() && !PurchaseDiscount.trim()) {
      setModal({ message: 'Discount is required.', type: State.ERROR }); return;
    }
    if (itemSettings.requireTax && !itemTax.trim()) {
      setModal({ message: 'Tax is required.', type: State.ERROR }); return;
    }
    if (itemSettings.requireHsnCode && !hsnCode.trim()) {
      setModal({ message: 'HSN Code is required.', type: State.ERROR }); return;
    }
    if (itemSettings.requireStock && !itemAmount.trim()) {
      setModal({ message: 'Opening Stock is required.', type: State.ERROR }); return;
    }
    if (itemSettings.requireRestockQuantity && !restockQuantity.trim()) {
      setModal({ message: 'Restock Level is required.', type: State.ERROR }); return;
    }
    if (itemSettings.requireMoq && !moq.trim()) {
      setModal({ message: 'MOQ is required.', type: State.ERROR }); return;
    }
    if (itemSettings.requireUnit && !itemUnit.trim()) {
      setModal({ message: 'Unit is required.', type: State.ERROR }); return;
    }

    if (itemUnit === 'pkt' && (!packetSize.trim() || parseInt(packetSize, 10) <= 0)) {
      setModal({ message: 'Please enter a valid quantity for the Packet.', type: State.ERROR }); return;
    }

    let finalSaleDiscount = parseFloat(itemDiscount) || 0;
    let finalPurchaseDiscount = parseFloat(PurchaseDiscount) || 0;
    if (mrpValue > 0 && purchaseValue > 0) finalPurchaseDiscount = 0;

    // --- FIX: Fallback to auto-generated barcode if input is empty ---
    const finalBarcode = itemBarcode.trim() || fetchedAutoBarcode;

    // --- STRICT BLOCK: Absolutely no empty strings allowed ---
    if (!finalBarcode) {
      setModal({ message: 'Barcode is required and cannot be empty.', type: State.ERROR });
      return;
    }

    setIsSaving(true);

    try {
      const itemsRef = collection(db, 'companies', currentUser.companyId, 'items');
      const q = query(itemsRef, where('barcode', '==', finalBarcode), limit(1));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const existingDoc = snapshot.docs[0].data();
        if (!existingDoc.isDeleted && !existingDoc.deleted) {
          setModal({ message: `Barcode ${finalBarcode} already exists.`, type: State.ERROR });
          setIsSaving(false);
          return;
        }
      }

      let currentMultiplier = 1;
      if (itemUnit === 'box') currentMultiplier = 10;
      if (itemUnit === 'doz') currentMultiplier = 12;
      if (itemUnit === 'qt') currentMultiplier = 100;
      if (itemUnit === 'ton') currentMultiplier = 1000;
      if (itemUnit === 'pkt') currentMultiplier = parseInt(packetSize, 10) || 1;

      let finalUploadedImageUrl = null;
      if (imageFile) {
        const storageRef = ref(storage, `companies/${currentUser.companyId}/items/${finalBarcode}_${Date.now()}`);
        await uploadBytes(storageRef, imageFile);
        finalUploadedImageUrl = await getDownloadURL(storageRef);
      } else if (imageUrl.trim()) {
        finalUploadedImageUrl = formatImageUrl(imageUrl);
      }

      const additionalUploadedUrls: string[] = [];
      for (const file of additionalImageFiles) {
        const extraRef = ref(storage, `companies/${currentUser.companyId}/items/${finalBarcode}_extra_${Date.now()}_${Math.random().toString(36).slice(2)}`);
        await uploadBytes(extraRef, file);
        additionalUploadedUrls.push(await getDownloadURL(extraRef));
      }

      const newItemData: any = {
        name: itemName.trim(),
        mrp: mrpValue,
        salesPrice: saleValue,
        purchasePrice: purchaseValue,
        discount: finalSaleDiscount,
        purchasediscount: finalPurchaseDiscount,
        tax: parseFloat(itemTax) || 0,
        hsnSac: hsnCode.trim(),
        description: itemDescription.trim(),
        itemGroupId: selectedCategories[0] || '',
        itemGroupIds: selectedCategories,
        stock: parseInt(itemAmount, 10) || 0,
        amount: parseInt(itemAmount, 10) || 0,
        barcode: finalBarcode,
        restockQuantity: parseInt(restockQuantity, 10) || 0,
        moq: parseInt(moq, 10) || 1,
        unit: itemUnit.trim(),
        unitMultiplier: currentMultiplier,
        packetSize: itemUnit === 'pkt' ? parseInt(packetSize, 10) : null,
        imageUrl: finalUploadedImageUrl,
        imageUrls: [finalUploadedImageUrl, ...additionalUploadedUrls].filter((u): u is string => Boolean(u)),
        isDeleted: false,
        variants: itemVariants,
        priceTiers: activeTiers,
        quantitySlabs: [...activeSlabs].sort((a, b) => a.minQty - b.minQty),
      };

      await dbOperations.createItem(newItemData, finalBarcode);

      if (finalBarcode === fetchedAutoBarcode) {
        const counterRef = doc(db, 'companies', currentUser.companyId, 'counters', 'items');
        await runTransaction(db, async (transaction) => {
          const counterDoc = await transaction.get(counterRef);
          const currentDBSeq = counterDoc.exists() ? (counterDoc.data().currentSequence || 1000) : 1000;
          transaction.set(counterRef, { currentSequence: currentDBSeq + 1 }, { merge: true });
        });
      }

      // NEW: modal mode — hand the created item back to the caller (e.g. Purchase page) and stop here
      if (isModal && onItemCreated) {
        onItemCreated({ ...newItemData, id: finalBarcode });
        setIsSaving(false);
        return;
      }

      setSuccess(`Item "${itemName}" added!`);
      resetForm();
      requestAnimationFrame(() => {
        successBannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      setTimeout(() => setSuccess(null), 30000);

    } catch (err: any) {
      setError('Failed to add item.');
      setModal({ message: err.message, type: State.ERROR });
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setShowImportModal(true); // Open the modal instead of uploading right away
  };

  const executeImport = async () => {
    if (!pendingFile || !dbOperations || !currentUser || !itemSettings || !currentUser.companyId) return;

    setShowImportModal(false);
    setIsUploading(true);
    setUploadProgress(null);
    setError(null); setSuccess(null); setModal(null);

    try {
      const arrayBuffer = await pendingFile.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);

      const worksheet = workbook.worksheets[0];
      if (!worksheet) throw new Error("Excel file is empty.");

      const images = worksheet.getImages();
      const rowImageMap = new Map<number, any>();
      for (const image of images) {
        const rowIndex = image.range.tl.row;
        const imgData = workbook.getImage(Number(image.imageId));
        rowImageMap.set(rowIndex, imgData);
      }

      let headerRowNum = 1;
      for (let r = 1; r <= Math.min(worksheet.rowCount, 15); r++) {
        const firstCell = worksheet.getRow(r).getCell(1).text?.trim().toLowerCase();
        if (firstCell && (firstCell.includes('item name') || firstCell === 'name')) {
          headerRowNum = r;
          break;
        }
      }
      const dataStartRow = headerRowNum + 2;

      // --- HELPER FIX: Extracted to ensure total count perfectly matches loop evaluation ---
      const safeGetVal = (rowObj: any, colIdx: number) => {
        const val = rowObj.getCell(colIdx).value;
        if (val === null || val === undefined) return "";
        if (typeof val === 'object' && 'hyperlink' in val) return (val.hyperlink || val.text || "").toString().trim();
        if (typeof val === 'object' && 'richText' in val) return val.richText.map((rt: any) => rt.text).join('').trim();
        return val.toString().trim();
      };

      let processedCount = 0, createdCount = 0, updatedCount = 0, failedCount = 0, skippedCount = 0;
      let totalItems = 0;
      // Breaks down WHY rows failed, since "missing prices or Name" was a
      // catch-all covering several unrelated validation rules — makes the
      // actual rejection reason visible instead of a single opaque count.
      const failReasons = { missingPrice: 0, invalidPricing: 0, purchasePriceRequired: 0, unknownLocation: 0, negativeValue: 0, other: 0 };

      for (let r = dataStartRow; r <= worksheet.rowCount; r++) {
        const name = safeGetVal(worksheet.getRow(r), 1);
        if (name && !name.toLowerCase().includes('full product name')) totalItems++;
      }
      setUploadProgress({ current: 0, total: totalItems });

      let currentGroups = await dbOperations.getItemGroups();
      const groupMap = new Map<string, string>();
      currentGroups.forEach(g => groupMap.set(g.name.toLowerCase().trim(), g.id!));
      // Maps a "Location" cell value (godown name) to its godown id.
      // "Shop" / blank always means item.stock — never a godown.
      const godownNameMapImport = new Map<string, string>();
      godowns.forEach(g => godownNameMapImport.set(g.name.toLowerCase().trim(), g.id));
      const allExistingItems = await dbOperations.syncItems();
      const itemMapByBarcode = new Map<string, any>();
      const itemMapByName = new Map<string, any>();

      allExistingItems.forEach(item => {
        if (item.barcode) itemMapByBarcode.set(item.barcode.trim(), item);
        if (item.name) itemMapByName.set(item.name.toLowerCase().trim(), item);
      });

      // Only peek at the counter here — do NOT reserve/increment it yet.
      // The DB counter must move only by the number of barcodes that end up
      // actually attached to successfully created items, so the real
      // increment happens once at the end of the import based on that count.
      let nextSeqNumber = 0;
      if (importMode === 'create_update') {
        const counterRef = doc(db, 'companies', currentUser.companyId, 'counters', 'items');
        const counterSnap = await getDoc(counterRef);
        const lastSeq = counterSnap.exists() ? (counterSnap.data().currentSequence || 1000) : 1000;
        nextSeqNumber = lastSeq + 1;
      }
      let barcodesUsed = 0;

      for (let rowNum = dataStartRow; rowNum <= worksheet.rowCount; rowNum++) {
        const row = worksheet.getRow(rowNum);
        const rawName = safeGetVal(row, 1);
        if (!rawName || rawName.toLowerCase().includes('full product name')) continue;

        await new Promise(resolve => setTimeout(resolve, 0));
        setUploadProgress({ current: processedCount + 1, total: totalItems });

        const rowBarcodeStr = safeGetVal(row, 2);
        let rowMRP = parseFloat(safeGetVal(row, 3)) || 0;
        let rowSale = parseFloat(safeGetVal(row, 4)) || 0;
        const rowPurchase = parseFloat(safeGetVal(row, 5)) || 0;
        const rowSaleDiscount = parseFloat(safeGetVal(row, 6)) || 0;
        const rowPurchaseDiscount = parseFloat(safeGetVal(row, 7)) || 0;
        const rowTax = parseFloat(safeGetVal(row, 8)) || 0;
        const rowHsn = safeGetVal(row, 9);
        let csvCategoryValue = safeGetVal(row, 10);

        if (csvCategoryValue && ['uncategorized', 'none', 'n/a', 'null'].includes(csvCategoryValue.toLowerCase())) {
          csvCategoryValue = "";
        }

        const stockVal = parseInt(safeGetVal(row, 11)) || 0;
        const rowLocationStr = safeGetVal(row, 12);
        const rowRestock = parseInt(safeGetVal(row, 13)) || 0;
        const rowMoq = parseInt(safeGetVal(row, 14)) || 1;
        const rowImageUrlStr = safeGetVal(row, 15);
        const rowDescription = safeGetVal(row, 16);
        // Resolve the Location cell. Blank or "Shop" (case-insensitive) → item.stock.
        // Otherwise must match an existing godown name exactly (case-insensitive).
        const trimmedLocation = rowLocationStr.trim().toLowerCase();
        const isShopLocation = !trimmedLocation || trimmedLocation === SHOP_NAME.toLowerCase();
        const targetGodownId = !isShopLocation ? godownNameMapImport.get(trimmedLocation) : undefined;

        // Looked up early (moved ahead of price validation below) so a blank
        // price cell on a row that matches an existing item — e.g. a report
        // export re-uploaded to update stock/other fields — can fall back to
        // that item's current price instead of being rejected outright. Only
        // genuinely new items (no existing match) are held to "must supply a
        // price" below.
        let existingItem = null;
        if (rowBarcodeStr && itemMapByBarcode.has(rowBarcodeStr)) {
          existingItem = itemMapByBarcode.get(rowBarcodeStr);
        } else if (itemMapByName.has(rawName.toLowerCase())) {
          existingItem = itemMapByName.get(rawName.toLowerCase());
        }

        if (rowMRP === 0 && rowSale === 0 && existingItem) {
          rowMRP = existingItem.mrp || 0;
          rowSale = existingItem.salesPrice || 0;
        }

        // --- STRICT VALIDATION FIX ---
        // Catches bad data early and increments fail count properly
        let rowIsValid = true;
        if (rowMRP === 0 && rowSale === 0) { rowIsValid = false; failReasons.missingPrice++; } // Missing prices
        else if (rowMRP > 0 && rowSale > 0 && rowSale > rowMRP) { rowIsValid = false; failReasons.invalidPricing++; } // Invalid pricing
        else if (itemSettings.requirePurchasePrice && rowPurchase <= 0) { rowIsValid = false; failReasons.purchasePriceRequired++; }
        else if (trimmedLocation && !isShopLocation && !targetGodownId) { rowIsValid = false; failReasons.unknownLocation++; } // Unknown Location name

        // --- NEGATIVE VALUE GUARD ---
        // Only checks MRP/Sale/Purchase price and their discounts — the
        // fields that genuinely can't be negative. Stock, tax, restock
        // level, and MOQ are deliberately NOT checked here: this app allows
        // negative stock (e.g. a sale recorded before its matching purchase
        // entry), and a report export of such an item legitimately carries
        // that negative figure through; rejecting the row would block every
        // other field on it from being updated too.
        if (
          rowIsValid && (
            rowMRP < 0 ||
            rowSale < 0 ||
            rowPurchase < 0 ||
            rowSaleDiscount < 0 ||
            rowPurchaseDiscount < 0
          )
        ) {
          rowIsValid = false;
          failReasons.negativeValue++;
        }

        if (!rowIsValid) {
          failedCount++;
          processedCount++;
          continue;
        }

        let targetGroupId = "";
        if (csvCategoryValue && (importMode === 'create_update' || updateFields.category)) {
          const categoryLower = csvCategoryValue.toLowerCase();
          if (groupMap.has(categoryLower)) {
            targetGroupId = groupMap.get(categoryLower)!;
          } else {
            try {
              const newGroupId = await dbOperations.createItemGroup({ name: csvCategoryValue, description: 'Auto-created via Bulk Import' });
              if (typeof newGroupId === 'string') {
                groupMap.set(categoryLower, newGroupId);
                targetGroupId = newGroupId;
              }
            } catch (e) { /* fallback */ }
          }
        }

        let finalUploadedImageUrl = null;
        const embeddedImageData = rowImageMap.get(rowNum - 1);

        if (embeddedImageData) {
          try {
            const tempBarcode = rowBarcodeStr || String(nextSeqNumber);
            const imageBlob = new Blob([embeddedImageData.buffer], { type: `image/${embeddedImageData.extension}` });
            const storageRef = ref(storage, `companies/${currentUser.companyId}/items/${tempBarcode}_${Date.now()}.${embeddedImageData.extension}`);
            await uploadBytes(storageRef, imageBlob);
            finalUploadedImageUrl = await getDownloadURL(storageRef);
          } catch (uploadErr) {
            console.error("Firebase Image Upload Failed:", uploadErr);
          }
        } else if (rowImageUrlStr) {
          finalUploadedImageUrl = formatImageUrl(rowImageUrlStr);
        }

        if (importMode === 'update_only') {
          if (!existingItem) {
            skippedCount++;
            processedCount++;
            continue;
          }

          const updates: any = {};
          if (updateFields.name) updates.name = rawName;
          if (updateFields.mrp) updates.mrp = rowMRP;
          if (updateFields.salesPrice) updates.salesPrice = rowSale;
          if (updateFields.purchasePrice) updates.purchasePrice = rowPurchase;
          if (updateFields.stock) {
            if (targetGodownId) {
              // Godown stock lives in a map — dot-path key updates just that bucket,
              // leaving Shop stock and other godowns untouched.
              updates[`godownStock.${targetGodownId}`] = stockVal;
            } else {
              updates.stock = stockVal;
              updates.amount = stockVal;
            }
          }
          if (updateFields.category && targetGroupId) {
            updates.itemGroupId = targetGroupId;
            updates.itemGroupIds = [targetGroupId];
          }
          if (updateFields.discount) { updates.discount = rowSaleDiscount; updates.purchasediscount = rowPurchaseDiscount; }
          if (finalUploadedImageUrl) updates.imageUrl = finalUploadedImageUrl;
          if (updateFields.tax) updates.tax = rowTax;
          if (updateFields.hsnCode) updates.hsnSac = rowHsn;
          if (updateFields.restockQuantity) updates.restockQuantity = rowRestock;
          if (updateFields.moq) updates.moq = rowMoq;
          if (updateFields.description) updates.description = rowDescription;

          try {
            await dbOperations.updateItem(existingItem.id, updates);
            updatedCount++;
          } catch (e) {
            failedCount++;
            failReasons.other++;
          }

        } else {
          let finalRowBarcode = rowBarcodeStr;
          let usedAutoBarcode = false;

          if (!existingItem && !finalRowBarcode) {
            finalRowBarcode = String(nextSeqNumber);
            nextSeqNumber++;
            usedAutoBarcode = true;
          } else if (existingItem) {
            finalRowBarcode = existingItem.barcode;
          }
          // Decide where the stockVal quantity actually lands:
          // - No godown match → Shop (item.stock), same as before this feature.
          // - Godown match + brand-new item → item.stock starts at 0, all opening
          //   stock goes into godownStock.
          // - Godown match + existing item → Shop stock is left completely untouched;
          //   only that godown's bucket is bumped via a dot-path key.
          let stockFieldValue = stockVal;
          let amountFieldValue = stockVal;
          let includeStockFields = true;
          const godownUpdatePatch: Record<string, any> = {};

          if (targetGodownId) {
            if (existingItem) {
              includeStockFields = false;
              godownUpdatePatch[`godownStock.${targetGodownId}`] = stockVal;
            } else {
              stockFieldValue = 0;
              amountFieldValue = 0;
              godownUpdatePatch.godownStock = { [targetGodownId]: stockVal };
            }
          }
          const itemData: any = {
            name: rawName,
            mrp: rowMRP,
            salesPrice: rowSale,
            purchasePrice: rowPurchase,
            discount: rowSaleDiscount,
            purchasediscount: rowPurchaseDiscount,
            tax: rowTax,
            hsnSac: rowHsn,
            itemGroupId: targetGroupId || '',
            itemGroupIds: targetGroupId ? [targetGroupId] : [],
            ...(includeStockFields ? { stock: stockFieldValue, amount: amountFieldValue } : {}),
            ...godownUpdatePatch,
            stock: stockVal,
            amount: stockVal,
            barcode: finalRowBarcode,
            restockQuantity: rowRestock,
            moq: rowMoq,
            description: rowDescription || (existingItem ? existingItem.description : ''),
            imageUrl: finalUploadedImageUrl || (existingItem ? existingItem.imageUrl : null),
            isDeleted: false,
          };

          try {
            if (existingItem) {
              await dbOperations.updateItem(existingItem.id, itemData);
              updatedCount++;
            } else {
              await dbOperations.createItem(itemData, finalRowBarcode);
              createdCount++;
              if (usedAutoBarcode) barcodesUsed++;

              // --- MAP UPDATE FIX ---
              // Add newly created items to the maps immediately.
              // If there are duplicate barcodes in the same Excel sheet, the next one will trigger an update rather than an overwrite.
              const newItemObj = { ...itemData, id: finalRowBarcode };
              itemMapByBarcode.set(finalRowBarcode, newItemObj);
              itemMapByName.set(rawName.toLowerCase(), newItemObj);
            }
          } catch (e) {
            failedCount++;
            failReasons.other++;
          }
        }
        processedCount++;
      }

      if (barcodesUsed > 0) {
        await reserveSequenceBlock(barcodesUsed);
      }

      await fetchGroups();
      await fetchNextBarcode(true);

      if (failedCount > 0) {
        // Break down WHY rows failed instead of a single opaque count — the
        // old message ("missing prices or Name") lumped together several
        // unrelated validation rules and made real causes invisible.
        const reasonParts: string[] = [];
        if (failReasons.missingPrice > 0) reasonParts.push(`${failReasons.missingPrice} missing both MRP & Sales Price`);
        if (failReasons.invalidPricing > 0) reasonParts.push(`${failReasons.invalidPricing} Sales Price higher than MRP`);
        if (failReasons.purchasePriceRequired > 0) reasonParts.push(`${failReasons.purchasePriceRequired} missing Purchase Price`);
        if (failReasons.unknownLocation > 0) reasonParts.push(`${failReasons.unknownLocation} unknown Location`);
        if (failReasons.negativeValue > 0) reasonParts.push(`${failReasons.negativeValue} negative values`);
        if (failReasons.other > 0) reasonParts.push(`${failReasons.other} save errors`);
        setModal({ message: `Imported with errors. ${failedCount} rows failed: ${reasonParts.join(', ')}.`, type: State.ERROR });
      } else {
        setSuccess(`Completed: ${createdCount} New, ${updatedCount} Updated, ${skippedCount} Skipped.`);
      }
      setTimeout(() => setSuccess(null), 10000);

    } catch (err: any) {
      setError("File processing failed. Ensure it is a valid Excel file.");
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleBarcodeScanned = (barcode: string) => {
    setItemBarcode(barcode);
    setIsScannerOpen(false);
  };

  const handleDownloadSample = () => {
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

    const COLS = [
      { header: '★ Item Name', note: 'Full product name  e.g. Amul Butter 500g', type: 'R', width: 24, field: 'name' },
      { header: '● Barcode', note: 'Optional (Leave blank to auto-generate)', type: 'O', width: 16, field: 'barcode' },
      { header: '● MRP', note: 'Max Retail Price (₹)  Required if Sale Price blank', type: 'O', width: 13, field: 'mrp' },
      { header: '★ Sales Price', note: 'Selling price (₹)  Required if MRP blank', type: 'R', width: 14, field: 'salesPrice' },
      { header: '● Purchase Price', note: 'Your cost price (₹)', type: 'O', width: 17, field: 'purchasePrice' },
      { header: '● Sale Disc (%)', note: 'Default customer discount  e.g. 5', type: 'O', width: 14, field: 'discount' },
      { header: '● Purchase Disc (%)', note: 'Supplier discount  e.g. 3', type: 'O', width: 16, field: 'purchasediscount' },
      { header: '● Tax (%)', note: 'GST/VAT rate  e.g. 18', type: 'O', width: 10, field: 'tax' },
      { header: '● HSN Code', note: '6-digit HSN / SAC code', type: 'O', width: 13, field: 'hsnCode' },
      { header: '▲ Category', note: 'Group name – new category auto-created', type: 'L', width: 18, field: 'itemGroupId' },
      { header: '● Stock', note: 'Opening stock quantity', type: 'O', width: 10, field: 'stock' },
      { header: '▲ Location', note: `"${SHOP_NAME}" or exact godown name  Leave blank for ${SHOP_NAME}`, type: 'L', width: 18, field: 'location' },
      { header: '● Restock Level', note: 'Alert when stock falls below this', type: 'O', width: 15, field: 'restockQuantity' },
      { header: '● MOQ', note: 'Minimum Order Quantity', type: 'O', width: 10, field: 'moq' },
      { header: '● Image URL', note: 'Web link to image (Optional)', type: 'O', width: 25, field: 'imageUrl' },
      { header: '● Description', note: 'Product details shown on Catalogue page', type: 'O', width: 30, field: 'description' },
    ];

    const TYPE_STYLE: Record<string, { bg: string; txt: string }> = {
      R: { bg: 'FEE2E2', txt: 'DC2626' },
      O: { bg: 'DCFCE7', txt: '15803D' },
      L: { bg: 'E0F2FE', txt: '0369A1' },
    };

    const colCount = COLS.length;
    const legendRows = [
      { bg: 'FEE2E2', txt: 'DC2626', marker: '★  Required', desc: 'Must be filled in – item will be skipped if missing' },
      { bg: 'DCFCE7', txt: '15803D', marker: '●  Optional', desc: 'Improves data quality; leave blank if not applicable' },
      { bg: 'E0F2FE', txt: '0369A1', marker: '▲  Lookup', desc: 'Accepts text name; new categories created automatically' },
    ];

    const sampleRows = [
      ['Amul Butter 500g', '', 250, 240, 190, 0, 2, 5, '0402', 'Dairy', 50, SHOP_NAME, 10, 1, 'https://example.com/amul.jpg', 'Fresh Amul butter, 500g pack, ideal for baking and spreads.'],
      ['Parle-G Biscuit', '1002', 10, 10, 7, 0, 0, 0, '', 'Snacks', 200, '', 20, 10, '', 'Classic glucose biscuits, pack of 10.'],
    ];

    const totalRows = 12;
    const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

    aoa[0][0] = 'SELLAR  ·  Bulk Item Import Template';
    aoa[1][0] = 'Fill in the rows below and upload this file in Sellar → Items → Bulk Import. Do NOT rename column headers. You can embed images into rows or paste links.';
    aoa[3][0] = 'LEGEND';
    legendRows.forEach((l, i) => {
      aoa[4 + i][0] = l.marker;
      aoa[4 + i][1] = l.desc;
    });

    COLS.forEach((c, i) => { aoa[8][i] = c.header; });
    COLS.forEach((c, i) => { aoa[9][i] = c.note; });
    sampleRows.forEach((row, ri) => {
      row.forEach((val, ci) => { aoa[10 + ri][ci] = val; });
    });

    const ws: any = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = COLS.map(c => ({ wch: c.width }));
    ws['!rows'] = [
      { hpt: 34 }, { hpt: 24 }, { hpt: 8 }, { hpt: 20 }, { hpt: 18 }, { hpt: 18 }, { hpt: 8 }, { hpt: 30 }, { hpt: 22 }, { hpt: 18 }, { hpt: 18 },
    ];

    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: colCount - 1 } },
      ...legendRows.map((_, i) => ({ s: { r: 4 + i, c: 1 }, e: { r: 4 + i, c: 3 } })),
    ];

    const style = (addr: string, st: any) => {
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      ws[addr].s = st;
    };

    style('A1', s({ sz: 15, bold: true, color: { rgb: 'FFFFFF' } }, solidFill('0369A1'), { horizontal: 'center', vertical: 'center' }));
    style('A2', s({ sz: 9, italic: true, color: { rgb: '475569' } }, solidFill('DBEAFE'), { horizontal: 'center', vertical: 'center', wrapText: true }));
    style('A4', s({ sz: 10, bold: true, color: { rgb: '0369A1' } }, solidFill('E0F2FE'), { horizontal: 'left', vertical: 'center' }, allBorders));

    legendRows.forEach((l, i) => {
      const row = 5 + i;
      style(`A${row}`, s({ sz: 9, bold: true, color: { rgb: l.txt } }, solidFill(l.bg), { horizontal: 'left', vertical: 'center' }, bblr));
      style(`B${row}`, s({ sz: 9, color: { rgb: '334155' } }, solidFill(l.bg), { horizontal: 'left', vertical: 'center' }, bblr));
      ['C', 'D'].forEach(col => {
        const addr = `${col}${row}`;
        if (!ws[addr]) ws[addr] = { t: 's', v: '' };
        ws[addr].s = s({ sz: 9 }, solidFill(l.bg), {}, bblr);
      });
    });

    COLS.forEach((c, i) => {
      const { bg, txt } = TYPE_STYLE[c.type];
      const addr = XLSX.utils.encode_cell({ r: 8, c: i });
      style(addr, s({ sz: 9, bold: true, color: { rgb: txt } }, solidFill(bg), { horizontal: 'center', vertical: 'center', wrapText: true }, allBorders));
    });

    COLS.forEach((_c, i) => {
      const addr = XLSX.utils.encode_cell({ r: 9, c: i });
      style(addr, s({ sz: 7, italic: true, color: { rgb: '64748B' } }, solidFill('F8FAFC'), { horizontal: 'center', vertical: 'center', wrapText: true }, bblr));
    });

    sampleRows.forEach((row, ri) => {
      const altBg = ri % 2 === 1 ? 'F1F5F9' : 'FFFFFF';
      if (ri === 0) {
        const bAddr = XLSX.utils.encode_cell({ r: 10, c: 1 });
        ws[bAddr] = { t: 's', v: '' };
        ws[bAddr].s = s({ sz: 8, italic: true, color: { rgb: '94A3B8' } }, solidFill(altBg), { horizontal: 'center', vertical: 'center' }, bblr);
      }
      row.forEach((_val, ci) => {
        const addr = XLSX.utils.encode_cell({ r: 10 + ri, c: ci });
        style(addr, s({ sz: 9, color: { rgb: '1E293B' } }, solidFill(altBg), { horizontal: 'center', vertical: 'center' }, bblr));
      });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Items');
    XLSX.writeFile(wb, 'Sellar_Items_Import_Template.xlsx');
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // REPLACE everything from the line `const reqClasses = ...` down to the END of the file
  // (including `export default ItemAdd;`) with this block.
  // All state, handlers, validation, import/export logic above that line stays untouched.
  // ─────────────────────────────────────────────────────────────────────────────

  if (pageIsLoading) return <Spinner />;

  // ---- display-only values for the live preview + margin tile (read from existing state, never written) ----
  const toNum = (v: string) => parseFloat(v) || 0;
  const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const pvMrp = toNum(itemMRP);
  const pvSale = toNum(itemSalesPrice);
  const pvCost = toNum(itemPurchasePrice);
  const pvPrice = pvSale || pvMrp;
  const pvMargin = pvSale > 0 && pvCost > 0 ? pvSale - pvCost : null;
  const pvMarginPct = pvMargin !== null ? Math.round((pvMargin / pvSale) * 100) : null;
  const pvOff = pvMrp > 0 && pvSale > 0 && pvSale < pvMrp ? Math.round(((pvMrp - pvSale) / pvMrp) * 100) : 0;
  const pvStock = parseInt(itemAmount, 10) || 0;
  const pvGroup = itemGroups.find(g => g.id === selectedCategories[0])?.name;
  const pvImg = imagePreview || formatImageUrl(imageUrl);
  const saveDisabled = isSaving || pageIsLoading || (loading && itemGroups.length === 0);

  // small layout helper (plain function, NOT a component — keeps inputs from remounting while typing)
  const fl = (label: React.ReactNode, body: React.ReactNode, o?: { req?: boolean; hint?: React.ReactNode; full?: boolean; div?: boolean }) => {
    const cls = `ai-fl${o?.full ? ' ai-full' : ''}`;
    const inner = (
      <>
        <span className={`ai-lab${o?.req ? ' ai-req' : ''}`}>{label}</span>
        {body}
        {o?.hint && <small className="ai-hint">{o.hint}</small>}
      </>
    );
    return o?.div ? <div className={cls}>{inner}</div> : <label className={cls}>{inner}</label>;
  };

  const cardHead = (icon: keyof typeof AI_ICONS, tint: '' | 'green' | 'amber', title: string, right?: React.ReactNode) => (
    <div className="ai-fs-h">
      <span className={`ai-tint${tint ? ` ai-tint--${tint}` : ''}`}><AiIcon name={icon} /></span>
      <b>{title}</b>
      {right}
    </div>
  );

  const segToggle = (
    <div className="ai-seg" role="group">
      <button onClick={() => navigate(routes.itemAdd)} aria-pressed={isActive(routes.itemAdd)}>Add item</button>
      <button onClick={() => navigate(routes.itemGroup)} aria-pressed={isActive(routes.itemGroup)}>
        Item groups <span className="ai-count">{itemGroups.length}</span>
      </button>
    </div>
  );

  const renderHeader = () => (
    isModal ? (
      <div className="ai-bar ai-bar--modal">
        <h1>Add item</h1>
        <button onClick={onCancel} className="ai-iconbtn" aria-label="Close"><AiIcon name="x" /></button>
      </div>
    ) : (
      <>
        <div className="ai-bar">
          <button type="button" className="ai-iconbtn ai-bar__back" onClick={() => navigate(-1)} aria-label="Back">
            <AiIcon name="back" />
          </button>
          <h1>
            Add item
            <span className="ai-bar__cap">{allItems.length.toLocaleString('en-IN')} items in catalogue</span>
          </h1>
          {segToggle}
          <div className="ai-bar__meta">Items in catalogue: {allItems.length.toLocaleString('en-IN')}</div>
        </div>
        <div className="ai-tabs">{segToggle}</div>
      </>
    )
  );

  return (
    <div className={`ai-root ${isModal ? 'ai-root--modal' : 'ai-root--page'}${theme === 'orange' ? ' ai-orange' : ''}`}>
      <style>{ADD_ITEM_CSS}</style>

      <BarcodeScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleBarcodeScanned} />
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

      {/* hidden Excel input — single instance, used by the mobile card and the desktop panel */}
      {!isModal && (
        <input type="file" ref={fileInputRef} onChange={handleFileSelected} className="hidden" style={{ display: 'none' }} accept=".xlsx, .xls, .csv" />
      )}

      {/* ---------- Upload progress ---------- */}
      {uploadProgress && (
        <div className="ai-overlay">
          <div className="ai-dialog ai-dialog--sm">
            <h3>Uploading items…</h3>
            <div className="ai-meter">
              <div style={{ width: `${uploadProgress.total ? (uploadProgress.current / uploadProgress.total) * 100 : 0}%` }} />
            </div>
            <p style={{ fontVariantNumeric: 'tabular-nums' }}>{uploadProgress.current} / {uploadProgress.total} processed</p>
          </div>
        </div>
      )}

      {/* ---------- Crop ---------- */}
      {showCropModal && rawImageSrc && (
        <div className="ai-overlay">
          <div className="ai-dialog">
            <h2>Crop image</h2>
            <p>Drag to select the area you want to keep. Choose <strong>Use full image</strong> to skip cropping.</p>
            <div className="ai-cropwrap">
              <ReactCrop
                crop={crop}
                onChange={(c) => setCrop(c)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={undefined}
              >
                <img
                  ref={imgRef}
                  src={rawImageSrc}
                  alt="Crop preview"
                  onLoad={handleImageLoaded}
                  style={{ maxWidth: '100%', objectFit: 'contain' }}
                />
              </ReactCrop>
            </div>
            <div className="ai-dialog__f">
              <button
                className="ai-btn ai-btn--ghost"
                onClick={() => { setShowCropModal(false); pendingRawFile.current = null; if (imageInputRef.current) imageInputRef.current.value = ''; }}
              >
                Cancel
              </button>
              <button
                className="ai-btn ai-btn--secondary"
                onClick={async () => { if (pendingRawFile.current) await applyCompression(pendingRawFile.current); setShowCropModal(false); }}
              >
                Use full image
              </button>
              <button className="ai-btn ai-btn--primary" onClick={handleCropConfirm}>Crop and use</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Bulk import settings ---------- */}
      {showImportModal && (
        <div className="ai-overlay">
          <div className="ai-dialog">
            <h2>Bulk import settings</h2>

            <div style={{ display: 'grid', gap: 8 }}>
              <label className={`ai-opt${importMode === 'create_update' ? ' ai-opt--on' : ''}`}>
                <input type="radio" name="mode" checked={importMode === 'create_update'} onChange={() => setImportMode('create_update')} />
                <div>
                  <b>Add new and update all</b>
                  <small>Creates new items if they don't exist. Fully updates existing items.</small>
                </div>
              </label>
              <label className={`ai-opt${importMode === 'update_only' ? ' ai-opt--on' : ''}`}>
                <input type="radio" name="mode" checked={importMode === 'update_only'} onChange={() => setImportMode('update_only')} />
                <div>
                  <b>Update existing inventory only</b>
                  <small>Skips new items. Matches by barcode or name. Pick the fields to update below.</small>
                </div>
              </label>
            </div>

            {importMode === 'update_only' && (
              <div className="ai-fields">
                <div className="ai-overline" style={{ marginBottom: 8 }}>Fields to update</div>
                <div className="ai-fields__g">
                  {Object.entries(updateFields).map(([key, value]) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={value}
                        onChange={(e) => setUpdateFields(prev => ({ ...prev, [key]: e.target.checked }))}
                      />
                      <span>{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="ai-dialog__f">
              <button
                className="ai-btn ai-btn--ghost"
                onClick={() => { setShowImportModal(false); setPendingFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
              >
                Cancel
              </button>
              <button className="ai-btn ai-btn--primary" onClick={executeImport}>Start import</button>
            </div>
          </div>
        </div>
      )}

      {renderHeader()}

      <div className="ai-work">

        {/* ================= LEFT: FORM ================= */}
        <div className="ai-left">

          {error && <div className="ai-alert ai-alert--danger"><span>{error}</span></div>}

          {success && (
            <div ref={successBannerRef} className="ai-alert ai-alert--success">
              <span>{success}</span>
              <button onClick={() => setSuccess(null)} aria-label="Dismiss"><AiIcon name="x" sm /></button>
            </div>
          )}

          {/* Bulk import — mobile only, hidden in modal mode */}
          {!isModal && (
            <div className="ai-card ai-bulk ai-mobonly">
              <div className="ai-bulk__h">
                <span className="ai-tint"><AiIcon name="doc" /></span>
                <div>
                  <b>Adding many items?</b>
                  <div>Upload an Excel/CSV file.</div>
                </div>
              </div>
              <div className="ai-bulk__btns">
                <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="ai-btn ai-btn--secondary ai-btn--sm">
                  {isUploading ? <Spinner /> : (<><AiIcon name="upload" sm />Import from Excel</>)}
                </button>
                <button type="button" onClick={handleDownloadSample} disabled={isUploading} className="ai-btn ai-btn--ghost ai-btn--sm" style={{ color: 'var(--primary-text)' }}>
                  <AiIcon name="download" sm />Sample
                </button>
              </div>
            </div>
          )}

          {/* ---------- Basic details ---------- */}
          <div className="ai-card">
            {cardHead('tag', 'amber', 'Basic details', <small>Name and price are required</small>)}
            <div className="ai-fs-b" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)' }}>
              <div className="ai-img ai-full">
                <div className="ai-drop" role="button" tabIndex={0} onClick={() => imageInputRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); imageInputRef.current?.click(); } }}>
                  {isImageCompressing ? (
                    <><Spinner /><span>Compressing…</span></>
                  ) : imagePreview ? (
                    <img src={imagePreview} alt="Preview" className="ai-drop__img" />
                  ) : (
                    <><AiIcon name="image" />Add photo</>
                  )}
                </div>
                <input type="file" accept="image/*" ref={imageInputRef} onChange={handleImageChange} style={{ display: 'none' }} />

                <div className="ai-stack">
                  {fl('Item name',
                    <div className="ai-field">
                      <input type="text" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="e.g. Amul butter 500 g" style={{ fontWeight: 600 }} />
                    </div>,
                    { req: true })}
                  {fl('Or paste image URL',
                    <div className={`ai-field${imageFile ? ' ai-field--dis' : ''}`}>
                      <AiIcon name="link" sm />
                      <input type="text" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} disabled={!!imageFile} placeholder="https://example.com/image.jpg" />
                    </div>,
                    { req: !!itemSettings?.requireImage })}
                  {imageFile && (
                    <button className="ai-linkbtn" onClick={() => { setImageFile(null); setImagePreview(null); if (imageInputRef.current) imageInputRef.current.value = ''; }}>
                      Remove selected image
                    </button>
                  )}
                </div>
              </div>

              <div className="ai-full">
                <span className="ai-lab">Additional photos <span style={{ color: 'var(--ink-subtle)', fontWeight: 400 }}>(for catalogue slider)</span></span>
                <div style={{ marginTop: 4 }}>
                  <input type="file" accept="image/*" multiple onChange={handleAdditionalImagesChange} className="ai-file" />
                </div>
                {additionalImagePreviews.length > 0 && (
                  <div className="ai-thumbs">
                    {additionalImagePreviews.map((src, idx) => (
                      <div key={idx} className="ai-thumb">
                        <img src={src} alt="" />
                        <button type="button" onClick={() => removeAdditionalImage(idx)} aria-label="Remove photo"><AiIcon name="x" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {fl('Barcode',
                <div className="ai-field" style={{ paddingRight: 4 }}>
                  <input type="text" value={itemBarcode} onChange={(e) => setItemBarcode(e.target.value)} placeholder="Scan or type" />
                  <button type="button" onClick={() => setIsScannerOpen(true)} className="ai-btn ai-btn--ghost ai-btn--icon ai-btn--sm" aria-label="Scan barcode">
                    <IconScanCircle width={18} height={18} />
                  </button>
                </div>,
                { req: !!itemSettings?.requireBarcode, hint: 'Next free number — change it or scan the pack' })}

              {fl('Unit',
                <div style={{ display: 'grid', gap: 8 }}>
                  <div className="ai-field" style={{ flex: 1 }}>
                    <select value={itemUnit} onChange={(e) => { setItemUnit(e.target.value); if (e.target.value !== 'pkt') setPacketSize(''); }}>
                      {UNIT_OPTIONS.filter(u => u.value !== '').map(unit => (<option key={unit.value} value={unit.value}>{unit.label}</option>))}
                    </select>
                  </div>
                  {itemUnit === 'pkt' && (
                    <div className="ai-field" style={{ flex: 1 }}>
                      <input type="number" value={packetSize} onChange={(e) => setPacketSize(e.target.value)} placeholder="Qty per pkt" min="1" />
                    </div>
                  )}
                </div>,
                { req: !!(itemSettings as any)?.requireUnit, div: true })}
            </div>
          </div>

          {/* ---------- Pricing ---------- */}
          <div className="ai-card">
            {cardHead('doc', '', 'Pricing', <small>Enter MRP or sales price — at least one</small>)}
            <div className="ai-fs-b ai-c3">
              {fl(`MRP (${getUnitLabel()})`,
                <div className="ai-field"><i>₹</i>
                  <input type="number" value={itemMRP} onWheel={(e) => (e.target as HTMLInputElement).blur()} onChange={(e) => setItemMRP(e.target.value)} placeholder="0.00" />
                </div>,
                { hint: 'Printed on the pack' })}
              {fl(`Sales price (${getUnitLabel()})`,
                <div className="ai-field"><i>₹</i>
                  <input type="number" value={itemSalesPrice} onWheel={(e) => (e.target as HTMLInputElement).blur()} onChange={(e) => setItemSalesPrice(e.target.value)} placeholder="0.00" style={{ fontWeight: 600 }} />
                </div>,
                { req: true, hint: 'What the customer pays' })}
              {fl('Purchase price',
                <div className="ai-field"><i>₹</i>
                  <input type="number" value={itemPurchasePrice} onChange={(e) => setItemPurchasePrice(e.target.value)} placeholder="0.00" />
                </div>,
                { req: !!itemSettings?.requirePurchasePrice, hint: 'What you pay the supplier' })}
              {fl('Sale discount',
                <div className="ai-field">
                  <input type="number" value={itemDiscount} onWheel={(e) => (e.target as HTMLInputElement).blur()} onChange={(e) => setItemDiscount(e.target.value)} placeholder="0" />
                  <i>%</i>
                </div>,
                { req: !!itemSettings?.requireSaleDiscount })}
              {fl('Purchase discount',
                <div className="ai-field">
                  <input type="number" value={PurchaseDiscount} onWheel={(e) => (e.target as HTMLInputElement).blur()} onChange={(e) => setPurchaseDiscount(e.target.value)} placeholder="0" />
                  <i>%</i>
                </div>,
                { req: !!itemSettings?.requirePurchaseDiscount })}
              {fl('Your margin',
                <div className={`ai-field ai-margin${pvMargin === null ? ' ai-margin--empty' : pvMargin < 0 ? ' ai-margin--neg' : ''}`}>
                  {pvMargin === null ? (
                    <span>Add both prices</span>
                  ) : (
                    <>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{inr(pvMargin)}</span>
                      <i>{pvMarginPct}% on sales price</i>
                    </>
                  )}
                </div>,
                { div: true, hint: 'Sales price − purchase price' })}
            </div>
          </div>

          {/* ---------- Pricing options (tiers) ---------- */}
          {itemSettings?.enablePriceTiers && (
            <div className="ai-card">
              {cardHead('box', '', 'Pricing options',
                <button
                  type="button"
                  onClick={addPriceTier}
                  disabled={quantitySlabs.length > 0}
                  title={quantitySlabs.length > 0 ? 'Remove Quantity Pricing slabs to use Pricing Options' : ''}
                  className="ai-btn ai-btn--ghost ai-btn--sm"
                  style={{ marginLeft: 'auto', color: 'var(--primary-text)' }}
                >
                  <AiIcon name="plus" sm />Add option
                </button>
              )}
              <div className="ai-fs-b" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
                <span className="ai-hint">e.g. Box of 10, Combo</span>
                {priceTiers.length === 0 ? (
                  <p className="ai-empty" style={{ margin: 0 }}>No extra pricing added. The item will only sell at the single price set above.</p>
                ) : (
                  priceTiers.map((tier) => (
                    <div key={tier.id} className="ai-sub">
                      <button type="button" onClick={() => removePriceTier(tier.id)} className="ai-iconbtn ai-x" aria-label="Remove option"><AiIcon name="x" sm /></button>

                      <div className="ai-g2" style={{ paddingRight: 28 }}>
                        {fl('Label',
                          <div className="ai-field ai-field--sm">
                            <input type="text" value={tier.label} onChange={(e) => updatePriceTier(tier.id, 'label', e.target.value)} placeholder="e.g. Box of 10" />
                          </div>)}
                        {fl(`Quantity (in ${getUnitLabel()})`,
                          <div className="ai-field ai-field--sm">
                            <input type="number" value={tier.quantity} onWheel={(e) => (e.target as HTMLInputElement).blur()} onChange={(e) => updatePriceTier(tier.id, 'quantity', parseInt(e.target.value) || 1)} min="1" placeholder="10" />
                          </div>)}
                      </div>

                      <div className="ai-g3">
                        {fl('MRP',
                          <div className="ai-field ai-field--sm"><i>₹</i>
                            <input type="number" value={tier.mrp} onWheel={(e) => (e.target as HTMLInputElement).blur()} onChange={(e) => updatePriceTier(tier.id, 'mrp', parseFloat(e.target.value) || 0)} placeholder="0.00" />
                          </div>)}
                        {fl('Sales price',
                          <div className="ai-field ai-field--sm"><i>₹</i>
                            <input type="number" value={tier.salesPrice} onWheel={(e) => (e.target as HTMLInputElement).blur()} onChange={(e) => updatePriceTier(tier.id, 'salesPrice', parseFloat(e.target.value) || 0)} placeholder="0.00" />
                          </div>)}
                        {fl('Purchase price',
                          <div className="ai-field ai-field--sm"><i>₹</i>
                            <input type="number" value={tier.purchasePrice} onWheel={(e) => (e.target as HTMLInputElement).blur()} onChange={(e) => updatePriceTier(tier.id, 'purchasePrice', parseFloat(e.target.value) || 0)} placeholder="0.00" />
                          </div>)}
                        {fl('Barcode (optional)',
                          <div className="ai-field ai-field--sm">
                            <input type="text" value={tier.barcode} onChange={(e) => updatePriceTier(tier.id, 'barcode', e.target.value)} placeholder="Scan or type" />
                          </div>)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ---------- Quantity pricing (slabs) ---------- */}
          {(itemSettings as any)?.enableQuantitySlabs && (
            <div className="ai-card">
              {cardHead('box', '', 'Quantity pricing',
                <button
                  type="button"
                  onClick={addQuantitySlab}
                  disabled={priceTiers.length > 0}
                  title={priceTiers.length > 0 ? 'Remove Pricing Options to use Quantity Pricing' : ''}
                  className="ai-btn ai-btn--ghost ai-btn--sm"
                  style={{ marginLeft: 'auto', color: 'var(--primary-text)' }}
                >
                  <AiIcon name="plus" sm />Add slab
                </button>
              )}
              <div className="ai-fs-b" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
                <span className="ai-hint">e.g. 1–10 @ ₹100, 11–20 @ ₹95</span>
                {priceTiers.length > 0 && (
                  <p className="ai-note" style={{ margin: 0 }}>Pricing options are in use. Remove them to add quantity pricing.</p>
                )}
                {quantitySlabs.length === 0 ? (
                  <p className="ai-empty" style={{ margin: 0 }}>No quantity slabs added. The item will always sell at the single price set above.</p>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div className="ai-slab ai-slabhdr">
                      <span className="ai-slabhead">From qty</span>
                      <span className="ai-slabhead">To qty (blank = and above)</span>
                      <span className="ai-slabhead">Price / unit</span>
                      <span />
                    </div>
                    {quantitySlabs.map((slab) => (
                      <div key={slab.id} className="ai-slab">
                        <label className="ai-fl">
                          <span className="ai-slabhead ai-slab__lab">From qty</span>
                          <div className="ai-field ai-field--sm">
                            <input type="number" min="1" value={slab.minQty || ''} onWheel={(e) => (e.target as HTMLInputElement).blur()} onChange={(e) => updateQuantitySlab(slab.id, 'minQty', e.target.value)} placeholder="1" />
                          </div>
                        </label>
                        <label className="ai-fl">
                          <span className="ai-slabhead ai-slab__lab">To qty</span>
                          <div className="ai-field ai-field--sm">
                            <input type="number" min="1" value={slab.maxQty ?? ''} onWheel={(e) => (e.target as HTMLInputElement).blur()} onChange={(e) => updateQuantitySlab(slab.id, 'maxQty', e.target.value)} placeholder="And above" />
                          </div>
                        </label>
                        <label className="ai-fl ai-slab__price">
                          <span className="ai-slabhead ai-slab__lab">Price / unit</span>
                          <div className="ai-field ai-field--sm"><i>₹</i>
                            <input type="number" value={slab.salesPrice || ''} onWheel={(e) => (e.target as HTMLInputElement).blur()} onChange={(e) => updateQuantitySlab(slab.id, 'salesPrice', e.target.value)} placeholder="0.00" />
                          </div>
                        </label>
                        <button type="button" onClick={() => removeQuantitySlab(slab.id)} className="ai-iconbtn ai-slab__x" aria-label="Remove slab"><AiIcon name="x" sm /></button>
                      </div>
                    ))}
                    <p className="ai-hint" style={{ margin: 0 }}>The slab price applies to the whole quantity. Quantities outside all slabs use the base sales price.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ---------- Tax + Stock ---------- */}
          <div className="ai-pair">
            <div className="ai-card">
              {cardHead('doc', '', 'Tax')}
              <div className="ai-fs-b">
                {fl('Tax',
                  <div className="ai-field">
                    <input type="number" value={itemTax} onChange={(e) => setItemTax(e.target.value)} placeholder="0" />
                    <i>%</i>
                  </div>,
                  { req: !!itemSettings?.requireTax })}
                {fl('HSN code',
                  <div className="ai-field">
                    <input type="text" value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} placeholder="e.g. 123456" />
                  </div>,
                  { req: !!itemSettings?.requireHsnCode, hint: 'Needed for GST bills' })}
              </div>
            </div>

            <div className="ai-card">
              {cardHead('box', 'green', 'Stock')}
              <div className="ai-fs-b">
                {fl('Stock',
                  <div className="ai-field">
                    <input type="number" value={itemAmount} onWheel={(e) => (e.target as HTMLInputElement).blur()} onChange={(e) => setItemAmount(e.target.value)} placeholder="0" />
                  </div>,
                  { req: !!itemSettings?.requireStock, hint: 'Opening stock' })}
                {fl('Restock level',
                  <div className="ai-field">
                    <input type="number" onWheel={(e) => (e.target as HTMLInputElement).blur()} value={restockQuantity} onChange={(e) => setRestockQuantity(e.target.value)} placeholder="0" />
                  </div>,
                  { req: !!itemSettings?.requireRestockQuantity, hint: 'Warn me when stock drops to this' })}
                {fl('MOQ',
                  <div className="ai-field">
                    <input type="number" value={moq} onWheel={(e) => (e.target as HTMLInputElement).blur()} onChange={(e) => setMoq(e.target.value)} placeholder="1" />
                  </div>,
                  { req: !!itemSettings?.requireMoq, hint: 'Minimum order quantity' })}
              </div>
            </div>
          </div>

          {/* ---------- Organise ---------- */}
          <div className="ai-card">
            {cardHead('grid', '', 'Organise')}
            <div className="ai-fs-b" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>

              {fl('Category',
                <>
                  <div className="ai-field">
                    <select
                      value={selectedCategories[0] || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'ADD_NEW_GROUP') { navigate(routes.itemGroup); return; }
                        setSelectedCategories(prev => {
                          const rest = prev.slice(1); // keep extra categories
                          return val ? [val, ...rest] : rest;
                        });
                      }}
                    >
                      <option value="">Select category</option>
                      <option value="ADD_NEW_GROUP">+ Add new group</option>
                      {itemGroups.map(g => (
                        <option key={g.id} value={g.id!}>{g.name}</option>
                      ))}
                    </select>
                  </div>

                  {selectedCategories.length > 1 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                      {selectedCategories.slice(1).map((catId) => {
                        const group = itemGroups.find(g => g.id === catId);
                        if (!group) return null;
                        return (
                          <span key={catId} className="ai-tag">
                            {group.name}
                            <button type="button" onClick={() => setSelectedCategories(prev => prev.filter(id => id !== catId))} aria-label={`Remove ${group.name}`}>
                              <AiIcon name="x" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {!showCategoryDropdown ? (
                    <button type="button" onClick={() => setShowCategoryDropdown(true)} className="ai-linkbtn ai-linkbtn--primary" style={{ marginTop: 4 }}>
                      + Add more category
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                      <div className="ai-field ai-field--sm" style={{ flex: 1 }}>
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            const val = e.target.value;
                            if (!val) return;
                            if (val === 'ADD_NEW_GROUP') { navigate(routes.itemGroup); return; }
                            if (!selectedCategories.includes(val)) {
                              setSelectedCategories(prev => [...prev, val]);
                            }
                            setShowCategoryDropdown(false);
                          }}
                        >
                          <option value="">Add more</option>
                          <option value="ADD_NEW_GROUP">+ Add new group</option>
                          {itemGroups
                            .filter(g => !selectedCategories.includes(g.id!))
                            .map(g => (<option key={g.id} value={g.id!}>{g.name}</option>))}
                        </select>
                      </div>
                      <button type="button" onClick={() => setShowCategoryDropdown(false)} className="ai-btn ai-btn--ghost ai-btn--sm">Cancel</button>
                    </div>
                  )}
                </>,
                { div: true, req: !!(itemSettings as any)?.requireCategory, hint: 'An item can be in several groups' })}

              {fl('Variants',
                <VariantPicker
                  allItems={allItems}
                  selectedIds={itemVariants}
                  currentItemBarcode={itemBarcode}
                  onChange={setItemVariants}
                  activeTheme={activeTheme}
                />,
                { div: true })}

              {fl('Description',
                <div className="ai-field ai-field--area">
                  <textarea
                    value={itemDescription}
                    onChange={(e) => setItemDescription(e.target.value)}
                    rows={3}
                    placeholder="e.g. Fresh Amul butter, 500g pack, ideal for baking and spreads."
                  />
                </div>)}
            </div>
          </div>
        </div>

        {/* ================= RIGHT: PREVIEW + BULK IMPORT + SAVE (desktop only) ================= */}
        {!isModal && (
          <aside className="ai-right">
            <div className="ai-card">
              <div className="ai-prev__img">
                {pvImg ? (
                  <img src={pvImg} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <AiIcon name="image" />
                )}
              </div>
              <div className="ai-prev__b">
                <div>
                  <div className="ai-overline">Preview · how it appears in billing</div>
                  <div className="ai-prev__name">{itemName.trim() || 'Item name'}</div>
                  <div className="ai-meta">
                    {[itemBarcode || null, itemUnit, pvGroup || null].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div className="ai-price">
                  <b>{pvPrice > 0 ? inr(pvPrice) : '₹0'}</b>
                  {pvOff > 0 && <span className="ai-mrp">{inr(pvMrp)}</span>}
                  {pvOff > 0 && <span className="ai-badge">{pvOff}% OFF</span>}
                </div>
                <dl className="ai-kv">
                  <dt>Tax</dt><dd>{toNum(itemTax)}%</dd>
                  <dt>Margin per {itemUnit}</dt>
                  <dd style={{ color: pvMargin !== null && pvMargin < 0 ? 'var(--danger)' : pvMargin !== null ? 'var(--success)' : undefined }}>
                    {pvMargin !== null ? inr(pvMargin) : '—'}
                  </dd>
                  <dt>Stock value at cost</dt><dd>{pvCost > 0 && pvStock > 0 ? inr(pvCost * pvStock) : '—'}</dd>
                  <dt>Low-stock alert at</dt><dd>{(parseInt(restockQuantity, 10) || 0) > 0 ? `${parseInt(restockQuantity, 10)} ${itemUnit}` : '—'}</dd>
                </dl>
              </div>
            </div>

            <div className="ai-card ai-bulk">
              <div className="ai-bulk__h">
                <span className="ai-tint"><AiIcon name="doc" /></span>
                <div>
                  <b>Adding many items?</b>
                  <div>Upload Excel/CSV — missing categories are created automatically, images can be embedded in rows.</div>
                </div>
              </div>
              <div className="ai-bulk__btns">
                <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="ai-btn ai-btn--secondary ai-btn--sm">
                  {isUploading ? <Spinner /> : (<><AiIcon name="upload" sm />Upload Excel</>)}
                </button>
                <button type="button" onClick={handleDownloadSample} disabled={isUploading} className="ai-btn ai-btn--ghost ai-btn--sm" style={{ color: 'var(--primary-text)' }}>
                  <AiIcon name="download" sm />Template
                </button>
              </div>
            </div>

            <div className="ai-spacer" />

            <div className="ai-savepair">
              <button
                type="button"
                onClick={() => { keepForNextRef.current = true; handleAddItem(); }}
                disabled={saveDisabled}
                title="Save this item and start another, keeping unit, tax and groups"
                className="ai-btn ai-btn--secondary ai-btn--lg"
              >
                Save &amp; new
              </button>
              <button
                onClick={() => { keepForNextRef.current = false; handleAddItem(); }}
                disabled={saveDisabled}
                className="ai-btn ai-btn--primary ai-btn--lg"
              >
                {isSaving ? <Spinner /> : (<><AiIcon name="check" sm />Save item</>)}
              </button>
            </div>
          </aside>
        )}
      </div>

      {/* ---------- Mobile pinned save bar (non-modal) ---------- */}
      {!isModal && (
        <div className="ai-savebar">
          <button
            type="button"
            onClick={() => { keepForNextRef.current = true; handleAddItem(); }}
            disabled={saveDisabled}
            title="Save this item and start another, keeping unit, tax and groups"
            className="ai-btn ai-btn--secondary ai-btn--lg"
          >
            <AiIcon name="plus" sm />Another
          </button>
          <button
            onClick={() => { keepForNextRef.current = false; handleAddItem(); }}
            disabled={saveDisabled}
            className="ai-btn ai-btn--primary ai-btn--lg"
          >
            {isSaving ? <Spinner /> : (<><AiIcon name="check" sm />Save item</>)}
          </button>
        </div>
      )}

      {/* ---------- Modal footer ---------- */}
      {isModal && (
        <div className="ai-modalbar">
          <button onClick={onCancel} className="ai-btn ai-btn--ghost">Cancel</button>
          <button onClick={handleAddItem} disabled={saveDisabled} className="ai-btn ai-btn--primary">
            {isSaving ? <Spinner /> : 'Save and add to inventory'}
          </button>
        </div>
      )}
    </div>
  );
};

export default ItemAdd;