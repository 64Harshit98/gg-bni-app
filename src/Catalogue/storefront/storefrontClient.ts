import { collection, doc, getDocFromServer, getDocsFromServer, limit, query, where } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { getSubdomain } from '../../lib/subdomain';
import type { Item, ItemGroup } from '../../constants/models';
import type { CatalogueSalesSettings } from '../Settings/CatalogueSalesSetting';
import type { StorePageDoc } from './storePage.types';

// Single data layer for the public storefront pages (StorePage, CategoryPage,
// CheckOut). Replaces per-page subdomain resolvers and serial Firestore
// waterfalls with:
//   1. the /api/storefront bundle — one cached HTTP GET, tenant resolved
//      server-side (getPublicStorefront function, proxied/rewritten by
//      index.js on App Hosting and firebase.json on Firebase Hosting),
//      picked up from index.html's early prefetch when available;
//   2. if that fails or isn't deployed (e.g. Vite dev), the same reads via
//      the Firestore client SDK, in parallel — server reads only: plain
//      getDocs/getDoc quietly answer from the (empty) local cache when the
//      device is offline, which used to show a valid store as "not found";
// each under a hard timeout, so every load ends in data, "not found" or a
// retryable error — never an endless spinner.

// Keep in step with STOREFRONT_BUSINESS_FIELDS in functions/lib/index.js: that
// list decides which of these fields the public bundle carries.
export interface StorefrontBusinessInfo {
  businessName?: string;
  companyLogo?: string;
  phoneNumber?: string;
  whatsappNumber?: string;
  email?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  gstin?: string;
  instagram?: string;
  facebook?: string;
  twitter?: string;
  gmail?: string;
  brandingText?: string;
  businessCategory?: string;
  businessType?: string;
}

export interface StorefrontData {
  companyId: string;
  businessInfo: StorefrontBusinessInfo | null;
  catalogueSettings: CatalogueSalesSettings | null;
  pinnedCategoryIds: string[];
  pinnedItemIds: string[];
  itemGroups: ItemGroup[];
  items: Item[];
  storePage: StorePageDoc | null;
  enableAddOns: boolean;
  addOnTemplates: ({ id: string } & Record<string, unknown>)[];
}

export type StorefrontTarget =
  | { kind: 'sub'; sub: string }
  | { kind: 'company'; companyId: string };

export class StorefrontNotFoundError extends Error {
  constructor() {
    super('Store not found');
    this.name = 'StorefrontNotFoundError';
  }
}

declare global {
  interface Window {
    // Set by the inline script in index.html.
    __SF_PREFETCH__?: { key: string; promise: Promise<Response> };
  }
}

const API_TIMEOUT_MS = 10_000;
const FIRESTORE_TIMEOUT_MS = 15_000;

// A merchant subdomain always wins; otherwise the company id from the URL
// path (legacy /catalogue/:companyId links on the main domain).
export const getStorefrontTarget = (pathCompanyId?: string | null): StorefrontTarget | null => {
  const sub = getSubdomain();
  if (sub) return { kind: 'sub', sub };
  if (pathCompanyId) return { kind: 'company', companyId: pathCompanyId };
  return null;
};

// Must match the key format the index.html prefetch builds.
export const storefrontKey = (target: StorefrontTarget): string =>
  target.kind === 'sub'
    ? `sub=${encodeURIComponent(target.sub)}`
    : `cId=${encodeURIComponent(target.companyId)}`;

const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });

// The merchant moved to a new subdomain: send the buyer there, keeping the
// page they were on. The returned promise never settles — the page is
// navigating away, so the caller should just keep showing its loader.
const redirectToSubdomain = (sub: string): Promise<never> => {
  const labels = window.location.hostname.split('.');
  labels[0] = sub;
  window.location.replace(
    `${window.location.protocol}//${labels.join('.')}${window.location.pathname}${window.location.search}`
  );
  return new Promise<never>(() => {});
};

const takePrefetch = (key: string): Promise<Response> | null => {
  const prefetch = window.__SF_PREFETCH__;
  if (!prefetch || prefetch.key !== key) return null;
  delete window.__SF_PREFETCH__; // a Response body can only be read once
  return prefetch.promise;
};

const fetchStorefrontApi = (key: string): Promise<Response> => {
  const controller = new AbortController();
  // Deliberately not cleared when headers arrive: the abort has to cover the
  // body download too, and aborting a fully-read response is a no-op.
  setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  return fetch(`/api/storefront?${key}`, {
    credentials: 'omit',
    headers: { Accept: 'application/json' },
    signal: controller.signal,
  });
};

