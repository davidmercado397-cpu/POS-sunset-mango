export interface RecipeLine { inventoryItemId: string; name?: string; unit?: string; quantity: number }

export interface ModifierOption { id?: string; name: string; priceDelta: number; isActive: boolean; recipe: RecipeLine[] }

export interface ModifierGroup { id?: string; name: string; minSelect: number; maxSelect: number; options: ModifierOption[] }

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
