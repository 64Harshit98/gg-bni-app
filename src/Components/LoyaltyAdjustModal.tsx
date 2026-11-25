import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Minus, Plus, Star, X } from 'lucide-react';
import { db } from '../lib/Firebase';
import { useAuth } from '../context/auth-context';
import { LoyaltyBalanceError, adjustLoyaltyPoints } from '../lib/loyalty';

// Add or remove a customer's loyalty points by hand. Only render this for
// users with Permissions.ManageLoyaltyPoints — the callers wrap it in ShowWrapper.
// Shared by POS (theme="blue") and Catalogue (theme="orange").

interface LoyaltyAdjustModalProps {
    isOpen: boolean;
    onClose: () => void;
    phone: string;
    name?: string;
    balance: number;
    /** Called with the new balance after a successful save. */
    onSaved?: (newBalance: number) => void;
    theme?: 'blue' | 'orange';
}

// Full class strings so Tailwind can detect them (no .replace() tricks)
interface ThemeStyles {
    outline: string;
    within: string;
    hoverBg: string;
    sunken: string;
    border: string;
    primaryBg: string;
    primaryHover: string;
    shadow: string;
}

const THEMES: Record<'blue' | 'orange', ThemeStyles> = {
    blue: {
        outline: 'focus-visible:outline-[#155dfc]',
        within: 'focus-within:outline-[#155dfc]',
        hoverBg: 'hover:bg-[#f5f7ff]',
        sunken: 'bg-[#f5f7ff]',
        border: 'border-[#dfe6fb]',
        primaryBg: 'bg-[#155dfc]',
        primaryHover: 'hover:bg-[#1447e6]',
        shadow: 'shadow-[0_10px_28px_rgba(21,48,140,.14),0_2px_6px_rgba(21,48,140,.08)]',
    },
    orange: {
        outline: 'focus-visible:outline-[#ea580c]',
        within: 'focus-within:outline-[#ea580c]',
        hoverBg: 'hover:bg-[#fff8f2]',
        sunken: 'bg-[#fff8f2]',
        border: 'border-[#f6e1d0]',
        primaryBg: 'bg-[#c2410c]',
        primaryHover: 'hover:bg-[#9a3412]',
        shadow: 'shadow-[0_10px_28px_rgba(194,65,12,.14),0_2px_6px_rgba(194,65,12,.08)]',
    },
};

const FOCUS_BASE = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