const loadViaApi = async (key: string): Promise<StorefrontData> => {
  const response = await (takePrefetch(key) ?? fetchStorefrontApi(key));

  // Anything that isn't JSON is not our endpoint answering — e.g. the SPA
  // fallback serving index.html in dev, or the route not deployed yet — so
  // it's treated as "API unavailable", never as "store not found".
  const isJson = (response.headers.get('content-type') || '').includes('application/json');
  if (response.status === 404 && isJson) throw new StorefrontNotFoundError();
  if (!response.ok || !isJson) throw new Error(`Storefront API responded ${response.status}`);

  const body = (await response.json()) as StorefrontData | { redirectToSubdomain: string };
  if ('redirectToSubdomain' in body) return redirectToSubdomain(body.redirectToSubdomain);
  // A bundle from before store pages and add-ons (an older function deploy, or
  // a CDN copy of one) would quietly show the starter page and hide add-ons, so
  // it counts as "API unavailable" and the full data comes from Firestore.
  if (!('storePage' in body)) throw new Error('Storefront API bundle is out of date');
  return body;
};

const loadViaFirestore = async (target: StorefrontTarget): Promise<StorefrontData> => {
  let companyId: string;

  if (target.kind === 'sub') {
    const snap = await getDocsFromServer(
      query(collection(db, 'companies'), where('domainAliases', 'array-contains', target.sub), limit(1))
    );
    if (snap.empty) throw new StorefrontNotFoundError();
    const company = snap.docs[0];
    const activeSub = company.data().subdomain;
    if (activeSub && activeSub !== target.sub) return redirectToSubdomain(activeSub);
    companyId = company.id;
  } else {
    companyId = target.companyId;
  }

  const companyRef = doc(db, 'companies', companyId);
  const settingsDoc = (id: string) => getDocFromServer(doc(companyRef, 'settings', id));
  // Same queries as getItemGroupsByCompany / getItemsByCompany
  // (src/lib/ItemsFirebase.ts), but server-only for the reason above.
  const [
    groupsSnap, itemsSnap, infoSnap, salesSnap, pinnedCategoriesSnap, pinnedItemsSnap,
    storePageSnap, itemSettingsSnap, addOnTemplatesSnap,
  ] = await Promise.all([
    getDocsFromServer(collection(companyRef, 'itemGroups')),
    getDocsFromServer(query(collection(companyRef, 'items'), where('isListed', '==', true))),
    getDocFromServer(doc(companyRef, 'business_info', companyId)),
    settingsDoc('catalogue-sales-settings'),
    settingsDoc('pinned_categories'),
    settingsDoc('pinned_items'),
    settingsDoc('store_page'),
    // Optional for the storefront: if these reads are not allowed, add-ons simply stay off
    settingsDoc('item-settings').catch(() => null),
    getDocsFromServer(collection(companyRef, 'addOnTemplates')).catch(() => null),
  ]);

  return {
    companyId,
    businessInfo: infoSnap.exists() ? (infoSnap.data() as StorefrontBusinessInfo) : null,
    catalogueSettings: salesSnap.exists() ? (salesSnap.data() as CatalogueSalesSettings) : null,
    pinnedCategoryIds: (pinnedCategoriesSnap.exists() && pinnedCategoriesSnap.data().ids) || [],
    pinnedItemIds: (pinnedItemsSnap.exists() && pinnedItemsSnap.data().ids) || [],
    itemGroups: groupsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as ItemGroup[],
    items: itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Item[],
    storePage: storePageSnap.exists() ? (storePageSnap.data() as StorePageDoc) : null,
    enableAddOns: !!itemSettingsSnap?.exists() && itemSettingsSnap.data()?.enableAddOns === true,
    addOnTemplates: addOnTemplatesSnap?.docs.map((d) => ({ ...d.data(), id: d.id })) ?? [],
  };
};

const loadUncached = async (target: StorefrontTarget, key: string): Promise<StorefrontData> => {
  try {
    // Bounds the whole API load (headers + body), including a prefetched
    // request, which can't be aborted but can stop being waited on.
    return await withTimeout(loadViaApi(key), API_TIMEOUT_MS, 'Storefront API');
  } catch (error) {
    if (error instanceof StorefrontNotFoundError) throw error;
    console.warn('Storefront API unavailable, falling back to Firestore:', error);
  }
  return withTimeout(loadViaFirestore(target), FIRESTORE_TIMEOUT_MS, 'Storefront Firestore load');
};

// Memoized per store for the lifetime of the page, so moving between the
// catalogue, a category and checkout costs no further requests.
const inflight = new Map<string, Promise<StorefrontData>>();
const resolved = new Map<string, StorefrontData>();

export const peekStorefront = (target: StorefrontTarget): StorefrontData | null =>
  resolved.get(storefrontKey(target)) ?? null;

export const loadStorefront = (target: StorefrontTarget): Promise<StorefrontData> => {
  const key = storefrontKey(target);
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = loadUncached(target, key).then(
    (data) => {
      resolved.set(key, data);
      return data;
    },
    (error) => {
      // Don't memoize failures — Retry must actually retry.
      inflight.delete(key);
      throw error;
    }
  );
  inflight.set(key, promise);
  return promise;
};
