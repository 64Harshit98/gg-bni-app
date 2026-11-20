// Plan catalog for the "Sellar WhatsApp Number" tier — a company does no
// setup of their own; they pick one of these and Sellar activates them
// manually (see WAChooseProvider.tsx + the super-admin WhatsApp page).
//
// Deliberately mirrors WHATSAPP_PLANS in WAPlan.tsx (the BotMaster plan
// catalog) for now — same names/pricing/quotas — per instruction to keep
// them aligned until the business defines separate Sellar-tier pricing.
//
// Shape is also read by the super-admin plan-assignment dropdown so both
// surfaces stay in sync automatically.
export interface SellarWhatsappPlan {
  id: string;
  name: string;
  subtitle: string;
  duration: 'Month' | 'Year';
  price: number;
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
    price: 2100,
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
    price: 4500,
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
    price: 7999,
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
