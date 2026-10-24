import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ExternalLink, Scale } from 'lucide-react';
import { ROUTES } from '../../../constants/routes.constants';
import DetailPanel, { DetailItems, DetailRows, DetailSection } from './DetailPanel';
import {
  PAY_MODE_META,
  PAY_MODE_ORDER,
  formatCurrency,
  formatFullDate,
  formatPhone,
  getSaleItemCount,
  getSalePayModes,
  isWalkIn,
  type SaleRecord,
} from './salesReport.utils';

// A sale bill opened from the Sales or P&L report.

interface Props {
  sale: SaleRecord | null;
  companyId?: string;
  onClose: () => void;
  /** Extra sections under the payment, e.g. profit on the P&L report. */
  extra?: ReactNode;
}

const SaleBillPanel = ({ sale, companyId, onClose, extra }: Props) => {
  const navigate = useNavigate();
  if (!sale) return null;

  const modes = getSalePayModes(sale);
  const modeKeys = PAY_MODE_ORDER.filter((m) => (modes[m] || 0) > 0);
  const due = Math.max(Number(sale.paymentMethods?.due ?? sale.dueAmount) || 0, 0);
  const walkIn = isWalkIn(sale);
  const phone = (sale.partyNumber || '').replace(/\D/g, '').slice(-10);
  const time = new Date(sale.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  const count = getSaleItemCount(sale);

  return (
    <DetailPanel
      open
      onClose={onClose}
      title={sale.invoiceNumber}
      badge={
        due > 0 ? (
          <span className="rounded-sm bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700">Unpaid</span>
        ) : undefined
      }
      subtitle={`${formatFullDate(sale.createdAt)}, ${time}`}
      footer={
        <div className="flex gap-2">
          {companyId && (
            <a
              href={`/download-bill/${companyId}/${sale.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <ExternalLink size={15} /> View bill
            </a>
          )}
          {!walkIn && phone.length === 10 && (
            <button
              onClick={() => navigate(ROUTES.PARTY_LEDGER, { state: { openParty: phone } })}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-slate-400"
            >
              <Scale size={15} /> Party ledger
            </button>
          )}
        </div>
      }
    >
      <DetailSection title="Customer">
        <p className="text-sm font-medium text-slate-900">{walkIn ? 'Walk-in' : sale.partyName}</p>
        {!walkIn && sale.partyNumber && <p className="text-xs text-slate-500">{formatPhone(sale.partyNumber)}</p>}
      </DetailSection>

      <DetailSection title={`Items · ${count}`}>
        <DetailItems
          items={(sale.items || []).map((item) => ({
            name: item.name,
            quantity: Number(item.quantity) || 0,
            unitPrice: Number(item.mrp) || 0,
          }))}
        />
      </DetailSection>

      <DetailSection title="Payment">
        <DetailRows
          rows={[
            ...modeKeys.map((m) => ({
              label: PAY_MODE_META[m].label,
              value: formatCurrency(modes[m] || 0),
              tone: m === 'due' ? 'text-amber-700' : undefined,
            })),
            ...(due > 0 && !modeKeys.includes('due') ? [{ label: 'Due', value: formatCurrency(due), tone: 'text-amber-700' }] : []),
            { label: 'Bill total', value: formatCurrency(sale.totalAmount), strong: true },
          ]}
        />
      </DetailSection>

      {extra}
    </DetailPanel>
  );
};

export default SaleBillPanel;
