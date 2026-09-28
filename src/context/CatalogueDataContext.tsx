import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/Firebase';
import { useAuth, useDatabase } from './auth-context';
import { Role, type User } from '../Role/permission';
import type { Item, ItemGroup } from '../constants/models';

interface CatalogueDataContextType {
    items: Item[];
    itemsLoading: boolean;
    workers: User[];
    workersLoading: boolean;
    itemGroups: ItemGroup[];
    itemGroupsLoading: boolean;
}

const CatalogueDataContext = createContext<CatalogueDataContextType | undefined>(undefined);

// Single shared source for items/workers/itemGroups, fetched once per
// session instead of by every page that needs them (previously: every one
// of ~16 pages ran its own dbOperations.syncItems()/getWorkers()/itemGroups
// getDocs() on mount). Mirrors the pattern SettingsContext already uses for
// settings docs — one onSnapshot per resource, keyed only off the primitive
// currentUser?.companyId (not the currentUser/dbOperations object refs,
// which get reconstructed on auth token refresh) so it can't be re-fired by
// auth-object churn the way each page's own fetch effect could be.
export const CatalogueDataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { currentUser } = useAuth();
    const dbOperations = useDatabase();
    const companyId = currentUser?.companyId;

    const [items, setItems] = useState<Item[]>([]);
    const [itemsLoading, setItemsLoading] = useState(true);

    const [workers, setWorkers] = useState<User[]>([]);
    const [workersLoading, setWorkersLoading] = useState(true);

    const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
    const [itemGroupsLoading, setItemGroupsLoading] = useState(true);

    // Rides on dbOperations.listenToItems (see ItemsFirebase.ts): loads the
    // idb-keyval local cache first, then opens a delta onSnapshot listener
    // (only docs changed since the last sync). Replaces every page's own
    // one-shot syncItems() fetch AND the separate useLiveItemsStock hook
    // that only patched the `stock` field on top of it — this is now the
    // single live source for the full item record everywhere.
    useEffect(() => {
        if (!companyId || !dbOperations) {
            setItemsLoading(!!companyId);
            return;
        }
        setItemsLoading(true);
        const unsubscribe = dbOperations.listenToItems((liveItems: Item[]) => {
            setItems(liveItems);
            setItemsLoading(false);
        });
        return () => unsubscribe();
    }, [companyId, dbOperations]);

    // onSnapshot instead of the old one-shot getWorkers() getDocs — also
    // fixes a pre-existing gap where a worker added via AddUserModal never
    // showed up in the salesman list until a full reload, since nothing
    // ever re-ran the one-shot fetch after initial mount.
    useEffect(() => {
        if (!companyId) {
            setWorkers([]);
            setWorkersLoading(false);
            return;
        }
        setWorkersLoading(true);
        const usersRef = collection(db, 'companies', companyId, 'users');
        const q = query(usersRef, where('role', 'in', [Role.Salesman, Role.Manager]));
        const unsubscribe = onSnapshot(q, (snap) => {
            setWorkers(snap.docs.map((d) => ({ uid: d.id, ...d.data() })) as User[]);
            setWorkersLoading(false);
        }, (error) => {
            console.error('Error fetching workers:', error);
            setWorkersLoading(false);
        });
        return () => unsubscribe();
    }, [companyId]);

    // onSnapshot instead of the old one-shot itemGroups getDocs, duplicated
    // (with slightly different query shapes) across Sales/Purchase/Shop/
    // ItemAdd/ItemGroup/Orders/reports. Exposed as the full ItemGroup[] (not
    // pre-reduced to an id->name map) since some consumers (Shop storefront,
    // ItemGroup management page) need the full records, not just names —
    // callers that only need the map derive it locally with a one-line memo.
    useEffect(() => {
        if (!companyId) {
            setItemGroups([]);
            setItemGroupsLoading(false);
            return;
        }
        setItemGroupsLoading(true);
        const groupsRef = collection(db, 'companies', companyId, 'itemGroups');
        const unsubscribe = onSnapshot(groupsRef, (snap) => {
            setItemGroups(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ItemGroup[]);
            setItemGroupsLoading(false);
        }, (error) => {
            console.error('Error fetching item groups:', error);
            setItemGroupsLoading(false);
        });
        return () => unsubscribe();
    }, [companyId]);

    const contextValue: CatalogueDataContextType = {
        items, itemsLoading,
        workers, workersLoading,
        itemGroups, itemGroupsLoading,
    };

    return (
        <CatalogueDataContext.Provider value={contextValue}>
            {children}
        </CatalogueDataContext.Provider>
    );
};

export const useCatalogueData = () => {
    const context = useContext(CatalogueDataContext);
    if (context === undefined) {
        throw new Error('useCatalogueData must be used within a CatalogueDataProvider');
    }
    return context;
};
