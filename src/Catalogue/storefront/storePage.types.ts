// The owner's Store page, saved at companies/{id}/settings/store_page.
// Owners change text and images only; layout, colours and fonts come from the storefront design.

export type ButtonLink =
    | { kind: 'categories' }
    | { kind: 'category'; groupId: string }
    | { kind: 'whatsapp' }
    | { kind: 'call' };

export interface StoreButton { label: string; link: ButtonLink }

export interface HeroData {
    layout: 'over' | 'beside';
    imageUrl?: string;
    imagePath?: string;
    heading: string;
    text?: string;
    buttons: StoreButton[];
}
export interface Banner { id: string; title: string; text?: string; imageUrl?: string; imagePath?: string; button: StoreButton }
export interface BannersData { items: Banner[] }
export interface CategoryGroup { id: string; name: string; categoryIds: string[] }
export interface CategoryGroupsData { groups: CategoryGroup[] }
export interface ProductsData { title: string }
export interface Fact { id: string; icon: FactIcon; title: string; text?: string }
export type FactIcon = 'award' | 'package' | 'truck' | 'users' | 'shield' | 'clock';
export interface FactsData { items: Fact[] }
export interface ImageTextData { title: string; paragraphs: string; imageUrl?: string; imagePath?: string; flip?: boolean; button?: StoreButton }
export interface GalleryImage { id: string; url: string; path?: string }
export interface GalleryData { title: string; text?: string; images: GalleryImage[] }
export interface TextData { title: string; body: string; button?: StoreButton }
export interface ContactData { title: string; hours: string }

export type SectionMap = {
    hero: HeroData;
    banners: BannersData;
    categoryGroups: CategoryGroupsData;
    products: ProductsData;
    facts: FactsData;
    imageText: ImageTextData;
    gallery: GalleryData;
    text: TextData;
    contact: ContactData;
};
export type SectionType = keyof SectionMap;

export type StoreSection = {
    [K in SectionType]: { id: string; type: K; hidden?: boolean; data: SectionMap[K] }
}[SectionType];

export interface StorePageDoc {
    sections: StoreSection[];
    updatedAt?: unknown;
    updatedBy?: string;
}

export const SECTION_INFO: Record<SectionType, { name: string; text: string }> = {
    hero: { name: 'Hero banner', text: 'A wide photo with a heading and up to two buttons. Best as the first section.' },
    banners: { name: 'Offer banners', text: 'Up to 3 small banners side by side, each with a photo, title and button.' },
    categoryGroups: { name: 'Categories', text: 'Every category as a photo tile, in groups you name.' },
    products: { name: 'Pinned products', text: 'A scrolling row of the products you pinned.' },
    facts: { name: 'Highlights', text: 'Three or four short facts: since when, delivery, bulk orders.' },
    imageText: { name: 'Image and text', text: 'A photo beside a paragraph: your story, your shop.' },
    gallery: { name: 'Photo gallery', text: '3 to 9 photos of your shop, work or products.' },
    text: { name: 'Text', text: 'A heading and a paragraph, with an optional button.' },
    contact: { name: 'Contact and timings', text: 'Address, map link, phone, WhatsApp and opening hours.' },
};

export const newId = () => Math.random().toString(36).slice(2, 10);

export const emptySection = (type: SectionType): StoreSection => {
    const id = newId();
    switch (type) {
        case 'hero': return { id, type, data: { layout: 'over', heading: 'Welcome to our shop', text: '', buttons: [{ label: 'Browse categories', link: { kind: 'categories' } }] } };
        case 'banners': return { id, type, data: { items: [{ id: newId(), title: 'New arrivals', text: '', button: { label: 'Shop now', link: { kind: 'categories' } } }] } };
        case 'categoryGroups': return { id, type, data: { groups: [] } };
        case 'products': return { id, type, data: { title: 'Our picks' } };
        case 'facts': return { id, type, data: { items: [{ id: newId(), icon: 'award', title: '', text: '' }] } };
        case 'imageText': return { id, type, data: { title: 'About us', paragraphs: '' } };
        case 'gallery': return { id, type, data: { title: 'Inside the shop', images: [] } };
        case 'text': return { id, type, data: { title: '', body: '' } };
        case 'contact': return { id, type, data: { title: 'Visit or contact us', hours: '' } };
    }
};

/** What customers see before the owner publishes a Store page: built from the shop profile. */
export const starterStorePage = (businessName: string, brandingText?: string): StorePageDoc => ({
    sections: [
        { id: 'starter-hero', type: 'hero', data: { layout: 'over', heading: businessName || 'Welcome', text: brandingText || '', buttons: [{ label: 'Browse categories', link: { kind: 'categories' } }, { label: 'WhatsApp us', link: { kind: 'whatsapp' } }] } },
        { id: 'starter-cats', type: 'categoryGroups', data: { groups: [] } },
        { id: 'starter-picks', type: 'products', data: { title: 'Our picks' } },
        { id: 'starter-contact', type: 'contact', data: { title: 'Visit or contact us', hours: '' } },
    ],
});
