import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import { botMasterService } from '../Additional/Whatsapp/WhatsappApi';
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
        route: ROUTES.WHATSAPP_CHOOSE,
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
        description: 'Custom label design for your products.',
        route: '/label-design',
        isLocked: false,
    },
    {
        id: 'bill-design',
        title: 'Bill Design',
        description: 'Custom bill design for your business.',
        route: '/bill-design',
        isLocked: false,
    }
];

/* ------------------------------------------------------------------ */
/* UI-only presentation data (icon chip colour, icon, "what you get").  */
/* Keyed by service id so SERVICES above stays exactly as before.       */
/* ------------------------------------------------------------------ */

const Icon: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = 'w-5 h-5' }) => (
    <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        {children}
    </svg>
);

interface ServiceUi {
    chip: string; // tinted chip classes (bg + text)
    icon: React.ReactNode;
    features: string[];
}

const SERVICE_UI: Record<string, ServiceUi> = {
    Whatsapp: {
        chip: 'bg-[#e9faef] text-[#008236]',
        icon: (
            <Icon>
                <path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z" />
                <path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-2.3-2.3l.8-1-1-2z" />
            </Icon>
        ),
        features: [
            'Send bills to customers on WhatsApp',
            'Payment reminders for dues',
            'Order updates from your catalogue',
        ],
    },
    inventory: {
        chip: 'bg-[#e6eeff] text-[#155dfc]',
        icon: (
            <Icon>
                <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
                <path d="M3 8l9 5 9-5M12 13v8" />
            </Icon>
        ),
        features: [
            'Stock levels across godowns',
            'Low-stock and restock alerts',
            'Bulk price changes',
        ],
    },
    'label-design': {
        chip: 'bg-[#fff3dd] text-[#bb4d00]',
        icon: (
            <Icon>
                <path d="M4 5v14M8 5v14M11 5v10M14 5v14M17 5v10M20 5v14" />
            </Icon>
        ),
        features: [
            'Your logo and layout on labels',
            'Barcode or QR, any label size',
            'Price, MRP and offer text',
        ],
    },
    'bill-design': {
        chip: 'bg-[#ffe8f8] text-[#c4009a]',
        icon: (
            <Icon>
                <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
                <path d="M14 3v5h5M9 13h6M9 17h4" />
            </Icon>
        ),
        features: [
            'Your brand colours and logo',
            'A4, A5 and thermal layouts',
            'Extra fields and terms',
        ],
    },
};

