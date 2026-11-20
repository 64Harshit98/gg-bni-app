import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const firestore = vi.hoisted(() => ({ getDocsFromServer: vi.fn(), getDocFromServer: vi.fn() }));

vi.mock('../../lib/Firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
    collection: vi.fn(() => ({})),
    doc: vi.fn(() => ({})),
    limit: vi.fn(() => ({})),
    query: vi.fn(() => ({})),
    where: vi.fn(() => ({})),
    getDocsFromServer: firestore.getDocsFromServer,
    getDocFromServer: firestore.getDocFromServer,
}));

type Client = typeof import('./storefrontClient');

const payload = {
    companyId: 'c1',
    businessInfo: { businessName: 'Acme' },
    catalogueSettings: null,
    pinnedCategoryIds: [],
    pinnedItemIds: [],
    itemGroups: [],
    items: [],
    storePage: null,
    enableAddOns: false,
    addOnTemplates: [],
};

const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const htmlResponse = () =>
    new Response('<!doctype html><html></html>', { status: 200, headers: { 'content-type': 'text/html' } });

let replace: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;

const setHost = (hostname: string, pathname = '/') => {
    replace = vi.fn();
    vi.stubGlobal('window', { location: { hostname, pathname, search: '', protocol: 'https:', replace } });
};

// Fresh module per test: the client memoizes loads at module level.
const loadClient = async (): Promise<Client> => {
    vi.resetModules();
    return import('./storefrontClient');
};

