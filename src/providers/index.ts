/**
 * New canonical home for cross-cutting providers (theme, query client, etc.)
 * going forward.
 *
 * Existing providers currently live in `src/context/` and
 * `src/app/providers/` and are intentionally NOT moved here as part of this
 * change -- this file only establishes the location. Providers should
 * migrate here incrementally (strangler-fig style) as they're touched,
 * rather than as one large, risky move across an already-large working
 * tree.
 */
export {};
