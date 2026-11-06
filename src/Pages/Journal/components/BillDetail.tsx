import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ItemsHeader, PinnedDetail } from '../../../Components/PinnedDetail';
import { Spinner } from '../../../constants/Spinner';
import { ROUTES } from '../../../constants/routes.constants';
import ShowWrapper from '../../../context/ShowWrapper';
import { Permissions } from '../../../enums/permissions.enum';
import { formatDayTime } from '../../../lib/format';
import { splitAddOns } from '../../../UseComponents/addOnText';
import type { Invoice } from '../journal.types';
import {
  BADGE,
  BTN_PRIMARY,
  BTN_SECONDARY,
  fmt,
  fmt0,
  fmtCompact,
  fmtReturnDate,
  getActiveModes,
  modeBadgeClass,
  modeLabel,
  returnModeClass,
} from '../journal.ui';

const ITEM_GRID = 'grid grid-cols-[minmax(0,1fr)_32px_80px_88px] gap-x-3';
const GUTTER = 'px-4 xl:px-5';
// Rows are numbered on desktop; returned rows line up under the item names
const NUMBER_INDENT = 'xl:pl-[22px]';

interface BillDetailProps {
  invoice: Invoice;
  showBilledBy: boolean;
  pdfGenerating: string | null;
  sendingPdf: boolean;
  onClose?: () => void;
  onSettle: (invoice: Invoice) => void;
  onPrint: (invoice: Invoice) => void;
  onTransport: (invoice: Invoice) => void;
  /** Sends through the connected WhatsApp provider; leave out when none is connected. */
  onRemind?: (invoice: Invoice) => void;
  onReturn: (invoice: Invoice) => void;
  onEdit: (invoice: Invoice) => void;
  onDelete: (invoice: Invoice) => void;
}

