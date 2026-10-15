import React from 'react';
import { FiX, FiTruck, FiCheck } from 'react-icons/fi';

interface TransportDetailsModalProps {
    setShowTransportModal: (v: boolean) => void;
    transportName: string;
    setTransportName: (v: string) => void;
    grRrNo: string;
    setGrRrNo: (v: string) => void;
    grRrDate: string;
    setGrRrDate: (v: string) => void;
    vehicleNo: string;
    setVehicleNo: (v: string) => void;
    stationFrom: string;
    setStationFrom: (v: string) => void;
    pinCode: string;
    setPinCode: (v: string) => void;
    hasTransportDetails: boolean;
}

// UI-only tokens — same as OrderEditModal pop-ups (SELLAR "Catalogue orange")
const LABEL = 'block text-xs font-medium text-slate-600 mb-1';
const FIELD =
    'w-full h-11 px-3 border border-slate-300 rounded-sm text-sm text-slate-900 bg-white outline-none placeholder:text-slate-400 focus:border-[#ea580c] focus:ring-2 focus:ring-[#ea580c]/20';

export const TransportDetailsModal: React.FC<TransportDetailsModalProps> = ({
    setShowTransportModal,
    transportName,
    setTransportName,
    grRrNo,
    setGrRrNo,
    grRrDate,
    setGrRrDate,
    vehicleNo,
    setVehicleNo,
    stationFrom,
    setStationFrom,
    pinCode,
    setPinCode,
    hasTransportDetails,
}) => {
    return (
        <div
            className="fixed inset-0 z-[2500] flex items-start md:items-center justify-center bg-[#020618]/50 p-3 pt-[12vh] md:pt-3"
            onClick={() => setShowTransportModal(false)}
        >
            <div
                role="dialog"
                aria-label="Transport details"
                className="w-full max-w-md max-h-[85vh] bg-white rounded-sm shadow-2xl overflow-hidden flex flex-col text-left"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#f6e1d0]">
                    <span className="w-8 h-8 shrink-0 grid place-items-center rounded-sm bg-[#ffedd5] text-[#9a3412]">
                        <FiTruck size={18} />
                    </span>
                    <div className="flex-1 min-w-0">
                        <b className="block text-[17px] font-semibold text-slate-900 leading-6">Transport details</b>
                        <small className="block text-xs text-slate-500">Dispatch details for this order</small>
                    </div>
                    <button
                        onClick={() => setShowTransportModal(false)}
                        aria-label="Close"
                        className="w-10 h-10 grid place-items-center rounded-sm text-slate-500 hover:bg-[#fff8f2] hover:text-slate-900 transition-colors"
                    >
                        <FiX size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-4 overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                            <label className={LABEL}>Transport name</label>
                            <input type="text" value={transportName} onChange={(e) => setTransportName(e.target.value)} placeholder="e.g. DP World Express Logistic" className={FIELD} />
                        </div>
                        <div>
                            <label className={LABEL}>GR/RR No.</label>
                            <input type="text" value={grRrNo} onChange={(e) => setGrRrNo(e.target.value)} className={FIELD} />
                        </div>
                        <div>
                            <label className={LABEL}>GR/RR date</label>
                            <input type="date" value={grRrDate} onChange={(e) => setGrRrDate(e.target.value)} className={FIELD} />
                        </div>
                        <div>
                            <label className={LABEL}>Vehicle No.</label>
                            <input type="text" value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} className={FIELD} />
                        </div>
                        <div>
                            <label className={LABEL}>PIN code</label>
                            <input type="text" maxLength={6} value={pinCode} onChange={(e) => setPinCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className={FIELD} />
                        </div>
                        <div className="col-span-2">
                            <label className={LABEL}>Station / From place</label>
                            <input type="text" value={stationFrom} onChange={(e) => setStationFrom(e.target.value)} className={FIELD} />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center gap-2 px-4 py-3 border-t border-[#f6e1d0] bg-[#fff8f2]">
                    {hasTransportDetails && (
                        <button
                            onClick={() => { setTransportName(''); setGrRrNo(''); setGrRrDate(''); setVehicleNo(''); setStationFrom(''); setPinCode(''); }}
                            className="h-10 px-3 rounded-sm text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                        >
                            Clear
                        </button>
                    )}
                    <span className="flex-1" />
                    <button
                        onClick={() => setShowTransportModal(false)}
                        className="h-10 px-4 inline-flex items-center gap-2 rounded-sm bg-[#c2410c] text-white text-sm font-medium hover:bg-[#9a3412] transition-colors"
                    >
                        <FiCheck size={14} />
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};