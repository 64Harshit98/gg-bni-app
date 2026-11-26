// Plan catalog for the "Sellar WhatsApp Number" tier — a company does no
// setup of their own; they pick one of these, pay through the payment
// gateway, and paymentWebhook activates the plan on their company
// automatically (see WAChooseProvider.tsx). Super admins can still assign or
// edit a plan by hand on the WhatsApp Config page.
//
// Prices and quotas MUST match WHATSAPP_PLANS in functions/lib/index.js —
// the server charges from its own copy, never from this file.
export interface SellarWhatsappPlan {
  id: string;
  name: string;
  subtitle: string;
  duration: 'Month' | 'Year';
  price: number; // selling price, before GST
  mrp: number; // list price, shown struck through
  quota: number | null; // null = unlimited
  tags: string[];
  features: string[];
  recommended: boolean;
}

export const SELLAR_WHATSAPP_PLANS: SellarWhatsappPlan[] = [
  {
    id: 'sellar_10k',
    name: '10,000 Messages',
    subtitle: 'Starter Pack',
    duration: 'Year',
    price: 1500,
    mrp: 3000,
    quota: 10000,
    tags: ['STARTER'],
    features: [
      '10,000 Messages / Year',
      'No setup required',
      'Sent from Sellar\'s WhatsApp number',
      'Basic message log',
    ],
    recommended: false,
  },
  {
    id: 'sellar_25k',
    name: '25,000 Messages',
    subtitle: 'Growth Pack',
    duration: 'Year',
    price: 3500,
    mrp: 7500,
    quota: 25000,
    tags: ['MOST POPULAR'],
    features: [
      '25,000 Messages / Year',
      'No setup required',
      'Sent from Sellar\'s WhatsApp number',
      'Full message log & delivery status',
    ],
    recommended: true,
  },
  {
    id: 'sellar_50k',
    name: '50,000 Messages',
    subtitle: 'Enterprise Pack',
    duration: 'Year',
    price: 6800,
    mrp: 14000,
    quota: 50000,
    tags: ['VIP ACCESS'],
    features: [
      '50,000 Messages / Year',
      'No setup required',
      'Sent from Sellar\'s WhatsApp number',
      'Priority support',
    ],
    recommended: false,
  },
];

// ₹ per message, e.g. 0.15 / 0.14 / 0.136.
export const perMessageRate = (p: SellarWhatsappPlan) =>
  p.quota ? Math.round((p.price / p.quota) * 1000) / 1000 : null;

// Whole-number discount off MRP, e.g. 50 / 53 / 51.
export const discountPct = (p: SellarWhatsappPlan) =>
  p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
