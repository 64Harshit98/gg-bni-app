import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SlidersHorizontal, Star } from 'lucide-react';
import { db } from '../lib/Firebase';
import { useAuth } from '../context/auth-context';
import { useOptionalLoyaltySettings } from '../context/SettingsContext';
import ShowWrapper from '../context/ShowWrapper';
import { Permissions } from '../enums';
import { ROUTES } from '../constants/routes.constants';
import { fetchLoyaltyAccount, normalizeLoyaltyPhone, pointsToRupees, type LoyaltyAccount } from '../lib/loyalty';
import LoyaltyAdjustModal from './LoyaltyAdjustModal';

// A customer's loyalty points on their Party Ledger page. Everyone who can
// open the ledger sees the balance; adding/removing needs ManageLoyaltyPoints.

const PartyLoyaltyCard: React.FC<{ phone: string | undefined; name: string }> = ({ phone, name }) => {
    const { currentUser } = useAuth();
    const settings = useOptionalLoyaltySettings();
    const key = normalizeLoyaltyPhone(phone);
    const [account, setAccount] = useState<LoyaltyAccount | null>(null);
    const [adjustOpen, setAdjustOpen] = useState(false);

    useEffect(() => {
        setAccount(null);
        if (!key || !currentUser?.companyId) return;
        let cancelled = false;
        fetchLoyaltyAccount(db, currentUser.companyId, key)
            .then((acc) => { if (!cancelled) setAccount(acc); })
            .catch((err) => console.error('Failed to load loyalty points', err));
        return () => { cancelled = true; };
    }, [key, currentUser?.companyId]);

    // Hide when there's no phone, or loyalty is off and the customer never had points.
    if (!key || !account) return null;
    if (!settings?.enabled && account.balance === 0 && account.lifetimeEarned === 0) return null;

    return (
        <section className="flex flex-wrap items-center gap-3 rounded-sm border border-line bg-white p-4 shadow-card">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-amber-50 text-amber-700">
                <Star size={16} />
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-700">Loyalty points</p>
                <p className="text-xs text-slate-500">
                    Earned {account.lifetimeEarned} · used {account.lifetimeRedeemed}
                    {settings && account.balance > 0 ? ` · worth ₹${pointsToRupees(account.balance, settings).toLocaleString('en-IN')}` : ''}
                </p>
            </div>
            <p className={`text-2xl font-bold tabular-nums ${account.balance < 0 ? 'text-red-600' : 'text-slate-900'}`}>{account.balance} pts</p>
            <ShowWrapper requiredPermission={Permissions.ManageLoyaltyPoints}>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => setAdjustOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-400"
                    >
                        <SlidersHorizontal size={15} /> Adjust points
                    </button>
                    <Link to={ROUTES.LOYALTY_POINTS} className="inline-flex items-center rounded-sm px-2 py-2 text-sm font-medium text-blue-600 hover:underline">
                        History
                    </Link>
                </div>
            </ShowWrapper>
            <LoyaltyAdjustModal
                isOpen={adjustOpen}
                onClose={() => setAdjustOpen(false)}
                phone={key}
                name={name}
                balance={account.balance}
                onSaved={(balance) => setAccount((a) => (a ? { ...a, balance } : a))}
            />
        </section>
    );
};

export default PartyLoyaltyCard;
