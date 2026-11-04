// Types moved verbatim from OrdersReturn.tsx (formatting/hoisting only — no
// behavior changes). None of these extend Order/OrderItem from
// '../Orders/orders.types' — they are standalone shapes local to the return
// flow (an original-sale line being returned, and a newly-added exchange
// line), same as they were pre-extraction.

export interface TransactionItem {
  id: string;
  originalItemId: string;
  name: string;
  mrp: number;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface ExchangeItem {
  id: string;
  originalItemId: string;
  name: string;
  mrp: number;
  quantity: number;
  unitPrice: number;
  salesPrice: number;
  amount: number;
  discount: number;
  basePrice: number;
  customPrice?: number | string;
}

// Interface for Customer
export interface Customer {
  id?: string;
  name: string;
  number: string;
  [key: string]: any;
}
