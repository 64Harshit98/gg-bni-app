import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/auth-context';
import { ROUTES } from '../../constants/indesx';

const SUPER_ADMIN_UIDS = [
    "6vwZ1HRqX7VSnh5KP4JW0TKeuZm2",
    "1AKioGfop8PmHhry6uXOz8Rw6qT2"
];

const tiles = [
    {
        label: 'Manage Companies',
        description: 'View, edit and manage all company subscriptions & plans',
        route: '/super-admin/companies',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-7 h-7">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
            </svg>
        ),
        iconClass: 'bg-blue-50 text-blue-600',
        textClass: 'text-blue-600',
    },
    {
        label: 'App Key Leads',
        description: 'Track and manage leads generated through the Sellar app',
        route: '/leads',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-7 h-7">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
            </svg>
        ),
        iconClass: 'bg-green-50 text-green-600',
        textClass: 'text-green-600',
    },
    {
        label: 'Web Customer Queries',
        description: 'Review queries submitted from the website',
        route: '/super-admin/website-leads',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-7 h-7">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
            </svg>
        ),
        iconClass: 'bg-yellow-50 text-yellow-600',
        textClass: 'text-yellow-600',
    },
    {
        label: 'Support Tickets',
        description: 'Manage open and closed support tickets from customers',
        route: '/super-admin/support',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-7 h-7">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
            </svg>
        ),
        iconClass: 'bg-red-50 text-red-500',
        textClass: 'text-red-500',
    },
    {
        label: 'Agents & Partners',
        description: 'View and manage agent and partner accounts',
        route: ROUTES.AGENT_DASHBOARD,
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-7 h-7">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
        ),
        iconClass: 'bg-purple-50 text-purple-500',
        textClass: 'text-purple-600',
    },

];

const SuperAdminHub: React.FC = () => {
    const { currentUser } = useAuth();
    const navigate = useNavigate();

    if (!currentUser || !SUPER_ADMIN_UIDS.includes(currentUser.uid)) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <div className="text-center">
                    <div className="text-5xl mb-3">⛔</div>
                    <p className="text-red-500 font-bold text-xl">ACCESS DENIED</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 p-2 pb-16 md:p-6 md:pb-16 font-sans">

            {/* Header — matches every other page exactly */}
            <div className="flex items-center justify-between pb-3 border-b mb-4">
                <div className="w-8" /> {/* left spacer to balance UID badge */}
                <h1 className="flex-1 text-xl text-center font-bold text-gray-800 md:text-2xl">
                    Super Admin
                </h1>
                <span className="text-[10px] font-mono text-gray-400 bg-gray-200 px-2 py-1 rounded">
                    {currentUser?.uid?.slice(0, 8)}...
                </span>
            </div>

            {/* Section label */}
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 ml-1">
                Choose a section
            </p>

            {/* Tiles grid — full width, 2 columns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {tiles.map((tile) => (
                    <div
                        key={tile.label}
                        onClick={() => navigate(tile.route)}
                        className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-start gap-4 cursor-pointer transition-all hover:shadow-md hover:border-gray-300 active:scale-[0.98]"
                    >
                        {/* Icon box */}
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${tile.iconClass}`}>
                            {tile.icon}
                        </div>

                        {/* Text */}
                        <div className="flex-1">
                            <p className="text-base font-bold text-gray-800 mb-1">
                                {tile.label}
                            </p>
                            <p className="text-sm text-gray-500 leading-snug mb-3">
                                {tile.description}
                            </p>
                            <span className={`text-sm font-semibold ${tile.textClass}`}>
                                Open →
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default SuperAdminHub;