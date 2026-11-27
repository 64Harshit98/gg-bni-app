/** Shallow copy of `obj` without the given keys (for dropping cart-only fields before save). */
export const omitKeys = <T extends object>(obj: T, keys: readonly string[]): T => {
    const out = { ...obj } as Record<string, unknown>;
    for (const k of keys) delete out[k];
    return out as T;
};
