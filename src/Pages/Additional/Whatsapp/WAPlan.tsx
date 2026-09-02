import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stepper } from '../../../Components/Stepper';
import { ROUTES } from '../../../constants/routes.constants';
import BackButton from '../../../Components/BackButton';
// --- DATA: WhatsApp Plans ---
const WHATSAPP_PLANS = [
    {
        id: 'wa_12k',
        name: '12,000 Messages',
        subtitle: 'Starter Pack',
        duration: 'Year',
        price: 2100,
        tags: ['STARTER'], // Single tag
        features: [
            '12,000 Messages / Year',
            'Text & Image Support',
            'Basic Reporting',
            'No Setup Fee'
        ],
        recommended: false
    },
    {
        id: 'wa_50k',
        name: '50,000 Messages',
        subtitle: 'Growth Pack',
        duration: 'Year',
        price: 3500,
        tags: ['MOST POPULAR'], // Changed text slightly for better badge look
        features: [
            '50,000 Messages / Year',
            'Priority Delivery',
            'Advanced Analytics',
            'Template Management',
            'Dedicated Support'
        ],
        recommended: true
    },
    {
        id: 'wa_unlimited',
        name: 'Unlimited Messages',
        subtitle: 'Enterprise Pack',
        duration: 'Year',
        price: 4200,
        tags: ['VIP ACCESS'],
        features: [
            'Unlimited Messaging',
            'Full API Access',
            'Custom Sender ID',
            '24/7 Priority Support',
            'Multi-agent Access'
        ],
        recommended: false
    }
];

const WhatsAppSubscriptionPage: React.FC = () => {
    const navigate = useNavigate();
    const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);

    const handleSelectPlan = (plan: typeof WHATSAPP_PLANS[0]) => {
        navigate('/whatsapp-details', { state: { selectedPlan: plan } });
    };

    const toggleExpand = (id: string) => {
        setExpandedPlanId(prev => (prev === id ? null : id));
    };
    const handleGlobalStepClick = (stepNumber: number) => {
        if (stepNumber === 1) {
            // Navigate back to Plan Selection
            navigate(ROUTES.WHATSAPP_PLAN || '/whatsapp-plans');
        }
        // Step 3 is current page, do nothing
    };
    return (
        <div className="min-h-screen bg-gray-100 font-sans">

            {/* --- SECTION 1: HEADER (Scrolls Away) --- */}
            <div className="pt-4 pb-6 px-4 text-center max-w-2xl mx-auto relative">
                <div className="relative flex items-center justify-center">
                    <div className="absolute left-0">
                        <BackButton />
                    </div>

                    <h2 className="mt-2 text-base font-semibold text-emerald-600 tracking-wide uppercase">
                        WhatsApp Marketing
                    </h2>
                </div>

                <p className="mt-4 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
                    Choose Your Message Plan
                </p>
            </div>
            <div className="sticky top-0 z-50 backdrop-blur-sm transition-all duration-300">
                <div className="max-w-md mx-auto px-6 py-4">
                    <Stepper
                        totalSteps={3}
                        currentStep={1}
                        onStepClick={handleGlobalStepClick}
                        activeClassName="bg-emerald-600 text-white"
                        completedClassName="bg-emerald-100 text-emerald-600"
                        connectorClassName="bg-emerald-600"
                    />
                    <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-2 px-1">
                        <span className="text-emerald-600">Select Plan</span>
                        <span className="cursor-pointer hover:text-emerald-600 text-center">Details</span>
                        <span className="cursor-pointer hover:text-emerald-600 text-center">Verification</span>
                    </div>
                </div>
            </div>

            {/* --- SECTION 3: SCROLLABLE CONTENT (Cards) --- */}
            <div className="max-w-2xl mx-auto px-4 pb-12 pt-8 space-y-8">

                {/* Description Text */}
                <p className="text-center text-xl text-gray-500">
                    Connect with your customers directly on WhatsApp. Select a package that suits your volume.
                </p>

                {/* Cards Loop */}
                {WHATSAPP_PLANS.map((plan) => {
                    const isExpanded = expandedPlanId === plan.id;
                    const isPopular = plan.tags.includes('MOST POPULAR');

                    return (
                        <div
                            key={plan.id}
                            className={`relative bg-white rounded-xs border transition-all duration-300 ${isExpanded
                                ? 'border-emerald-500 ring-1 ring-emerald-500 shadow-lg'
                                : 'border-gray-200 hover:border-gray-300 shadow-sm'
                                }`}
                        >
                            {/* Floating Badge */}
                            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-10">
                                {plan.tags.map(tag => (
                                    <span
                                        key={tag}
                                        className={`px-4 py-1 rounded-xs text-[10px] font-bold uppercase tracking-wider shadow-sm border transition-colors duration-300 ${
                                            // LOGIC CHANGE HERE:
                                            // Highlight if it's the "Popular" tag OR if the card is currently expanded
                                            (isPopular || isExpanded)
                                                ? 'bg-emerald-500 text-white border-emerald-600'
                                                : 'bg-white text-gray-500 border-gray-200'
                                            }`}
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>

                            {/* Card Header */}
                            <div
                                onClick={() => toggleExpand(plan.id)}
                                className="p-6 cursor-pointer flex justify-between items-start pt-8"
                            >
                                {/* Left Side: Titles */}
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">{plan.subtitle}</h3>
                                    <p className="text-emerald-600 text-sm font-medium mt-1">{plan.name}</p>
                                </div>

                                {/* Right Side: Price Group & Chevron */}
                                <div className="flex items-center gap-4">
                                    {/* Price & Duration Column */}
                                    <div className="text-right">
                                        <div className="text-2xl font-bold text-gray-900 leading-none">
                                            ₹{plan.price.toLocaleString()}
                                        </div>
                                        <div className="text-gray-400 text-xs mt-1 font-medium">
                                            per {plan.duration.toLowerCase()}
                                        </div>
                                    </div>

                                    {/* Chevron Icon */}
                                    <div className={`transition-transform duration-300 text-gray-400 ${isExpanded ? 'rotate-180' : ''}`}>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M6 9l6 6 6-6" />
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            {/* Dropdown Details */}
                            <div className={`transition-all duration-300 ease-in-out bg-gray-50/50 overflow-hidden ${isExpanded ? 'max-h-[500px] opacity-100 border-t border-gray-100' : 'max-h-0 opacity-0'}`}>
                                <div className="p-6">
                                    <div className="mb-6">
                                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">What's included</h4>
                                        <ul className="grid grid-cols-1 gap-y-3">
                                            {plan.features.map((feature, idx) => (
                                                <li key={idx} className="flex items-center text-sm text-gray-600">
                                                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center mr-3 flex-shrink-0">
                                                        <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    </div>
                                                    {feature}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleSelectPlan(plan);
                                        }}
                                        className={`w-full py-3.5 rounded-xs font-bold text-white shadow-sm transition-all transform active:scale-[0.98] ${plan.recommended
                                            ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
                                            : 'bg-gray-900 hover:bg-gray-800'
                                            }`}
                                    >
                                        Select {plan.subtitle}
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default WhatsAppSubscriptionPage;