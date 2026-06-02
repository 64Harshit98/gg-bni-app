import React, { useState, useEffect } from 'react';
import { IconClose } from '../constants/Icons';
import { Spinner } from '../constants/Spinner';

// ─── INTERFACES ─────────────────────────────────────────────────────────────

interface EwayBillData {
  number?: string;
  vehicleNumber?: string;
  validUpto?: string;
  transporterName?: string;
  distance?: number;
  status?: 'pending' | 'generated' | 'expired';
  generatedAt?: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  ewayBill?: EwayBillData;
  [key: string]: any;
}

interface EwayBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  onSubmit: (ewbData: EwayBillData) => Promise<void>;
}

// ─── E-WAY BILL MODAL COMPONENT ─────────────────────────────────────────────

const EwayBillModal: React.FC<EwayBillModalProps> = ({ 
  isOpen, 
  onClose, 
  invoice, 
  onSubmit 
}) => {
  const [ewbNumber, setEwbNumber] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [validUpto, setValidUpto] = useState('');
  const [transporterName, setTransporterName] = useState('');
  const [distance, setDistance] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (invoice?.ewayBill) {
      setEwbNumber(invoice.ewayBill.number || '');
      setVehicleNumber(invoice.ewayBill.vehicleNumber || '');
      setValidUpto(invoice.ewayBill.validUpto || '');
      setTransporterName(invoice.ewayBill.transporterName || '');
      setDistance(invoice.ewayBill.distance?.toString() || '');
    } else {
      setEwbNumber('');
      setVehicleNumber('');
      setValidUpto('');
      setTransporterName('');
      setDistance('');
    }
  }, [invoice]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ewbNumber.trim()) return alert('E-Way Bill Number is required');
    if (!vehicleNumber.trim()) return alert('Vehicle Number is required');
    if (!validUpto) return alert('Valid Upto date is required');

    setSubmitting(true);
    try {
      await onSubmit({
        number: ewbNumber.trim(),
        vehicleNumber: vehicleNumber.trim().toUpperCase(),
        validUpto,
        transporterName: transporterName.trim(),
        distance: distance ? Number(distance) : undefined,
        status: 'generated',
        generatedAt: new Date().toISOString(),
      });
      onClose();
    } catch (error) {
      console.error('EWB submission failed:', error);
      alert('Failed to save E-Way Bill details');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const inputCls = "w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none";
  const labelCls = "block text-xs font-medium text-gray-600 mb-1";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl w-full max-w-2xl mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold text-gray-800">E-Way Bill Details</h3>
            {invoice && (
              <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5 font-medium">
                {invoice.invoiceNumber} &nbsp;·&nbsp;
                {invoice.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <IconClose />
          </button>
        </div>

        {/* ── Form ── */}
        <form onSubmit={handleSubmit} className="px-5 py-4">
          {/* Row 1: EWB Number + Vehicle Number */}
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
              {/* Label row: text left, portal link right */}
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-600">
                  E-Way Bill Number <span className="text-red-500">*</span>
                </label>
                <a
                  href="https://ewaybillgst.gov.in"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                  title="Open the Government E-Way Bill portal to generate a new EWB number"
                >
                  {/* External link icon */}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-3 h-3 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  Generate on Govt. Portal
                </a>
              </div>
              <input
                type="text"
                value={ewbNumber}
                onChange={e => setEwbNumber(e.target.value)}
                placeholder="e.g., 123456789012"
                maxLength={12}
                className={inputCls}
                required
              />
              <p className="text-xs text-gray-400 mt-0.5">12-digit number</p>
            </div>
            <div>
              <label className={labelCls}>
                Vehicle Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={vehicleNumber}
                onChange={e => setVehicleNumber(e.target.value.toUpperCase())}
                placeholder="e.g., UP32AB1234"
                className={`${inputCls} uppercase`}
                required
              />
            </div>
          </div>

          {/* Row 2: Valid Upto + Transporter + Distance */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className={labelCls}>
                Valid Upto <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={validUpto}
                onChange={e => setValidUpto(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Transporter Name</label>
              <input
                type="text"
                value={transporterName}
                onChange={e => setTransporterName(e.target.value)}
                placeholder="e.g., ABC Logistics"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Distance (km)</label>
              <input
                type="number"
                value={distance}
                onChange={e => setDistance(e.target.value)}
                placeholder="e.g., 250"
                min="0"
                className={inputCls}
              />
            </div>
          </div>

          {/* ── Footer: note + actions ── */}
          <div className="flex items-center gap-3">
            <p className="flex-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-1.5">
              <strong>Note:</strong> E-Way Bill mandatory for goods movement exceeding ₹50,000 (GST).
            </p>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {submitting ? <><Spinner /><span>Saving…</span></> : 'Save E-Way Bill'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EwayBillModal;