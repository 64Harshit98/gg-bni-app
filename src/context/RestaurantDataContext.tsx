import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { collection, doc, onSnapshot, runTransaction } from 'firebase/firestore';
import { db } from '../lib/Firebase';
import { useAuth } from './auth-context';
import { useOptionalItemSettings, useOptionalSalesSettings } from './SettingsContext';
import { COL, planAllowsRestaurant, type RawMaterial, type RawMaterialCategory, type Recipe } from '../lib/restaurant/types';

interface RestaurantDataValue {
  /** True when the company runs in restaurant mode. Everything below is empty otherwise. */
  isRestaurant: boolean;
  rawMaterials: RawMaterial[];
  rawMaterialMap: Map<string, RawMaterial>;
  categories: RawMaterialCategory[];
  recipes: Recipe[];
  recipeMap: Map<string, Recipe>;
  loading: boolean;
}

const EMPTY: RestaurantDataValue = {
  isRestaurant: false,
  rawMaterials: [],
  rawMaterialMap: new Map(),
  categories: [],
  recipes: [],
  recipeMap: new Map(),
  loading: false,
};

const RestaurantDataContext = createContext<RestaurantDataValue>(EMPTY);

/**
 * Live raw materials, categories and recipes. Listeners only open when the
 * company is in restaurant mode (`restaurantMode` on its sales settings), so
 * retail accounts pay nothing for this.
 */
export const RestaurantDataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const salesSettings = useOptionalSalesSettings();
  const companyId = currentUser?.companyId;
  // Restaurant mode needs a plan with item billing (Basic is calculator-only, which bills
  // custom amounts with no recipe behind them). On other plans the flag is kept but inert.
  const isRestaurant =
    !!companyId &&
    (salesSettings as any)?.restaurantMode === true &&
    planAllowsRestaurant((currentUser as any)?.Subscription?.pack);

  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [categories, setCategories] = useState<RawMaterialCategory[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loaded, setLoaded] = useState({ raw: false, cat: false, rec: false });

  // Restaurants sell with add-ons (extra cheese, toppings…), so restaurant mode turns
  // Item add-ons on — ONCE. The marker means an owner who later switches add-ons off
  // in Item Settings keeps it off.
  const { itemSettings, loading: itemSettingsLoading } = useOptionalItemSettings();
  const addOnsDefaulted = (itemSettings as { restaurantAddOnsDefaulted?: boolean } | null)?.restaurantAddOnsDefaulted === true;
  useEffect(() => {
    if (!isRestaurant || !companyId || itemSettingsLoading || addOnsDefaulted) return;
    const ref = doc(db, 'companies', companyId, 'settings', 'item-settings');
    runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      // No doc yet: the app's default-settings setup creates it, and that snapshot re-runs this
      if (!snap.exists() || snap.data()?.restaurantAddOnsDefaulted === true) return;
      tx.update(ref, { enableAddOns: true, restaurantAddOnsDefaulted: true });
    }).catch((e) => console.error('Restaurant mode: could not turn on item add-ons', e));
  }, [isRestaurant, companyId, itemSettingsLoading, addOnsDefaulted]);

  useEffect(() => {
    if (!isRestaurant || !companyId) {
      setRawMaterials([]);
      setCategories([]);
      setRecipes([]);
      setLoaded({ raw: false, cat: false, rec: false });
      return;
    }
    const base = ['companies', companyId] as const;
    const fail = (what: string) => (e: unknown) => console.error(`Restaurant data: ${what} listener failed`, e);
    const unsubs = [
      onSnapshot(
        collection(db, ...base, COL.rawMaterials),
        (s) => {
          setRawMaterials(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RawMaterial, 'id'>) })));
          setLoaded((l) => ({ ...l, raw: true }));
        },
        fail('rawMaterials'),
      ),
      onSnapshot(
        collection(db, ...base, COL.categories),
        (s) => {
          setCategories(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RawMaterialCategory, 'id'>) })));
          setLoaded((l) => ({ ...l, cat: true }));
        },
        fail('categories'),
      ),
      onSnapshot(
        collection(db, ...base, COL.recipes),
        (s) => {
          setRecipes(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Recipe, 'id'>) })));
          setLoaded((l) => ({ ...l, rec: true }));
        },
        fail('recipes'),
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [isRestaurant, companyId]);

  const value = useMemo<RestaurantDataValue>(() => {
    if (!isRestaurant) return EMPTY;
    return {
      isRestaurant,
      rawMaterials,
      rawMaterialMap: new Map(rawMaterials.map((r) => [r.id, r])),
      categories,
      recipes,
      recipeMap: new Map(recipes.map((r) => [r.itemId, r])),
      loading: !(loaded.raw && loaded.cat && loaded.rec),
    };
  }, [isRestaurant, rawMaterials, categories, recipes, loaded]);

  return <RestaurantDataContext.Provider value={value}>{children}</RestaurantDataContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useRestaurantData = () => useContext(RestaurantDataContext);

/** True when the company runs in restaurant mode. Safe outside the provider (returns false). */
// eslint-disable-next-line react-refresh/only-export-components
export const useIsRestaurant = () => useContext(RestaurantDataContext).isRestaurant;
