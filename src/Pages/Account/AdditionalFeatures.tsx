import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import { botMasterService } from '../Additional/Whatsapp/WhatsappApi';
import { CustomCard } from '../../Components/CustomCard';
import { IconChevronDown } from '../../constants/Icons';
import { ROUTES } from '../../constants/routes.constants';
import BackButton from '../../Components/BackButton';

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
        isLocked: false,
    },
    {
        id: 'label-design',
        title: 'Label Design',
        description: 'Custom label design for your products. ₹1,100 per design.',
        route: '/label-design',
        isLocked: false,
    },
    {
        id: 'bill-design',
        title: 'Bill Design',
        description: 'Custom bill design for your business. ₹1,100 per design.',
        route: '/bill-design',
        isLocked: false,
    }
];

const AdditionalServices: React.FC = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [isChecking, setIsChecking] = useState(false);
    const [isContactModalOpen, setIsContactModalOpen] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState('');

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
        if (service.isLocked === false) {
            setSelectedPlan(service.title);
            setIsContactModalOpen(true);
            return;
        }

        if (service.id === 'Whatsapp') {
            handleWhatsappClick(service.route);
        } else {
            navigate(service.route);
        }
    };

    return (
        <div className="flex h-screen w-full flex-col overflow-hidden bg-muted mb-10">
            {/* Header */}
            <div className="z-30 bg-card border-b border-border pb-6 pt-6 px-6 shadow-sm flex-none">
                <div className="flex items-start gap-4">
                    <BackButton />
                    <div className="flex flex-col">
                        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                            Services
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Explore additional features and tools
                        </p>
                    </div>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto bg-muted space-y-3 pt-4 pb-24 px-2">
                {SERVICES.map((service) => {
                    // 3. Dynamically determine if the item is locked
                    const isDeviceLocked = service.id === 'Whatsapp' && isMobileDevice;
                    const effectivelyLocked = service.isLocked || isDeviceLocked;

                    return (
                        <CustomCard
                            key={service.id}
                            // 4. Use effectivelyLocked to prevent clicks
                            onClick={() => handleNavigate(service)}
                            className={`transition-all ${effectivelyLocked
                                ? 'cursor-not-allowed opacity-60 bg-muted'
                                : 'cursor-pointer hover:shadow-md active:scale-[0.99]'
                                }`}
                        >
                            <div className="flex items-center justify-between py-2">
                                <div className="flex-1 pr-4">
                                    <div className="flex items-center gap-1 mb-1 min-w-0 flex-wrap">
                                        <h3 className="text-lg font-semibold text-foreground whitespace-nowrap">{service.title}</h3>

                                        {/* Standard Badge */}
                                        {service.badge && !effectivelyLocked && (
                                            <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                                                {service.badge}
                                            </span>
                                        )}

                                        {/* 5. Dynamic Locked Badges */}
                                        {effectivelyLocked && (
                                            <span className="bg-sky-200 text-muted-foreground text-[10px] font-bold px-1 py-0.5 rounded-xs uppercase tracking-wide border border-border">
                                                {isDeviceLocked ? 'PLEASE SETUP ON DESKTOP' : 'Coming Soon'}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        {isChecking && service.id === 'Whatsapp' ? 'Checking connection status...' : service.description}
                                    </p>
                                </div>

                                <div className="flex items-center">
                                    <button
                                        className={`w-10 h-10 flex items-center justify-center rounded-full bg-muted ${effectivelyLocked ? 'text-gray-300' : 'text-muted-foreground'}`}
                                        disabled={false}
                                    >
                                        {isChecking && service.id === 'Whatsapp' ? (
                                            <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                        ) : (
                                            !effectivelyLocked && <IconChevronDown className="w-5 h-5 -rotate-90" />
                                        )}
                                    </button>
                                </div>
                            </div>
                        </CustomCard>
                    );
                })}
            </div>
            {isContactModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-card rounded-lg shadow-2xl max-w-md w-full p-6">
                        <h3 className="text-lg font-bold text-foreground mb-4">
                            Service Unavailable
                        </h3>

                        <p className="text-foreground mb-4">
                            To access <span className="font-semibold">{selectedPlan}</span>,
                            please contact our admin:
                        </p>

                        <div className="bg-muted rounded-md p-4 mb-6 text-center">
                            <p className="text-sm text-muted-foreground mb-2">Call us at:</p>

                            <a
                                href="tel:9818815838"
                                className="text-2xl font-bold text-blue-600 hover:text-blue-700"
                            >
                                9818815838
                            </a>
                        </div>

                        <button
                            onClick={() => setIsContactModalOpen(false)}
                            className="w-full py-2 bg-gray-900 text-white rounded-md font-semibold hover:bg-gray-800 transition-colors"
                        >
                            OK
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdditionalServices;