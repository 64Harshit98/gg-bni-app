import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import type { Item } from '../../constants/models';
import { ensurePendingApprovalEntry } from '../hooks/ensureApprovalEntry';
import { getLeadData, isLeadSubmitted } from './storefront.utils';

const cleanNumber = (n?: string) => (n || '').replace(/\D/g, '').trim();

/**
 * Lead form gate + "Ask a question" + "Notify me", shared by the Store page, category and product pages.
 * Anything that needs the customer's name and number calls requireLead(action): the form opens,
 * and the action runs once they submit it.
 */
export const useCustomerActions = (companyId: string | null, approvalEnabled: boolean) => {
    const [leadOpen, setLeadOpen] = useState(false);
    const [leadPhoneKey, setLeadPhoneKey] = useState(() => cleanNumber(getLeadData().number));
    const [askItem, setAskItem] = useState<Item | null | undefined>(undefined); // undefined = closed, null = general question
    const [notified, setNotified] = useState<Record<string, boolean>>({});
    const [toast, setToast] = useState<string | null>(null);
    const pending = useRef<(() => void) | null>(null);

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 3500);
        return () => clearTimeout(t);
    }, [toast]);

    const openLead = useCallback((after?: () => void) => {
        pending.current = after ?? null;
        setLeadOpen(false);
        setTimeout(() => setLeadOpen(true), 0);
    }, []);

    /** Runs `action` now if the lead form is filled, otherwise after it is. */
    const requireLead = useCallback((action: () => void) => {
        if (isLeadSubmitted()) action();
        else openLead(action);
    }, [openLead]);

    const fetchNotified = useCallback(async () => {
        const number = cleanNumber(getLeadData().number);
        if (!companyId || !number) return;
        try {
            const snap = await getDoc(doc(db, 'companies', companyId, 'NotifyRequests', number));
            if (!snap.exists()) return;
            const map: Record<string, boolean> = {};
            (snap.data()?.items || []).forEach((i: { id?: string }) => { if (i.id) map[i.id] = true; });
            setNotified(map);
        } catch (err) {
            console.error('Fetch notify status error:', err);
        }
    }, [companyId]);

    useEffect(() => { fetchNotified(); }, [fetchNotified]);

    const onLeadSubmit = useCallback(() => {
        setLeadOpen(false);
        localStorage.setItem('leadJustSubmitted', 'true');
        const lead = getLeadData();
        const number = cleanNumber(lead.number);
        setLeadPhoneKey(number);
        // ensure this customer shows up in Approval Requests later if seller enables approval
        if (companyId && number) ensurePendingApprovalEntry(companyId, lead.name || 'Guest User', number);
        setTimeout(fetchNotified, 300);
        const action = pending.current;
        pending.current = null;
        action?.();
    }, [companyId, fetchNotified]);

    const askQuestion = useCallback((item?: Item) => {
        requireLead(() => setAskItem(item ?? null));
    }, [requireLead]);

    const submitQuestion = useCallback(async (note: string) => {
        if (!companyId) return;
        const item = askItem ?? null;
        const lead = getLeadData();
        const number = cleanNumber(lead.number);
        if (!number) { openLead(() => setAskItem(item)); return; }
        try {
            await setDoc(doc(db, 'companies', companyId, 'PersonalizationRequests', `${number}_${String(item?.id ?? Date.now())}`), {
                customerName: lead.name || 'Guest User',
                customerNumber: number,
                itemId: String(item?.id ?? ''),
                itemName: String(item?.name ?? 'General Request'),
                itemImage: String(item?.imageUrl ?? ''),
                note: note.trim(),
                status: 'pending',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            }, { merge: true });
            ensurePendingApprovalEntry(companyId, lead.name || 'Guest User', number);
            setAskItem(undefined);
            setToast("Question sent. The shop will get back to you soon.");
        } catch (err) {
            console.error('Personalization error:', err);
        }
    }, [companyId, askItem, openLead]);

    const notify = useCallback(async (item: Item) => {
        if (!companyId) return;
        if (notified[item.id!]) { setToast("You're already on the list. We'll tell you when it's back."); return; }
        const run = async () => {
            const lead = getLeadData();
            const number = cleanNumber(lead.number);
            if (!number) { openLead(run); return; }
            try {
                const ref = doc(db, 'companies', companyId, 'NotifyRequests', number);
                const snap = await getDoc(ref);
                const existing: { id?: string }[] = snap.exists() ? snap.data()?.items || [] : [];
                const items = existing.find((i) => i.id === item.id)
                    ? existing
                    : [...existing, { id: item.id, name: item.name, qty: 1, inStock: (item.stock || 0) > 0 }];
                await setDoc(ref, {
                    customerName: lead.name || 'Guest User', customerNumber: number, type: 'notify', items,
                    inStock: false, messageSent: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
                }, { merge: true });
                ensurePendingApprovalEntry(companyId, lead.name || 'Guest User', number);
                setNotified((p) => ({ ...p, [item.id!]: true }));
                setToast("We'll let you know when it's back in stock.");
            } catch (err) {
                console.error('Notify error:', err);
            }
        };
        // Same check the storefront has always used for Notify me
        if (!approvalEnabled || isLeadSubmitted()) run();
        else openLead(run);
    }, [companyId, approvalEnabled, notified, openLead]);

    return {
        leadOpen, openLead, requireLead, onLeadSubmit, leadPhoneKey,
        askOpen: askItem !== undefined, askItem, askQuestion, closeAsk: () => setAskItem(undefined), submitQuestion,
        notified, notify, toast, setToast,
    };
};
