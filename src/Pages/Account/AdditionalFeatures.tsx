import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CustomCard } from '../../Components/CustomCard';
import { IconChevronDown } from '../../constants/Icons';
import { IconClose } from '../../constants/Icons';
import { ROUTES } from '../../constants/routes.constants';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';

interface ServiceItem {
    id: string;
    title: string;
    description: string;
    route: string;
    badge?: string;
    isLocked?: boolean;
}

const SERVICES: ServiceItem[] = [
    {
        id: 'Whatsapp',
        title: 'WhatsApp Integration',
        description: 'Connect your business to WhatsApp for seamless communication.',
        route: ROUTES.WHATSAPP_PLAN,
    },
    {
        id: 'inventory',
        title: 'Inventory Management',
        description: 'Track stock levels, manage items, and adjust pricing.',
        route: '/inventory',
        isLocked: true,
    },
    {
        id: 'labelDesign',
        title: 'Add Label Design',
        description: 'Get custom-designed labels for your products (one-time charge).',
        route: '',
        isLocked: true,
    },
    {
        id: 'billDesign',
        title: 'Add Bill Design',
        description: 'Get professionally designed bills for your business (one-time charge).',
        route: '',
        isLocked: true,
    }
];


interface AdditionalServicesProps {
    hideLabelDesign?: boolean;
}


const AdditionalServices: React.FC<AdditionalServicesProps> = ({ hideLabelDesign }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);

    // 1. State to track if the user is on a mobile/tablet device
    const [isMobileDevice, setIsMobileDevice] = useState(false);

    // 2. Effect to detect device on component mount
    useEffect(() => {
        const checkDevice = () => {
            const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
            // Regex checks for standard mobile/tablet user agents
            const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
            setIsMobileDevice(isMobile);
        };
        checkDevice();
    }, []);

    // Auto-hide labelDesign if in catalogue module
    const isCatalogue = location.pathname.startsWith('/catalogue-home');
    const effectiveHideLabelDesign = hideLabelDesign ?? isCatalogue;

    const handleNavigate = (service: ServiceItem) => {
        if (!service.route) {
            setModal({ message: 'This service is coming soon.', type: State.INFO });
            return;
        }
        navigate(service.route);
    };

    // Filter out labelDesign if effectiveHideLabelDesign is true
    const filteredServices = effectiveHideLabelDesign
        ? SERVICES.filter(service => service.id !== 'labelDesign')
        : SERVICES;

    return (
        <div className="flex h-screen w-full flex-col overflow-hidden bg-gray-100 mb-10">
            {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
            {/* Header */}
            <div className="z-30 bg-white border-b border-gray-100 pb-6 pt-6 px-6 shadow-sm flex-none">
                <div className="flex items-start gap-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="mt-1 flex items-center justify-center p-2 rounded-full bg-gray-50 text-gray-500 hover:bg-gray-200 hover:text-gray-900 transition-all"
                        title="Go Back"
                    >
                        <IconClose />
                    </button>

                    <div className="flex flex-col">
                        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
                            Services
                        </h1>
                        <p className="text-sm text-gray-500 mt-1">
                            Explore additional features and tools
                        </p>
                    </div>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto bg-slate-100 space-y-3 pt-4 pb-24 px-2">
                {filteredServices.map((service) => {
                    // 3. Dynamically determine if the item is locked
                    const isDeviceLocked = service.id === 'Whatsapp' && isMobileDevice;
                    const effectivelyLocked = service.isLocked || isDeviceLocked;

                    return (
                        <CustomCard
                            key={service.id}
                            onClick={() => {
                                if (!effectivelyLocked) handleNavigate(service);
                            }}
                            className={`transition-all ${effectivelyLocked
                                ? 'cursor-not-allowed opacity-60 bg-slate-50'
                                : 'cursor-pointer hover:shadow-md active:scale-[0.99]'
                                }`}
                        >
                            <div className="flex items-center justify-between py-1.5">
                                <div className="flex-1 pr-2">
                                    <div className="flex items-center gap-1 mb-0.5">
                                        <h3 className="text-base font-semibold text-slate-800">{service.title}</h3>
                                        {service.badge && !effectivelyLocked && (
                                            <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded-full uppercase tracking-wide">
                                                {service.badge}
                                            </span>
                                        )}
                                        {effectivelyLocked && (
                                            <span className="bg-sky-200 text-gray-600 text-[9px] font-bold px-1.5 py-0.5 rounded-xs uppercase tracking-wide border border-gray-300">
                                                {isDeviceLocked ? 'PLEASE SETUP ON DESKTOP' : 'Coming Soon'}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-500">
                                        {service.description}
                                    </p>
                                </div>
                                <div className="flex items-center">
                                    <button
                                        className={`w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 ${effectivelyLocked ? 'text-gray-300' : 'text-slate-400'}`}
                                        disabled={effectivelyLocked}
                                    >
                                        {!effectivelyLocked && <IconChevronDown className="w-4 h-4 -rotate-90" />}
                                    </button>
                                </div>
                            </div>
                        </CustomCard>
                    );
                })}
            </div>
        </div>
    );
};

export default AdditionalServices;
