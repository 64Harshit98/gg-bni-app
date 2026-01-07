import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore'; // Import Timestamp
import { db } from '../lib/Firebase';
import { useAuth } from './auth-context';
import { useFilter } from '../Components/Filter';

// --- Configuration ---
const CACHE_KEY = 'dashboard_cache';
const AUTO_REFRESH_INTERVAL = 60 * 60 * 1000; // 1 Hour

// --- Types ---
export interface SaleDoc {
    id: string;
    totalAmount: number;
    paymentMethods?: { [key: string]: number };
    items?: any[];
    createdAt: Timestamp; // This must remain Timestamp for your app compatibility
    salespersonId?: string;
    customerId?: string;
    customerName?: string;
}

interface DashboardContextType {
    salesData: SaleDoc[];
    loading: boolean;
    error: string | null;
    lastUpdated: Date | null;
    refreshDashboard: () => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export const DashboardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { currentUser } = useAuth();
    const { filters } = useFilter();

    // 1. Initialize State from LocalStorage with REHYDRATION
    const [salesData, setSalesData] = useState<SaleDoc[]>(() => {
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const parsed = JSON.parse(cached);

                // Security Check
                if (parsed.companyId === currentUser?.companyId) {

                    // --- THE FIX: Convert plain JSON back to Firestore Timestamps ---
                    return parsed.data.map((doc: any) => ({
                        ...doc,
                        createdAt: new Timestamp(doc.createdAt.seconds, doc.createdAt.nanoseconds)
                    }));
                }
            }
        } catch (e) {
            console.error("Cache parse error", e);
        }
        return [];
    });

    const [lastUpdated, setLastUpdated] = useState<Date | null>(() => {
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const parsed = JSON.parse(cached);
                return new Date(parsed.timestamp);
            }
        } catch (e) { }
        return null;
    });

    const lastFiltersRef = useRef<string>('');
    const [loading, setLoading] = useState(salesData.length === 0);
    const [error, setError] = useState<string | null>(null);

    // --- Main Fetch Function ---
    const fetchDashboardData = async (force = false) => {
        if (!currentUser?.companyId || !filters.startDate || !filters.endDate) {
            setLoading(false);
            return;
        }

        const start = new Date(filters.startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);

        const currentFilterKey = `${currentUser.companyId}-${start.getTime()}-${end.getTime()}`;

        // Staleness Check
        const isFilterChanged = currentFilterKey !== lastFiltersRef.current;
        const isCacheExpired = lastUpdated && (new Date().getTime() - lastUpdated.getTime() > AUTO_REFRESH_INTERVAL);
        const hasData = salesData.length > 0;

        if (!force && !isFilterChanged && !isCacheExpired && hasData) {
            console.log("Using Cached Dashboard Data (0 Reads)");
            setLoading(false);
            return;
        }

        if (isFilterChanged) setLoading(true);
        setError(null);

        try {
            console.log("Fetching New Dashboard Data...");

            const salesQuery = query(
                collection(db, 'companies', currentUser.companyId, 'sales'),
                where('createdAt', '>=', start),
                where('createdAt', '<=', end),
                orderBy('createdAt', 'asc')
            );

            const salesSnapshot = await getDocs(salesQuery);
            const salesDocs = salesSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                // Firestore returns a Timestamp object here automatically
            } as SaleDoc));

            const now = new Date();

            setSalesData(salesDocs);
            setLastUpdated(now);
            lastFiltersRef.current = currentFilterKey;

            // Save to LocalStorage (Timestamp will become { seconds: ..., nanoseconds: ... })
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                companyId: currentUser.companyId,
                timestamp: now.getTime(),
                filterKey: currentFilterKey,
                data: salesDocs
            }));

        } catch (err: any) {
            console.error("Dashboard Fetch Error:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Effect 1: Handle Filter Changes
    useEffect(() => {
        fetchDashboardData();
    }, [currentUser, filters.startDate, filters.endDate]);

    // Effect 2: Auto-Refresh Interval
    useEffect(() => {
        const interval = setInterval(() => {
            console.log("Auto-refreshing dashboard...");
            fetchDashboardData(true);
        }, AUTO_REFRESH_INTERVAL);

        return () => clearInterval(interval);
    }, [currentUser, filters]);

    const handleManualRefresh = () => {
        setLoading(true);
        fetchDashboardData(true);
    };

    return (
        <DashboardContext.Provider value={{
            salesData,
            loading,
            error,
            lastUpdated,
            refreshDashboard: handleManualRefresh
        }}>
            {children}
        </DashboardContext.Provider>
    );
};

export const useDashboard = () => {
    const context = useContext(DashboardContext);
    if (!context) throw new Error("useDashboard must be used within a DashboardProvider");
    return context;
};