beforeEach(() => {
    firestore.getDocsFromServer.mockReset();
    firestore.getDocFromServer.mockReset();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    setHost('acme.sellar.in', '/shoes');
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('getStorefrontTarget / storefrontKey', () => {
    it('prefers the merchant subdomain over a path company id', async () => {
        const { getStorefrontTarget, storefrontKey } = await loadClient();
        const target = getStorefrontTarget('c9');
        expect(target).toEqual({ kind: 'sub', sub: 'acme' });
        expect(storefrontKey(target!)).toBe('sub=acme');
    });

    it('uses the path company id on the main domain, and null without one', async () => {
        setHost('app.sellar.in', '/catalogue/c9');
        const { getStorefrontTarget, storefrontKey } = await loadClient();
        expect(storefrontKey(getStorefrontTarget('c9')!)).toBe('cId=c9');
        expect(getStorefrontTarget(undefined)).toBeNull();
    });
});

describe('loadStorefront', () => {
    it('loads the bundle from /api/storefront once per session', async () => {
        fetchMock.mockResolvedValue(jsonResponse(payload));
        const { loadStorefront, peekStorefront } = await loadClient();
        const target = { kind: 'sub', sub: 'acme' } as const;

        await expect(loadStorefront(target)).resolves.toEqual(payload);
        await expect(loadStorefront(target)).resolves.toEqual(payload);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toBe('/api/storefront?sub=acme');
        expect(peekStorefront(target)).toEqual(payload);
        expect(firestore.getDocsFromServer).not.toHaveBeenCalled();
    });

    it('reuses the index.html prefetch when its key matches', async () => {
        const { loadStorefront } = await loadClient();
        (window as Window).__SF_PREFETCH__ = { key: 'sub=acme', promise: Promise.resolve(jsonResponse(payload)) };

        await expect(loadStorefront({ kind: 'sub', sub: 'acme' })).resolves.toEqual(payload);
        expect(fetchMock).not.toHaveBeenCalled();
        expect((window as Window).__SF_PREFETCH__).toBeUndefined();
    });

    it('treats a JSON 404 as "store not found" without falling back', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ error: 'Store not found' }, 404));
        const { loadStorefront, StorefrontNotFoundError } = await loadClient();

        await expect(loadStorefront({ kind: 'sub', sub: 'acme' })).rejects.toBeInstanceOf(StorefrontNotFoundError);
        expect(firestore.getDocsFromServer).not.toHaveBeenCalled();
    });

    it('falls back to Firestore when the API answers with HTML (route not deployed / dev server)', async () => {
        fetchMock.mockResolvedValue(htmlResponse());
        const docsOf = (...docs: { id: string; data: object }[]) =>
            ({ empty: docs.length === 0, docs: docs.map((d) => ({ id: d.id, data: () => d.data })) });
        firestore.getDocsFromServer
            .mockResolvedValueOnce(docsOf({ id: 'c1', data: { subdomain: 'acme' } })) // domainAliases lookup
            .mockResolvedValueOnce(docsOf({ id: 'g1', data: { name: 'Shoes' } })) // itemGroups
            .mockResolvedValueOnce(docsOf({ id: 'i1', data: { name: 'Boot', isListed: true } })) // listed items
            .mockResolvedValueOnce(docsOf({ id: 't1', data: { name: 'Extras' } })); // addOnTemplates
        firestore.getDocFromServer.mockResolvedValue({ exists: () => false });
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { loadStorefront } = await loadClient();

        const data = await loadStorefront({ kind: 'sub', sub: 'acme' });
        expect(data.companyId).toBe('c1');
        expect(data.itemGroups).toEqual([{ id: 'g1', name: 'Shoes' }]);
        expect(data.items).toEqual([{ id: 'i1', name: 'Boot', isListed: true }]);
        expect(data.businessInfo).toBeNull();
        expect(data.storePage).toBeNull();
        expect(data.enableAddOns).toBe(false);
        expect(data.addOnTemplates).toEqual([{ id: 't1', name: 'Extras' }]);
    });

    it('keeps the store usable when the optional add-on reads are denied', async () => {
        fetchMock.mockResolvedValue(htmlResponse());
        const docsOf = (...docs: { id: string; data: object }[]) =>
            ({ empty: docs.length === 0, docs: docs.map((d) => ({ id: d.id, data: () => d.data })) });
        firestore.getDocsFromServer
            .mockResolvedValueOnce(docsOf({ id: 'c1', data: { subdomain: 'acme' } }))
            .mockResolvedValueOnce(docsOf())
            .mockResolvedValueOnce(docsOf())
            .mockRejectedValueOnce(new Error('permission-denied'));
        // Five required doc reads come first; the sixth is item-settings
        firestore.getDocFromServer.mockResolvedValue({ exists: () => false });
        for (let i = 0; i < 5; i += 1) firestore.getDocFromServer.mockResolvedValueOnce({ exists: () => false });
        firestore.getDocFromServer.mockRejectedValueOnce(new Error('permission-denied'));
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { loadStorefront } = await loadClient();

        const data = await loadStorefront({ kind: 'sub', sub: 'acme' });
        expect(data.enableAddOns).toBe(false);
        expect(data.addOnTemplates).toEqual([]);
    });

    it('falls back to Firestore when the API serves a bundle from before store pages and add-ons', async () => {
        const oldBundle: Partial<typeof payload> = { ...payload };
        delete oldBundle.storePage;
        fetchMock.mockResolvedValue(jsonResponse(oldBundle));
        const docsOf = (...docs: { id: string; data: object }[]) =>
            ({ empty: docs.length === 0, docs: docs.map((d) => ({ id: d.id, data: () => d.data })) });
        firestore.getDocsFromServer
            .mockResolvedValueOnce(docsOf({ id: 'c1', data: { subdomain: 'acme' } }))
            .mockResolvedValueOnce(docsOf())
            .mockResolvedValueOnce(docsOf())
            .mockResolvedValueOnce(docsOf());
        firestore.getDocFromServer.mockResolvedValue({ exists: () => true, data: () => ({ enableAddOns: true, sections: [] }) });
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { loadStorefront } = await loadClient();

        const data = await loadStorefront({ kind: 'sub', sub: 'acme' });
        expect(firestore.getDocsFromServer).toHaveBeenCalled();
        expect(data.enableAddOns).toBe(true);
        expect(data.storePage).not.toBeNull();
    });

    it('reports offline as a retryable error, never as "store not found"', async () => {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
        firestore.getDocsFromServer.mockRejectedValue(new Error('Failed to get documents from server (offline)'));
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { loadStorefront, StorefrontNotFoundError } = await loadClient();

        const error = await loadStorefront({ kind: 'sub', sub: 'acme' }).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(StorefrontNotFoundError);
    });

    it('redirects an old subdomain alias to the current one, keeping the path', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ redirectToSubdomain: 'acme-new' }));
        const { loadStorefront } = await loadClient();

        void loadStorefront({ kind: 'sub', sub: 'acme' });
        await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('https://acme-new.sellar.in/shoes'));
    });

    it('does not memoize a failed load, so Retry really retries', async () => {
        fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        firestore.getDocsFromServer.mockRejectedValueOnce(new Error('offline'));
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { loadStorefront } = await loadClient();
        const target = { kind: 'sub', sub: 'acme' } as const;

        await expect(loadStorefront(target)).rejects.toThrow('offline');

        fetchMock.mockResolvedValue(jsonResponse(payload));
        await expect(loadStorefront(target)).resolves.toEqual(payload);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
