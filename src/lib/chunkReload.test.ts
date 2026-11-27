import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isChunkLoadError, isReloadPending, reloadOnce } from './chunkReload';

describe('isChunkLoadError', () => {
    it('recognises every browser\'s wording of a failed chunk load', () => {
        const messages = [
            'Failed to fetch dynamically imported module: https://x/assets/a.js', // Chrome
            'Importing a module script failed.', // Safari
            'error loading dynamically imported module', // Firefox
            'Unable to preload CSS for /assets/a.css',
            "'text/html' is not a valid JavaScript MIME type.",
            'Loading chunk 42 failed.',
        ];
        for (const message of messages) {
            expect(isChunkLoadError(new Error(message))).toBe(true);
        }
        const chunkError = new Error('whatever');
        chunkError.name = 'ChunkLoadError';
        expect(isChunkLoadError(chunkError)).toBe(true);
    });

    it('ignores ordinary errors and empty values', () => {
        expect(isChunkLoadError(new Error("Cannot read properties of undefined (reading 'name')"))).toBe(false);
        expect(isChunkLoadError(null)).toBe(false);
        expect(isChunkLoadError(undefined)).toBe(false);
    });
});

describe('reloadOnce', () => {
    let store: Record<string, string>;
    const reload = vi.fn();

    beforeEach(() => {
        store = {};
        reload.mockReset();
        vi.stubGlobal('window', { location: { reload } });
        vi.stubGlobal('sessionStorage', {
            getItem: (k: string) => store[k] ?? null,
            setItem: (k: string, v: string) => { store[k] = v; },
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('reloads the first time, then refuses within the cooldown (no reload loop)', () => {
        expect(isReloadPending()).toBe(false);
        expect(reloadOnce()).toBe(true);
        expect(isReloadPending()).toBe(true);
        expect(reloadOnce()).toBe(false);
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('still reloads when sessionStorage is blocked', () => {
        vi.stubGlobal('sessionStorage', {
            getItem: () => { throw new Error('SecurityError'); },
            setItem: () => { throw new Error('SecurityError'); },
        });
        expect(reloadOnce()).toBe(true);
        expect(reload).toHaveBeenCalledTimes(1);
    });
});