const LoyaltyAdjustModal: React.FC<LoyaltyAdjustModalProps> = ({
    isOpen, onClose, phone, name, balance, onSaved, theme = 'blue',
}) => {
    const t = THEMES[theme];
    const FOCUS_RING = `${FOCUS_BASE} ${t.outline}`;
    const FIELD = `flex h-10 items-center gap-2 border border-[#7a8aa3] bg-white px-3 rounded-sm focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 ${t.within}`;

    const { currentUser } = useAuth();
    const [mode, setMode] = useState<'add' | 'remove'>('add');
    const [points, setPoints] = useState('');
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setMode('add');
        setPoints('');
        setReason('');
        setError('');
    }, [isOpen, phone]);

    if (!isOpen) return null;

    const qty = Math.max(0, Math.floor(Number(points) || 0));
    const delta = mode === 'add' ? qty : -qty;
    const newBalance = balance + delta;

    const handleSave = async () => {
        setError('');
        if (qty <= 0) return setError('Enter how many points.');
        if (!reason.trim()) return setError('Please give a reason — it is kept in the points history.');
        if (newBalance < 0) return setError(`Can't remove more than the ${balance} pts they have.`);
        if (!currentUser?.companyId) return;
        setSaving(true);
        try {
            const after = await adjustLoyaltyPoints(db, currentUser.companyId, {
                phone,
                name,
                points: delta,
                reason,
                actor: { uid: currentUser.uid, name: currentUser.name || '' },
            });
            onSaved?.(after);
            onClose();
        } catch (err) {
            console.error('Failed to adjust loyalty points', err);
            setError(err instanceof LoyaltyBalanceError || err instanceof Error ? err.message : 'Could not save. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return createPortal(
        <div
            className="fixed inset-0 z-[2100] flex items-end justify-center bg-[rgba(15,23,43,.45)] p-0 sm:items-center sm:p-4"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="loyalty-adjust-title"
                className={`grid w-full max-w-[420px] gap-4 rounded-sm bg-white p-5 font-['Poppins',system-ui,sans-serif] text-sm text-[#0f172b] ${t.shadow}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 flex-none place-items-center rounded-sm bg-[#fff3dd] text-[#bb4d00]">
                        <Star size={18} strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h3 id="loyalty-adjust-title" className="m-0 text-base font-semibold leading-6">Adjust points</h3>
                        <p className="m-0 truncate text-xs text-[#5b6b86]">{name ? `${name} · ` : ''}{phone} · {balance} pts now</p>
                    </div>
                    <button type="button" aria-label="Close" onClick={onClose} className={`grid h-8 w-8 place-items-center rounded-sm text-[#45556c] ${t.hoverBg} ${FOCUS_RING}`}>
                        <X size={18} />
                    </button>
                </div>

                <div role="group" aria-label="Add or remove" className={`flex gap-0.5 rounded-sm border ${t.border} ${t.sunken} p-[3px]`}>
                    {(['add', 'remove'] as const).map((m) => (
                        <button
                            key={m}
                            type="button"
                            aria-pressed={mode === m}
                            onClick={() => setMode(m)}
                            className={`inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-sm text-sm font-medium ${FOCUS_RING} ${
                                mode === m ? 'bg-[#0f172b] text-white' : 'text-[#45556c]'
                            }`}
                        >
                            {m === 'add' ? <Plus size={15} /> : <Minus size={15} />}
                            {m === 'add' ? 'Add points' : 'Remove points'}
                        </button>
                    ))}
                </div>

                <div>
                    <label htmlFor="loyalty-adjust-points" className="mb-1 block text-xs font-medium text-[#45556c]">Points</label>
                    <div className={FIELD}>
                        <input
                            id="loyalty-adjust-points"
                            type="number"
                            inputMode="numeric"
                            min={1}
                            step={1}
                            autoFocus
                            value={points}
                            onChange={(e) => setPoints(e.target.value)}
                            className="min-w-0 flex-1 border-0 bg-transparent text-sm tabular-nums outline-none"
                            placeholder="0"
                        />
                        <span className="text-[#5b6b86]">pts</span>
                    </div>
                </div>

                <div>
                    <label htmlFor="loyalty-adjust-reason" className="mb-1 block text-xs font-medium text-[#45556c]">Reason</label>
                    <div className={FIELD}>
                        <input
                            id="loyalty-adjust-reason"
                            type="text"
                            maxLength={120}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-[#5b6b86]"
                            placeholder={mode === 'add' ? 'e.g. Birthday bonus' : 'e.g. Points given by mistake'}
                        />
                    </div>
                </div>

                <div className={`flex items-center justify-between rounded-sm ${t.sunken} px-3 py-2 text-xs text-[#45556c]`}>
                    <span>New balance</span>
                    <b className={`text-sm tabular-nums ${newBalance < 0 ? 'text-[#d5000c]' : 'text-[#0f172b]'}`}>{newBalance} pts</b>
                </div>

                {error && <p className="m-0 rounded-sm border border-[#ffd2d6] bg-[#ffeef0] px-3 py-2 text-xs font-medium text-[#d5000c]">{error}</p>}

                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className={`inline-flex h-10 items-center rounded-sm border border-[#7a8aa3] bg-white px-4 text-sm font-medium ${t.hoverBg} ${FOCUS_RING}`}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className={`inline-flex h-10 min-w-[120px] items-center justify-center rounded-sm px-4 text-sm font-medium text-white disabled:opacity-[.45] ${t.primaryBg} ${t.primaryHover} ${FOCUS_RING}`}
                    >
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default LoyaltyAdjustModal;