const FALLBACK_UI: ServiceUi = {
    chip: 'bg-[#e6eeff] text-[#155dfc]',
    icon: (
        <Icon>
            <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
            <path d="M3 8l9 5 9-5M12 13v8" />
        </Icon>
    ),
    features: [],
};

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
            const statusRef = doc(db, 'companies', companyId, 'whatsappStatus', 'current');
            const [businessDoc, statusDoc] = await Promise.all([
                getDoc(businessDocRef),
                getDoc(statusRef),
            ]);

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
                    // BotMaster token exists but isn't actively connected — send
                    // them back through the choose-provider screen to reconnect.
                    navigate(ROUTES.WHATSAPP_CHOOSE);
                    return;
                }
            }

            const status = statusDoc.exists() ? statusDoc.data() : {};
            if (status.active && (status.activeTier === 'snapto' || status.activeTier === 'sellar')) {
                // Admin-managed tier (their own Snapto account or Sellar's shared
                // number) — no credentials to manage here any more, just their
                // send history/quota.
                navigate(ROUTES.WHATSAPP_MESSAGE_LOG);
                return;
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
        <div className="flex h-screen w-full flex-col overflow-hidden bg-[#eef2ff] mb-10 font-sans">
            {/* Header */}
            <div className="z-30 flex-none border-b border-[#dfe6fb] bg-white px-4 py-4 sm:px-6">
                <div className="flex items-center gap-3 sm:gap-4">
                    <BackButton />
                    <div className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-3">
                        <h1 className="text-xl font-semibold leading-7 text-[#0f172b] sm:text-[22px] sm:leading-[30px]">
                            Services
                        </h1>
                        <p className="text-xs text-[#5b6b86] sm:text-[13px]">
                            Explore additional features and tools
                        </p>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 pb-24 pt-4 sm:px-6 sm:pt-5">
                {/* 2 x 2 grid on desktop, single column on phones */}
                <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
                    {SERVICES.map((service) => {
                        // 3. Dynamically determine if the item is locked
                        const isDeviceLocked = service.id === 'Whatsapp' && isMobileDevice;
                        const effectivelyLocked = service.isLocked || isDeviceLocked;
                        const ui = SERVICE_UI[service.id] || FALLBACK_UI;
                        const checkingThis = isChecking && service.id === 'Whatsapp';

                        return (
                            <div
                                key={service.id}
                                role="button"
                                tabIndex={0}
                                // 4. Whole card stays clickable, same handler as before
                                onClick={() => handleNavigate(service)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        handleNavigate(service);
                                    }
                                }}
                                className={`flex flex-col gap-3 rounded-sm border border-[#dfe6fb] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,43,0.04)] outline-none transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#155dfc] sm:p-5 ${effectivelyLocked
                                    ? 'cursor-not-allowed opacity-60'
                                    : 'cursor-pointer hover:border-[#c7d3f7] hover:shadow-md active:scale-[0.99]'
                                    }`}
                            >
                                {/* Icon chip + title */}
                                <div className="flex items-start gap-3">
                                    <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-sm ${ui.chip}`}>
                                        {ui.icon}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="text-[17px] font-semibold leading-6 text-[#0f172b]">
                                                {service.title}
                                            </h3>

                                            {/* Standard Badge */}
                                            {service.badge && !effectivelyLocked && (
                                                <span className="rounded-sm bg-[#e6eeff] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#155dfc]">
                                                    {service.badge}
                                                </span>
                                            )}

                                            {/* 5. Dynamic Locked Badges */}
                                            {effectivelyLocked && (
                                                <span className="rounded-sm bg-[#fff3dd] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#bb4d00]">
                                                    {isDeviceLocked ? 'Please setup on desktop' : 'Coming Soon'}
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-0.5 text-[13px] leading-[19px] text-[#45556c]">
                                            {checkingThis ? 'Checking connection status...' : service.description}
                                        </p>
                                    </div>
                                </div>

                                {/* What you get */}
                                {ui.features.length > 0 && (
                                    <ul className="m-0 grid list-none gap-1.5 rounded-sm bg-[#f5f7ff] p-3 text-[13px] text-[#45556c]">
                                        {ui.features.map((feature) => (
                                            <li key={feature} className="flex items-center gap-2">
                                                <Icon className="h-3.5 w-3.5 flex-none text-[#008236]">
                                                    <path d="M5 12.5l4.5 4.5L19 7" strokeWidth={2.5} />
                                                </Icon>
                                                {feature}
                                            </li>
                                        ))}
                                    </ul>
                                )}

                                {/* Footer */}
                                <div className="mt-auto flex items-center justify-end border-t border-[#dfe6fb] pt-3">
                                    <button
                                        type="button"
                                        tabIndex={-1}
                                        className={`inline-flex h-8 items-center gap-1 rounded-sm border px-3 text-[13px] font-medium transition-colors ${effectivelyLocked
                                            ? 'border-[#dfe6fb] bg-[#f5f7ff] text-[#5b6b86]'
                                            : 'border-[#7a8aa3] bg-white text-[#0f172b] hover:bg-[#f5f7ff]'
                                            }`}
                                    >
                                        {checkingThis ? (
                                            <>
                                                <span className="h-3.5 w-3.5 animate-spin rounded-sm border-2 border-[#155dfc] border-t-transparent" />
                                                Checking...
                                            </>
                                        ) : (
                                            <>
                                                View details
                                                <Icon className="h-4 w-4">
                                                    <path d="m9 6 6 6-6 6" />
                                                </Icon>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Need something else? */}
                <div className="mx-auto mt-4 flex max-w-5xl flex-col gap-3 rounded-sm border border-[#dfe6fb] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,43,0.04)] sm:mt-5 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                    <div className="flex flex-1 items-center gap-3">
                        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-sm bg-[#e6eeff] text-[#155dfc]">
                            <Icon>
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </Icon>
                        </span>
                        <div>
                            <p className="text-[15px] font-semibold text-[#0f172b]">Need something else for your shop?</p>
                            <p className="text-xs text-[#5b6b86]">
                                Tell us what you need and the SELLAR team will get back to you.
                            </p>
                        </div>
                    </div>
                    <a
                        href="tel:9818815838"
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-sm border border-[#7a8aa3] bg-white px-4 text-sm font-medium text-[#0f172b] transition-colors hover:bg-[#f5f7ff]"
                    >
                        Talk to us
                    </a>
                </div>
            </div>

            {/* Contact modal (unchanged behaviour) */}
            {isContactModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-sm border border-[#dfe6fb] bg-white p-6 shadow-2xl">
                        <h3 className="mb-2 text-lg font-semibold text-[#0f172b]">
                            Service Unavailable
                        </h3>

                        <p className="mb-4 text-sm text-[#45556c]">
                            To access <span className="font-semibold text-[#0f172b]">{selectedPlan}</span>,
                            please contact our admin:
                        </p>

                        <div className="mb-6 rounded-sm bg-[#f5f7ff] p-4 text-center">
                            <p className="mb-1 text-xs text-[#5b6b86]">Call us at:</p>

                            <a
                                href="tel:9818815838"
                                className="text-2xl font-semibold text-[#155dfc] hover:text-[#1447e6]"
                            >
                                9818815838
                            </a>
                        </div>

                        <button
                            onClick={() => setIsContactModalOpen(false)}
                            className="h-10 w-full rounded-sm bg-[#155dfc] text-sm font-medium text-white transition-colors hover:bg-[#1447e6]"
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