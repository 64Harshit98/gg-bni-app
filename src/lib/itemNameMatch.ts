// Fuzzy item-name matching for supplier bills (Smart Scan) and the NEW-item
// name box in the cart.
//
// Supplier bills spell the same product differently from the catalogue:
//   "KAJU 250GM"  vs "Kaju 250 g"          (unit spelling / spacing)
//   "Parle-G Biscuit 1OO g" vs "Parle G 100g"  (OCR O↔0, punctuation)
//   "Tea Tata Premium 500g" vs "Tata Tea Premium 500g"  (word order)
// but "Kaju 250g" must NOT match "Kaju 500g" — pack sizes have to agree.
//
// Scoring is token based: every token in the query is paired with its most
// similar unused token in the candidate (exact > prefix > edit distance), and
// the pair similarities are turned into a Dice-style score in [0, 1].

import type { Item } from '../constants/models';

const UNIT_ALIASES: Record<string, string> = {
    g: 'g', gm: 'g', gms: 'g', gr: 'g', grm: 'g', grms: 'g', gram: 'g', grams: 'g',
    kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg',
    ml: 'ml', mls: 'ml',
    l: 'l', lt: 'l', ltr: 'l', ltrs: 'l', litre: 'l', litres: 'l', liter: 'l', liters: 'l',
    pc: 'pc', pcs: 'pc', piece: 'pc', pieces: 'pc', nos: 'pc', no: 'pc',
    pkt: 'pkt', pkts: 'pkt', packet: 'pkt', packets: 'pkt', pack: 'pkt',
    mtr: 'm', mtrs: 'm', meter: 'm', meters: 'm', metre: 'm', metres: 'm',
};

/** Tokens a name is compared by: lowercase, unit spellings unified, numbers split off ("250gm" → "250", "g"). */
export const nameTokens = (raw: string): string[] => {
    const s = (raw || '')
        .toLowerCase()
        // OCR reads 0 as o inside numbers ("1oo", "25o") — only in a run of digits/o's that has
        // a real digit and doesn't continue a word, so "oreo" / "choco2" are left alone
        .replace(/(?<![a-z])[\do]*\d[\do]*/g, m => m.replace(/o/g, '0'))
        // "250gm" → "250 gm" (Latin or Devanagari letters next to a number)
        .replace(/(\d)([a-z\p{Script=Devanagari}])/gu, '$1 $2')
        .replace(/([a-z\p{Script=Devanagari}])(\d)/gu, '$1 $2')
        // 1,000 / 1.5 stay numbers; everything else non-alphanumeric is a separator
        .replace(/(\d),(\d)/g, '$1$2')
        .replace(/[^a-z0-9.\p{Script=Devanagari}]+/gu, ' ')
        .replace(/(?<!\d)\.|\.(?!\d)/g, ' ');
    return s
        .split(' ')
        .filter(Boolean)
        .map(t => UNIT_ALIASES[t] ?? t);
};

const isNumeric = (t: string) => /^\d+(\.\d+)?$/.test(t);

/** Stable key for "same name" lookups (word order and punctuation ignored). */
export const nameKey = (raw: string): string => nameTokens(raw).sort().join(' ');

const levenshtein = (a: string, b: string): number => {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = cur;
    }
    return prev[b.length];
};

const tokenSimilarity = (q: string, c: string): number => {
    if (q === c) return 1;
    // Numbers (pack sizes, model numbers) only ever match exactly
    if (isNumeric(q) || isNumeric(c)) return 0;
    // Abbreviation on either side: "choc" ↔ "chocolate", "bisc" ↔ "biscuit"
    if (q.length >= 3 && c.startsWith(q)) return 0.85;
    if (c.length >= 3 && q.startsWith(c)) return 0.8;
    const longest = Math.max(q.length, c.length);
    if (longest < 4) return 0;
    const ratio = 1 - levenshtein(q, c) / longest;
    return ratio >= 0.7 ? ratio * 0.9 : 0;
};

/** 0..1 — how well `query` names the same product as `candidate`. */
export const scoreTokens = (q: string[], c: string[]): number => {
    if (!q.length || !c.length) return 0;
    const used = new Array(c.length).fill(false);
    let total = 0;
    for (const qt of q) {
        let best = 0, bestIdx = -1;
        for (let j = 0; j < c.length; j++) {
            if (used[j]) continue;
            const s = tokenSimilarity(qt, c[j]);
            if (s > best) { best = s; bestIdx = j; if (s === 1) break; }
        }
        if (bestIdx >= 0) { used[bestIdx] = true; total += best; }
    }
    let score = (2 * total) / (q.length + c.length);

    // Both mention a size / number but they differ → almost certainly a different pack
    const qNums = q.filter(isNumeric), cNums = c.filter(isNumeric);
    if (qNums.length && cNums.length && !qNums.some(n => cNums.includes(n))) score *= 0.4;
    return score;
};

export interface ItemMatch { item: Item; score: number }

export interface ItemMatcher {
    /** Best matches for a name, highest score first. */
    rank: (query: string, limit?: number, minScore?: number) => ItemMatch[];
    /** Catalogue item whose name is the same as `query` (case / spaces / word order ignored). */
    exact: (query: string) => Item | undefined;
}

/**
 * Builds a matcher over the catalogue once (re-build when the list changes).
 * A 2-letter prefix index keeps each lookup to the few items that share a word start.
 */
export const buildItemMatcher = (items: Item[]): ItemMatcher => {
    const entries = items
        .filter(it => it && it.id && it.name)
        .map(item => {
            const tokens = nameTokens(item.name);
            return { item, tokens, key: [...tokens].sort().join(' '), lower: item.name.toLowerCase() };
        });

    const byKey = new Map<string, Item>();
    const prefixIndex = new Map<string, number[]>();
    entries.forEach((e, idx) => {
        if (!byKey.has(e.key)) byKey.set(e.key, e.item);
        new Set(e.tokens.filter(t => !isNumeric(t)).map(t => t.slice(0, 2))).forEach(p => {
            const list = prefixIndex.get(p);
            if (list) list.push(idx); else prefixIndex.set(p, [idx]);
        });
    });

    const exact = (query: string) => byKey.get(nameKey(query));

    const rank = (query: string, limit = 5, minScore = 0.35): ItemMatch[] => {
        const qTokens = nameTokens(query);
        if (!qTokens.length) return [];
        const qLower = query.trim().toLowerCase();

        const candidateIdx = new Set<number>();
        qTokens.filter(t => !isNumeric(t)).forEach(t => {
            (prefixIndex.get(t.slice(0, 2)) || []).forEach(i => candidateIdx.add(i));
        });
        // Query with only numbers (or nothing indexed) → plain substring search
        if (candidateIdx.size === 0) entries.forEach((_, i) => candidateIdx.add(i));

        const out: ItemMatch[] = [];
        candidateIdx.forEach(i => {
            const e = entries[i];
            let score = scoreTokens(qTokens, e.tokens);
            // Typing in a search box: "kaj" should still list "Kaju 250g"
            if (qLower.length >= 2 && e.lower.includes(qLower)) score = Math.max(score, 0.6 + 0.3 * (qLower.length / e.lower.length));
            if (score >= minScore) out.push({ item: e.item, score });
        });
        return out.sort((a, b) => b.score - a.score).slice(0, limit);
    };

    return { rank, exact };
};
