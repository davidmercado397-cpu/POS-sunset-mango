export interface MenuOption { id: string; name: string; priceDelta: number }
export interface MenuGroup { id: string; name: string; minSelect: number; maxSelect: number; options: MenuOption[] }
export interface MenuProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  categoryId: string | null;
  modifierGroups: MenuGroup[];
}
export interface Menu {
  cashSession: { id: string; openedAt: string } | null;
  modules: string[];
  categories: { id: string; name: string; color: string }[];
  tables: { id: string; name: string; area: string | null }[];
  products: MenuProduct[];
}

export interface CartLine {
  key: string;
  productId: string;
  name: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  options: MenuOption[];
  notes: string;
}

export type PaymentMethod = 'CASH' | 'TRANSFER' | 'QR_BOLD';

export interface SaleDetail {
  id: string;
  number: number;
  status: 'OPEN' | 'COMPLETED' | 'VOIDED';
  customerName: string | null;
  notes: string | null;
  subtotal: number;
  tipAmount: number;
  tipMethod: PaymentMethod | null;
  createdAt: string;
  completedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  table: { id: string; name: string } | null;
  createdBy: { fullName: string };
  voidedBy: { fullName: string } | null;
  items: {
    id: string;
    productName: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
    notes: string | null;
    modifiers: { optionName: string; groupName: string; priceDelta: number }[];
  }[];
  payments: { id: string; method: PaymentMethod; amount: number; received: number | null; change: number | null; reference: string | null }[];
}

/** Convierte las líneas del carrito al formato de la API. */
export const toApiItems = (lines: CartLine[]) =>
  lines.map((l) => ({ productId: l.productId, quantity: l.quantity, optionIds: l.options.map((o) => o.id), notes: l.notes || undefined }));
