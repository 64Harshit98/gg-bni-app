import type { Item, ItemGroup } from '../../constants/models';

// Same slug rule the storefront has always used for category links, so old links keep working.
export const slugify = (name: string) =>
    name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

// Paths that are pages of their own on a shop subdomain, never a category slug.
export const RESERVED_SLUGS = new Set(['checkout']);

export const getItemGroupIds = (item: Item): string[] => [
    ...(item.itemGroupId ? [item.itemGroupId] : []),
    ...(item.itemGroupIds || []),
];

export const itemInGroup = (item: Item, groupId: string) => getItemGroupIds(item).includes(groupId);

export const getItemImages = (item: Item): string[] =>
    item.imageUrls?.length ? item.imageUrls : item.imageUrl ? [item.imageUrl] : [];

/** Category slug for an item: its first real category. */
export const findItemGroup = (item: Item, groups: ItemGroup[]) => {
    const ids = getItemGroupIds(item).filter((id) => id !== 'uncategorized');
    return groups.find((g) => g.id && ids.includes(g.id));
};

export const itemSlug = (item: Item) => slugify(item.name) || String(item.id);

/** Finds the item for a product URL segment: by name slug inside the category first, then by id. */
export const findItemBySlug = (items: Item[], slug: string, groupId?: string) => {
    const inGroup = groupId ? items.filter((i) => itemInGroup(i, groupId)) : items;
    return inGroup.find((i) => itemSlug(i) === slug)
        ?? items.find((i) => String(i.id) === slug)
        ?? items.find((i) => itemSlug(i) === slug);
};

export const formatINR = (n: number, decimals = false) =>
    '₹' + Number(n || 0).toLocaleString('en-IN', decimals
        ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
        : { maximumFractionDigits: 2 });

export const whatsappUrl = (rawNumber?: string, message?: string) => {
    const digits = (rawNumber || '').replace(/\D/g, '');
    if (!digits) return null;
    const full = digits.length === 10 ? `91${digits}` : digits;
    return `https://wa.me/${full}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
};

export const formatPhone = (raw?: string) => {
    const d = (raw || '').replace(/\D/g, '').slice(-10);
    return d.length === 10 ? `${d.slice(0, 5)} ${d.slice(5)}` : raw || '';
};

export const initialsOf = (name?: string) =>
    (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');

export const getLeadData = (): { name?: string; number?: string } => {
    try { return JSON.parse(localStorage.getItem('leadData') || '{}'); } catch { return {}; }
};
export const isLeadSubmitted = () => localStorage.getItem('leadSubmitted') === 'true';

/** A cart line: the catalogue item plus the fields the cart adds to it. */
export type CartLineItem = Item & { tierId?: string; tierLabel?: string; groupid?: string; groupId?: string; baseSalesPrice?: number };
