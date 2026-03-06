import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import { botMasterService } from '../Additional/Whatsapp/WhatsappApi';
import { CustomCard } from '../../Components/CustomCard';
import { IconChevronDown } from '../../constants/Icons';
import { ROUTES } from '../../constants/routes.constants';
import { IconClose } from '../../constants/Icons';

// 1. Added isLocked to the interface
interface ServiceItem {
    id: string;
    title: string;
    description: string;
    route: string;
    badge?: string;
    isLocked?: boolean;
}

// 2. Added a locked service as an example (or apply to existing ones)
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
    }
];

const AdditionalServices: React.FC = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [isChecking, setIsChecking] = useState(false);

    // --- ON-CLICK REDIRECTION LOGIC ---
    const handleWhatsappClick = async (route: string) => {
        if (!currentUser) {
            navigate(route);
            return;
        }

        setIsChecking(true);
        try {
            const companyId = (currentUser as any).companyId || currentUser.uid;
            const businessDocRef = doc(db, 'companies', companyId, 'business_info', companyId);
            const businessDoc = await getDoc(businessDocRef);

            if (businessDoc.exists()) {
                const data = businessDoc.data();
                const token = data.botMasterToken;
                const phone = data.whatsappNumber;

                if (token && phone) {
                    const response = await botMasterService.getMe(token, phone);

                    if (response.success && response.data?.sessions?.length > 0) {
                        const activeSession = response.data.sessions.find((s: any) => s.active === true);

                        if (activeSession) {
                            navigate(ROUTES.WHATSAPP_LANDING);
                            return;
                        }
                    }
                }
            }
            navigate(route);
        } catch (err) {
            console.error("WhatsApp check failed:", err);
            navigate(route);
        } finally {
            setIsChecking(false);
        }
    };

    const handleNavigate = (service: ServiceItem) => {
        // 3. Prevent navigation if the service is locked
        if (service.isLocked) return;

        if (service.id === 'Whatsapp') {
            handleWhatsappClick(service.route);
        } else {
            navigate(service.route);
        }
    };

    return (
        <div className="flex h-screen w-full flex-col overflow-hidden bg-gray-100 mb-10">
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

                    {/* Title & Subtitle Group */}
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
                {SERVICES.map((service) => (
                    <CustomCard
                        key={service.id}
                        onClick={() => handleNavigate(service)}
                        // 4. Dynamic styling based on locked state
                        className={`transition-all ${service.isLocked
                            ? 'cursor-not-allowed opacity-60 bg-slate-50'
                            : 'cursor-pointer hover:shadow-md active:scale-[0.99]'
                            }`}
                    >
                        <div className="flex items-center justify-between py-2">
                            <div className="flex-1 pr-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <h3 className="text-lg font-semibold text-slate-800">{service.title}</h3>

                                    {/* Existing Badge Logic */}
                                    {service.badge && !service.isLocked && (
                                        <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                                            {service.badge}
                                        </span>
                                    )}

                                    {/* 5. Coming Soon Badge */}
                                    {service.isLocked && (
                                        <span className="bg-sky-200 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-xs uppercase tracking-wide border border-gray-300">
                                            Coming Soon
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm text-slate-500">
                                    {isChecking && service.id === 'Whatsapp' ? 'Checking connection status...' : service.description}
                                </p>
                            </div>

                            <div className="flex items-center">
                                <button
                                    className={`w-10 h-10 flex items-center justify-center rounded-full bg-slate-50 ${service.isLocked ? 'text-gray-300' : 'text-slate-400'}`}
                                    disabled={service.isLocked}
                                >
                                    {isChecking && service.id === 'Whatsapp' ? (
                                        <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                    ) : (
                                        // Hide the chevron (or replace with a lock icon) if it's locked
                                        !service.isLocked && <IconChevronDown className="w-5 h-5 -rotate-90" />
                                    )}
                                </button>
                            </div>
                        </div>
                    </CustomCard>
                ))}
            </div>
        </div>
    );
};

export default AdditionalServices;