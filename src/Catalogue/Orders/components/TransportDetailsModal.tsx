import React from 'react';
import { FiX } from 'react-icons/fi';

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
        <div className="fixed inset-0 z-[2500] flex items-center justify-center p-4" onClick={() => setShowTransportModal(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <div className="relative w-full max-w-md bg-white rounded-sm shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="bg-orange-500 px-4 py-2.5 flex items-center justify-between">
                    <h3 className="text-white font-semibold text-sm">Transport Details</h3>
                    <button onClick={() => setShowTransportModal(false)} className="text-white hover:text-orange-100">
                        <FiX size={18} />
                    </button>
                </div>
                <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Transport Name</label>
                            <input type="text" value={transportName} onChange={(e) => setTransportName(e.target.value)} placeholder="e.g. DP World Express Logistic" className="w-full p-2 text-sm rounded-sm border border-gray-200 bg-gray-50 focus:border-orange-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">GR/RR No.</label>
                            <input type="text" value={grRrNo} onChange={(e) => setGrRrNo(e.target.value)} className="w-full p-2 text-sm rounded-sm border border-gray-200 bg-gray-50 focus:border-orange-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">GR/RR Date</label>
                            <input type="date" value={grRrDate} onChange={(e) => setGrRrDate(e.target.value)} className="w-full p-2 text-sm rounded-sm border border-gray-200 bg-gray-50 focus:border-orange-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Vehicle No.</label>
                            <input type="text" value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} className="w-full p-2 text-sm rounded-sm border border-gray-200 bg-gray-50 focus:border-orange-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">PIN Code</label>
                            <input type="text" maxLength={6} value={pinCode} onChange={(e) => setPinCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="w-full p-2 text-sm rounded-sm border border-gray-200 bg-gray-50 focus:border-orange-500 outline-none" />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Station / From Place</label>
                            <input type="text" value={stationFrom} onChange={(e) => setStationFrom(e.target.value)} className="w-full p-2 text-sm rounded-sm border border-gray-200 bg-gray-50 focus:border-orange-500 outline-none" />
                        </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                        {hasTransportDetails && (
                            <button
                                onClick={() => { setTransportName(''); setGrRrNo(''); setGrRrDate(''); setVehicleNo(''); setStationFrom(''); setPinCode(''); }}
                                className="px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-sm transition-colors"
                            >
                                Clear
                            </button>
                        )}
                        <button
                            onClick={() => setShowTransportModal(false)}
                            className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-sm font-bold text-sm transition-colors"
                        >
                            OK
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