// Full bill (desktop side pane and mobile sheet): header and actions stay pinned,
// the items and the breakdown scroll between them.
export const BillDetail: React.FC<BillDetailProps> = ({
  invoice,
  showBilledBy,
  pdfGenerating,
  sendingPdf,
  onClose,
  onSettle,
  onPrint,
  onTransport,
  onRemind,
  onReturn,
  onEdit,
  onDelete,
}) => {
  const navigate = useNavigate();
  const [itemQuery, setItemQuery] = useState('');

  const activeModes = getActiveModes(invoice);
  const hasTransportInfo =
    !!(invoice as any).transportDetails && Object.values((invoice as any).transportDetails).some(Boolean);
  const isSale = invoice.type === 'Credit';
  const dueAmount = invoice.dueAmount || 0;
  const lineCount = invoice.items?.length || 0;
  const pieces = (invoice.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const partyPhone = (invoice.partyNumber || '').replace(/\D/g, '');
  const paidVia = activeModes
    .map(([key]) => (key === 'upi' ? 'UPI' : key.charAt(0).toUpperCase() + key.slice(1)))
    .join(' + ');

  const query = itemQuery.trim().toLowerCase();
  const matchesQuery = (name?: string) => !query || (name || '').toLowerCase().includes(query);

  // One crossed-out row for a returned quantity
  const renderReturnedRow = (
    key: string,
    name: string,
    modeOfReturn: string,
    returnedAt: any,
    amount: number,
    qty: number,
  ) => (
    <div key={key} className={`${ITEM_GRID} ${GUTTER} py-3 border-b border-[#dfe6fb] text-[#5b6b86]`}>
      <div className={`min-w-0 ${NUMBER_INDENT}`}>
        <p className="font-medium line-through break-words">{name}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          {modeOfReturn && (
            <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-sm ${returnModeClass(modeOfReturn)}`}>
              {modeOfReturn}
            </span>
          )}
          {returnedAt && (
            <span className="text-[10px] font-medium uppercase tracking-wide text-[#5b6b86]">
              {fmtReturnDate(returnedAt)}
            </span>
          )}
        </div>
      </div>
      <p className="text-right tabular-nums line-through whitespace-nowrap">{qty}</p>
      <p className="text-right tabular-nums line-through whitespace-nowrap" title={qty > 0 ? fmt(amount / qty) : ''}>{qty > 0 ? fmtCompact(amount / qty) : ''}</p>
      <p className="text-right tabular-nums font-medium line-through whitespace-nowrap" title={fmt(amount)}>{fmtCompact(amount)}</p>
    </div>
  );

  const header = (
    <div className={`flex flex-col gap-3 ${GUTTER} pb-3 pt-1 xl:flex-row xl:items-center xl:gap-4 xl:py-4`}>
      <div className="flex min-w-0 items-start justify-between gap-4 xl:flex-1">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[11px] leading-4 font-semibold tracking-[0.08em] uppercase text-[#5b6b86]">
              {isSale ? 'Sale bill' : 'Purchase bill'}
            </span>
            <span className={`${BADGE} ${invoice.status === 'Paid' ? 'bg-[#e9faef] text-[#008236]' : 'bg-[#fff3dd] text-[#bb4d00]'}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
              {invoice.status}
            </span>
            {(invoice.returnHistory || []).map((historyItem: any, index: number) => (
              <span key={`return-${index}`} className={`${BADGE} uppercase ${returnModeClass(historyItem.modeOfReturn || 'Return')}`}>
                {historyItem.modeOfReturn || 'Return'}
              </span>
            ))}
            {activeModes.map(([mode]) => (
              <span key={mode} className={`${BADGE} uppercase ${modeBadgeClass(mode)}`}>
                {modeLabel(mode)}
              </span>
            ))}
          </div>
          <h2 className="mt-0.5 text-lg xl:text-xl leading-[26px] xl:leading-7 font-semibold text-[#0f172b] break-words">
            {invoice.invoiceNumber}
          </h2>
          <p className="text-xs leading-4 text-[#45556c]">
            {formatDayTime(invoice.createdAt)}
            {showBilledBy && invoice.salesmanName ? ` · Billed by ${invoice.salesmanName.slice(0, 15)}` : ''}
          </p>
        </div>

        {/* Phone: the total sits up here. Desktop: it moves to the pinned footer */}
        <div className="flex items-start gap-1 shrink-0 xl:hidden">
          <div className="text-right">
            <p className="text-xs text-[#45556c]">Total</p>
            <p className="text-lg leading-[26px] font-semibold text-[#0f172b] tabular-nums" title={fmt(invoice.amount)}>{fmtCompact(invoice.amount)}</p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close bill details"
              className="-mr-2 -mt-1 inline-flex h-8 w-8 items-center justify-center rounded-sm text-[#45556c] transition-colors hover:bg-[#f5f7ff] hover:text-[#0f172b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#155dfc]"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* Customer strip */}
      <div className="flex min-w-0 items-center gap-2.5 rounded-sm bg-[#f5f7ff] px-2.5 py-1.5 xl:max-w-[55%]">
        <span className="w-8 h-8 text-sm rounded-full grid place-items-center bg-[#e6eeff] text-[#155dfc] font-semibold shrink-0">
          {(invoice.partyName || 'W').trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[#0f172b] truncate">{invoice.partyName || 'Walk-in customer'}</p>
          {invoice.partyNumber && <p className="text-xs text-[#5b6b86]">{invoice.partyNumber}</p>}
        </div>
        {partyPhone && (
          <>
            <a
              href={`tel:${partyPhone}`}
              aria-label={`Call ${invoice.partyName || 'customer'}`}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-[#45556c] transition-colors hover:bg-white hover:text-[#0f172b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#155dfc]"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 12l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2" /></svg>
            </a>
            <ShowWrapper requiredPermission={Permissions.HiddenProFeatures}>
              <button
                type="button"
                onClick={() => navigate(ROUTES.PARTY_LEDGER, { state: { openParty: partyPhone.slice(-10) } })}
                className="h-8 shrink-0 whitespace-nowrap rounded-sm border border-[#7a8aa3] bg-white px-2.5 text-[13px] font-medium text-[#0f172b] transition-colors hover:bg-[#f5f7ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#155dfc]"
              >
                Party ledger
              </button>
            </ShowWrapper>
          </>
        )}
      </div>
    </div>
  );

  // DOM order is the phone order (main action first). Desktop reverses the row,
  // so the main action lands far right and Delete at the far end on the left.
  const footer = (
    <div className={`flex flex-col gap-3 ${GUTTER} pb-5 pt-3 xl:flex-row xl:flex-wrap xl:items-center xl:gap-x-4 xl:pb-3.5 xl:pt-3.5`}>
      <div className="hidden min-w-[120px] xl:flex xl:flex-1 xl:flex-col">
        <span className="text-xs text-[#45556c]">Total · {lineCount} {lineCount === 1 ? 'item' : 'items'}</span>
        <b className="text-[22px] leading-7 font-semibold text-[#0f172b] tabular-nums" title={fmt(invoice.amount)}>{fmtCompact(invoice.amount)}</b>
        {invoice.status === 'Unpaid' && dueAmount > 0 ? (
          <span className="text-xs font-medium text-[#bb4d00] tabular-nums">
            {isSale ? 'They owe you' : 'You owe'} {fmtCompact(dueAmount)}
          </span>
        ) : paidVia ? (
          <span className="text-xs font-medium text-[#008236]">Paid via {paidVia}</span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 xl:flex-row-reverse">
        {invoice.status === 'Unpaid' && (
          <button
            onClick={(e) => { e.stopPropagation(); onSettle(invoice); }}
            className={`${BTN_PRIMARY} w-full xl:w-auto xl:px-3`}
          >
            Settle
          </button>
        )}

        {/* Print (sales only — purchase bills have nothing useful to print): primary, except on an unpaid bill where Settle takes the primary slot */}
        {isSale && (
          <button
            onClick={(e) => { e.stopPropagation(); onPrint(invoice); }}
            disabled={pdfGenerating === invoice.id}
            className={invoice.status === 'Unpaid' ? `${BTN_SECONDARY} xl:px-3` : `${BTN_PRIMARY} w-full xl:w-auto xl:px-3`}
          >
            {pdfGenerating === invoice.id ? <Spinner /> : 'Print'}
          </button>
        )}

        {hasTransportInfo && (
          <button
            onClick={(e) => { e.stopPropagation(); onTransport(invoice); }}
            className={`${BTN_SECONDARY} xl:px-3`}
          >
            Transport
          </button>
        )}

        {invoice.status === 'Unpaid' && invoice.partyNumber && onRemind && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemind(invoice); }}
            disabled={sendingPdf}
            className={`${BTN_SECONDARY} xl:px-3`}
          >
            {sendingPdf ? <Spinner /> : <>Remind</>}
          </button>
        )}

        <ShowWrapper requiredPermission={Permissions.HiddenProFeatures}>
          <button
            onClick={(e) => { e.stopPropagation(); onReturn(invoice); }}
            className={`${BTN_SECONDARY} xl:px-3`}
          >
            Return
          </button>
        </ShowWrapper>

        <ShowWrapper requiredPermission={Permissions.HiddenProFeatures}>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(invoice); }}
            className={`${BTN_SECONDARY} xl:px-3`}
          >
            Edit
          </button>
        </ShowWrapper>

        {invoice.status === 'Paid' && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(invoice); }}
            aria-label="Delete bill"
            title="Delete bill"
            className="ml-auto h-10 w-10 inline-flex items-center justify-center rounded-sm text-[#d5000c] hover:bg-[#ffeef0] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#155dfc] xl:ml-0"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15" /></svg>
          </button>
        )}
      </div>
    </div>
  );

  const removedRows = [
    ...(invoice.returnedItemsSnapshot && invoice.returnedItemsSnapshot.length > 0
      ? invoice.returnedItemsSnapshot
        .filter((snap: any) => !invoice.items?.some(i => i.id === snap.id))
        .filter((item: any) => matchesQuery(item.name))
        .map((item: any, index: number) => {
          const matchedHistory = invoice.returnHistory?.find((h: any) =>
            h.returnedItems?.some((ri: any) =>
              String(ri.originalItemId) === String(item.id) ||
              String(ri.id) === String(item.id)
            )
          );
          return renderReturnedRow(
            `returned-${index}`,
            item.name,
            matchedHistory?.modeOfReturn || '',
            matchedHistory?.returnedAt,
            Number(item.finalPrice),
            item.quantity,
          );
        })
      // Fallback for OLD transactions missing returnedItemsSnapshot
      : (invoice.returnHistory || [])
        .flatMap((h: any) =>
          (h.returnedItems || []).map((ri: any) => ({ ...ri, returnedAt: h.returnedAt, modeOfReturn: h.modeOfReturn }))
        )
        .filter((ri: any) => !invoice.items?.some(i => i.id === ri.originalItemId))
        .filter((ri: any) => matchesQuery(ri.name))
        .map((ri: any, index: number) =>
          renderReturnedRow(
            `rh-fallback-${index}`,
            ri.name,
            ri.modeOfReturn || '',
            ri.returnedAt,
            Number(ri.amount),
            ri.quantity,
          )
        )),
  ];

  const visibleItems = (invoice.items || [])
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => matchesQuery(item.name));

  return (
    <PinnedDetail
      header={header}
      footer={footer}
      moreHint="Scroll for more items and the bill breakdown"
      containScroll={!!onClose}
      className="h-full"
    >
      {/* Items table: the count and column titles stick while the rows scroll */}
      <div>
        <ItemsHeader
          lineCount={lineCount}
          pieces={pieces}
          query={itemQuery}
          onQueryChange={setItemQuery}
          gridClassName={ITEM_GRID}
          className={GUTTER}
        >
          <span className="text-right">Qty</span>
          <span className="text-right whitespace-nowrap">Rate</span>
          <span className="text-right whitespace-nowrap">Amount</span>
        </ItemsHeader>

        {visibleItems.map(({ item, index }) => {
          const netUnitPrice =
            item.taxableAmount && item.quantity > 0
              ? item.taxableAmount / item.quantity
              : item.effectiveUnitPrice
                ? item.effectiveUnitPrice
                : (item.quantity > 0 ? (item.finalPrice / item.quantity) : 0);

          // --- Collect ALL returned qty for this item across all return entries ---
          // Same-item exchanges re-add a line with the SAME id as the one that
          // was just returned, so matching purely by id (as below) can pair a
          // return record with the wrong (new-price) current line. Carrying the
          // return record's own recorded `amount` (its true value at return time)
          // and using that instead of recomputing from the current item's price
          // keeps the struck-through row honest even when the id collides.
          const returnedEntries: { qty: number; modeOfReturn: string; returnedAt: any; amount?: number }[] = [];
          (invoice.returnHistory || []).forEach((h: any) => {
            (h.returnedItems || []).forEach((r: any) => {
              if (r.originalItemId === item.id || r.originalItemId === (item as any).productId) {
                returnedEntries.push({
                  qty: Number(r.quantity) || Number(r.qty) || 0,
                  modeOfReturn: h.modeOfReturn || '',
                  returnedAt: h.returnedAt,
                  amount: r.amount !== undefined ? Number(r.amount) || 0 : undefined,
                });
              }
            });
          });

          const remainingQty = item.quantity;

          const priceLabel = item.mrp > 0
            ? `MRP: ${fmt0(item.mrp)}`
            : `Sales Price: ${fmt0(item.effectiveUnitPrice || (item.quantity > 0 ? item.finalPrice / item.quantity : 0))}`;

          const { baseName, addOnList } = splitAddOns(item);
          const showBase = addOnList.length > 0 && addOnList.every((a) => a.price !== undefined);
          const basePrice = netUnitPrice - addOnList.reduce((s, a) => s + (Number(a.price) || 0), 0);

          return (
            <React.Fragment key={index}>
              {remainingQty > 0 && (
                <div className={`${ITEM_GRID} ${GUTTER} py-2 border-b border-[#dfe6fb] text-[#0f172b]`}>
                  <div className="flex min-w-0">
                    <span className="hidden w-[22px] shrink-0 pt-px text-xs tabular-nums text-[#5b6b86] xl:block">{index + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium break-words">
                        {baseName}
                        {showBase && <span className="font-normal text-[#5b6b86] tabular-nums"> · {fmt0(basePrice)}</span>}
                      </p>
                      {addOnList.map((a, aIdx) => (
                        <p key={aIdx} className="text-xs text-[#5b6b86] break-words">
                          + {a.name}
                          {a.price !== undefined && (
                            <span className="tabular-nums"> · {Number(a.price) > 0 ? fmt0(Number(a.price)) : 'Free'}</span>
                          )}
                        </p>
                      ))}
                      <p className="text-xs text-[#5b6b86]">{priceLabel}</p>
                    </div>
                  </div>
                  <p className="text-right tabular-nums whitespace-nowrap">{remainingQty}</p>
                  <p className="text-right tabular-nums whitespace-nowrap" title={fmt(netUnitPrice)}>{fmtCompact(netUnitPrice)}</p>
                  <p className="text-right tabular-nums font-medium whitespace-nowrap" title={fmt(netUnitPrice * remainingQty)}>{fmtCompact(netUnitPrice * remainingQty)}</p>
                </div>
              )}

              {/* RETURNED QTY ROW — one crossed-out row per return event */}
              {returnedEntries.map((entry, rIdx) => (
                entry.qty > 0 &&
                renderReturnedRow(
                  `ret-${index}-${rIdx}`,
                  item.name,
                  entry.modeOfReturn,
                  entry.returnedAt,
                  entry.amount !== undefined ? entry.amount : netUnitPrice * entry.qty,
                  entry.qty,
                )
              ))}
            </React.Fragment>
          );
        })}

        {removedRows}

        {query && visibleItems.length === 0 && removedRows.length === 0 && (
          <p className={`${GUTTER} py-4 text-xs text-[#5b6b86]`}>No item on this bill matches "{itemQuery.trim()}".</p>
        )}

        {invoice.items?.length === 0 && (!invoice.returnedItemsSnapshot || invoice.returnedItemsSnapshot.length === 0) &&
          <p className={`${GUTTER} py-4 text-xs text-[#5b6b86]`}>No item details available.</p>
        }
      </div>

      {/* Totals */}
      <dl className={`grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 ${GUTTER} pb-4 pt-3 text-sm`}>
        {invoice.manualDiscount && invoice.manualDiscount > 0 ? (
          <>
            <dt className="text-[#45556c]">Bill discount</dt>
            <dd className="text-right tabular-nums text-[#d5000c]" title={fmt(invoice.manualDiscount)}>- {fmtCompact(invoice.manualDiscount)}</dd>
          </>
        ) : null}

        {invoice.taxAmount && invoice.taxAmount > 0 ? (
          <>
            <dt className="text-[#45556c]">Tax</dt>
            <dd className="text-right tabular-nums" title={fmt(invoice.taxAmount)}>+ {fmtCompact(invoice.taxAmount)}</dd>
          </>
        ) : null}

        {/* EXTRA EXPENSE ROWS */}
        {invoice.expenses && invoice.expenses.length > 0 ? (
          invoice.expenses.map((expense, idx) => (
            <React.Fragment key={`exp-${idx}`}>
              <dt className="text-[#45556c]">{expense.name || 'Extra expense'}</dt>
              <dd className="text-right tabular-nums" title={fmt(Number(expense.amount))}>+ {fmtCompact(Number(expense.amount))}</dd>
            </React.Fragment>
          ))
        ) : (invoice.extraExpenseAmount && invoice.extraExpenseAmount > 0) ? (
          <>
            <dt className="text-[#45556c]">{invoice.extraExpenseName || 'Extra expense'}</dt>
            <dd className="text-right tabular-nums" title={fmt(invoice.extraExpenseAmount)}>+ {fmtCompact(invoice.extraExpenseAmount)}</dd>
          </>
        ) : null}

        <dt className="pt-2 mt-1 border-t border-[#dfe6fb] text-base font-semibold text-[#0f172b]">Total</dt>
        <dd className="pt-2 mt-1 border-t border-[#dfe6fb] text-right text-base font-semibold text-[#0f172b] tabular-nums" title={fmt(invoice.amount)}>{fmtCompact(invoice.amount)}</dd>

        {activeModes.map(([key, val]) => (
          <React.Fragment key={key}>
            <dt className="text-[#45556c]">Paid via {key === 'upi' ? 'UPI' : key.charAt(0).toUpperCase() + key.slice(1)}</dt>
            <dd className="text-right tabular-nums font-medium text-[#008236]" title={fmt(Number(val))}>{fmtCompact(Number(val))}</dd>
          </React.Fragment>
        ))}

        {invoice.status === 'Unpaid' && dueAmount > 0 && (
          <>
            <dt className="font-medium text-[#bb4d00]">{isSale ? 'They owe you' : 'You owe'}</dt>
            <dd className="text-right tabular-nums font-semibold text-[#bb4d00]" title={fmt(dueAmount)}>{fmtCompact(dueAmount)}</dd>
          </>
        )}
      </dl>
    </PinnedDetail>
  );
};
