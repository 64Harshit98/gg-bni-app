import { describe, it, expect } from 'vitest';
import { getCatalogueTarget, getMerchantSub, getPublicHost } from './tenant.js';

const fakeReq = (headers) => ({ get: (name) => headers[name.toLowerCase()] });

describe('getPublicHost', () => {
    it('prefers the first X-Forwarded-Host entry over Host', () => {
        expect(getPublicHost(fakeReq({ 'x-forwarded-host': 'acme.sellar.in, proxy.internal', host: 'newapp-1.run.app' })))
            .toBe('acme.sellar.in');
    });

    it('falls back to Host, then to an empty string', () => {
        expect(getPublicHost(fakeReq({ host: 'app.sellar.in' }))).toBe('app.sellar.in');
        expect(getPublicHost(fakeReq({}))).toBe('');
    });
});

describe('getMerchantSub', () => {
    it('returns the merchant slug for a storefront host', () => {
        expect(getMerchantSub('acme.sellar.in')).toBe('acme');
        expect(getMerchantSub('ACME.Sellar.in:443')).toBe('acme');
    });

    it('returns null for platform hosts and foreign domains', () => {
        expect(getMerchantSub('app.sellar.in')).toBeNull();
        expect(getMerchantSub('www.sellar.in')).toBeNull();
        expect(getMerchantSub('sellar.in')).toBeNull();
        expect(getMerchantSub('newapp-1.us-central1.run.app')).toBeNull();
        expect(getMerchantSub('evilsellar.in')).toBeNull();
        expect(getMerchantSub('')).toBeNull();
        expect(getMerchantSub(undefined)).toBeNull();
    });
});

describe('getCatalogueTarget', () => {
    it('maps subdomain catalogue and category links', () => {
        expect(getCatalogueTarget('acme.sellar.in', '/')).toEqual({ sub: 'acme' });
        expect(getCatalogueTarget('acme.sellar.in', '/shoes')).toEqual({ sub: 'acme', cat: 'shoes' });
        expect(getCatalogueTarget('acme.sellar.in', '/checkout')).toBeNull();
        expect(getCatalogueTarget('acme.sellar.in', '/a/b')).toBeNull();
    });

    it('maps legacy main-domain links', () => {
        expect(getCatalogueTarget('app.sellar.in', '/catalogue/c123')).toEqual({ cId: 'c123' });
        expect(getCatalogueTarget('app.sellar.in', '/c123/shoes')).toEqual({ cId: 'c123', cat: 'shoes' });
        expect(getCatalogueTarget('app.sellar.in', '/checkout/c123')).toBeNull();
        expect(getCatalogueTarget('app.sellar.in', '/download-bill/c123')).toBeNull();
        expect(getCatalogueTarget('app.sellar.in', '/')).toBeNull();
    });

    it('returns null for malformed percent-encoding instead of throwing', () => {
        expect(getCatalogueTarget('app.sellar.in', '/catalogue/%E0%A4%A')).toBeNull();
    });
});
