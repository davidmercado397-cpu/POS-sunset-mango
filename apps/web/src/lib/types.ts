export interface RecipeLine { inventoryItemId: string; name?: string; unit?: string; quantity: number }

export interface ModifierOption { id?: string; name: string; priceDelta: number; isActive: boolean; recipe: RecipeLine[] }

export interface ModifierGroup { id?: string; name: string; minSelect: number; maxSelect: number; allowRepeat?: boolean; options: ModifierOption[] }

export interface Category { id: string; name: string; color: string; sortOrder: number; isActive: boolean; _count?: { products: number } }

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  isActive: boolean;
  sendToKitchen: boolean;
  sortOrder: number;
  categoryId: string | null;
  category: { id: string; name: string; color: string } | null;
  disabledBranchIds: string[];
  recipe: RecipeLine[];
  modifierGroups: ModifierGroup[];
  isCombo: boolean;
  comboItems: { productId: string; name?: string; imageUrl?: string | null; price?: number; quantity: number }[];
}

export interface InventoryItem {
  id: string;
  name: string;
  type: 'INGREDIENT' | 'PRODUCT';
  unit: string;
  minStock: number;
  isActive: boolean;
}

export const UNITS = [
  { value: 'und', label: 'Unidad' },
  { value: 'g', label: 'Gramos' },
  { value: 'kg', label: 'Kilogramos' },
  { value: 'ml', label: 'Mililitros' },
  { value: 'l', label: 'Litros' },
  { value: 'lb', label: 'Libras' },
  { value: 'oz', label: 'Onzas' },
  { value: 'porcion', label: 'Porción' },
];

/** Agrupa nombres repetidos: ["Queso", "Queso"] → ["2× Queso"]. */
export function summarizeNames(names: string[]): string[] {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts].map(([name, count]) => (count > 1 ? `${count}× ${name}` : name));
}
