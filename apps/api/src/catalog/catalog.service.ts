import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { num, PRODUCT_ORDER, tenantOf } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { CategoryDto, ProductDto, RecipeLineDto } from './catalog.dto';

export const PRODUCT_INCLUDE = {
  category: { select: { id: true, name: true, color: true } },
  comboItems: { orderBy: { sortOrder: 'asc' }, include: { product: { select: { id: true, name: true, imageUrl: true, price: true } } } },
  recipe: { include: { inventoryItem: { select: { id: true, name: true, unit: true } } } },
  modifierGroups: {
    orderBy: { sortOrder: 'asc' },
    include: {
      options: {
        orderBy: { sortOrder: 'asc' },
        include: { recipe: { include: { inventoryItem: { select: { id: true, name: true, unit: true } } } } },
      },
    },
  },
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

const mapRecipe = (lines: ProductWithRelations['recipe']) =>
  lines.map((l) => ({ inventoryItemId: l.inventoryItemId, name: l.inventoryItem.name, unit: l.inventoryItem.unit, quantity: num(l.quantity) }));

export function serializeProduct(p: ProductWithRelations) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price,
    imageUrl: p.imageUrl,
    isActive: p.isActive,
    sendToKitchen: p.sendToKitchen,
    sortOrder: p.sortOrder,
    categoryId: p.categoryId,
    category: p.category,
    disabledBranchIds: p.disabledBranchIds,
    isCombo: p.isCombo,
    comboItems: p.comboItems.map((c) => ({ productId: c.productId, name: c.product.name, imageUrl: c.product.imageUrl, price: c.product.price, quantity: c.quantity })),
    recipe: mapRecipe(p.recipe),
    modifierGroups: p.modifierGroups.map((g) => ({
      id: g.id,
      name: g.name,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      allowRepeat: g.allowRepeat,
      options: g.options.map((o) => ({ id: o.id, name: o.name, priceDelta: o.priceDelta, isActive: o.isActive, recipe: mapRecipe(o.recipe) })),
    })),
  };
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly uploads: UploadsService,
  ) {}

  // ───────── Categorías ─────────

  categories(user: AuthUser) {
    return this.prisma.category.findMany({
      where: { tenantId: tenantOf(user) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
  }

  async saveCategory(user: AuthUser, dto: CategoryDto, id?: string) {
    const tenantId = tenantOf(user);
    if (id) {
      const found = await this.prisma.category.findFirst({ where: { id, tenantId } });
      if (!found) throw new NotFoundException('Categoría no encontrada');
      return this.prisma.category.update({ where: { id }, data: { ...dto, name: dto.name.trim() } });
    }
    const count = await this.prisma.category.count({ where: { tenantId } });
    return this.prisma.category.create({ data: { ...dto, name: dto.name.trim(), tenantId, sortOrder: dto.sortOrder ?? count } });
  }

  async deleteCategory(user: AuthUser, id: string) {
    const tenantId = tenantOf(user);
    const found = await this.prisma.category.findFirst({ where: { id, tenantId } });
    if (!found) throw new NotFoundException('Categoría no encontrada');
    // Los productos quedan sin categoría (no se borran).
    await this.prisma.category.delete({ where: { id } });
  }

  // ───────── Productos ─────────

  async products(user: AuthUser) {
    const products = await this.prisma.product.findMany({
      where: { tenantId: tenantOf(user) },
      include: PRODUCT_INCLUDE,
      orderBy: PRODUCT_ORDER,
    });
    return products.map(serializeProduct);
  }

  async product(user: AuthUser, id: string) {
    const p = await this.prisma.product.findFirst({ where: { id, tenantId: tenantOf(user) }, include: PRODUCT_INCLUDE });
    if (!p) throw new NotFoundException('Producto no encontrado');
    return serializeProduct(p);
  }

  async saveProduct(user: AuthUser, dto: ProductDto, id?: string) {
    const tenantId = tenantOf(user);
    const inventoryEnabled = user.tenantModules.includes('inventory');
    const existing = id ? await this.prisma.product.findFirst({ where: { id, tenantId }, include: PRODUCT_INCLUDE }) : null;
    if (id && !existing) throw new NotFoundException('Producto no encontrado');

    for (const g of dto.modifierGroups ?? []) {
      if (g.minSelect > g.maxSelect) throw new BadRequestException(`En "${g.name}" el mínimo no puede superar al máximo`);
      if (g.minSelect > g.options.length) throw new BadRequestException(`"${g.name}" exige más opciones de las que tiene`);
    }
    if (dto.categoryId && !(await this.prisma.category.findFirst({ where: { id: dto.categoryId, tenantId } }))) {
      throw new BadRequestException('Categoría inválida');
    }
    if (inventoryEnabled) await this.assertInventoryItems(tenantId, dto);
    const comboItems = dto.isCombo ? await this.validComboItems(tenantId, dto, id) : [];

    const data = {
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      price: dto.price,
      categoryId: dto.categoryId ?? null,
      isActive: dto.isActive ?? true,
      sendToKitchen: dto.sendToKitchen ?? true,
      sortOrder: dto.sortOrder ?? existing?.sortOrder ?? 0,
      disabledBranchIds: dto.disabledBranchIds ?? [],
      isCombo: !!dto.isCombo,
    };

    const productId = await this.prisma.$transaction(async (tx) => {
      const product = existing
        ? await tx.product.update({ where: { id: existing.id }, data })
        : await tx.product.create({ data: { ...data, tenantId } });

      if (dto.modifierGroups) await this.syncGroups(tx, product.id, dto, existing, inventoryEnabled);
      await tx.comboItem.deleteMany({ where: { comboId: product.id } });
      if (comboItems.length) {
        await tx.comboItem.createMany({ data: comboItems.map((c, i) => ({ comboId: product.id, productId: c.productId, quantity: c.quantity, sortOrder: i })) });
      }
      if (inventoryEnabled && dto.recipe) {
        await tx.recipeLine.deleteMany({ where: { productId: product.id } });
        await tx.recipeLine.createMany({ data: this.recipeRows(dto.recipe, { productId: product.id }) });
      }
      return product.id;
    });

    if (existing && existing.price !== dto.price) {
      await this.audit.log({
        tenantId, userId: user.id, action: 'product.price_changed', entity: 'Product', entityId: productId,
        data: { name: data.name, from: existing.price, to: dto.price },
      });
    }
    return this.product(user, productId);
  }

  /** Sincroniza grupos y opciones conservando los IDs existentes. */
  private async syncGroups(
    tx: Prisma.TransactionClient,
    productId: string,
    dto: ProductDto,
    existing: ProductWithRelations | null,
    inventoryEnabled: boolean,
  ) {
    const groups = dto.modifierGroups ?? [];
    const existingGroupIds = new Set(existing?.modifierGroups.map((g) => g.id) ?? []);
    const existingOptionIds = new Set(existing?.modifierGroups.flatMap((g) => g.options.map((o) => o.id)) ?? []);
    const keepGroups = groups.map((g) => g.id).filter((gid): gid is string => !!gid && existingGroupIds.has(gid));
    await tx.modifierGroup.deleteMany({ where: { productId, id: { notIn: keepGroups } } });

    for (const [gi, g] of groups.entries()) {
      const groupData = { name: g.name.trim(), minSelect: g.minSelect, maxSelect: g.maxSelect, allowRepeat: !!g.allowRepeat, sortOrder: gi };
      const group = g.id && existingGroupIds.has(g.id)
        ? await tx.modifierGroup.update({ where: { id: g.id }, data: groupData })
        : await tx.modifierGroup.create({ data: { ...groupData, productId } });

      const keepOptions = g.options.map((o) => o.id).filter((oid): oid is string => !!oid && existingOptionIds.has(oid));
      await tx.modifierOption.deleteMany({ where: { groupId: group.id, id: { notIn: keepOptions } } });
      for (const [oi, o] of g.options.entries()) {
        const optionData = { name: o.name.trim(), priceDelta: o.priceDelta, isActive: o.isActive ?? true, sortOrder: oi };
        const option = o.id && existingOptionIds.has(o.id)
          ? await tx.modifierOption.update({ where: { id: o.id }, data: { ...optionData, groupId: group.id } })
          : await tx.modifierOption.create({ data: { ...optionData, groupId: group.id } });
        if (inventoryEnabled && o.recipe) {
          await tx.recipeLine.deleteMany({ where: { modifierOptionId: option.id } });
          await tx.recipeLine.createMany({ data: this.recipeRows(o.recipe, { modifierOptionId: option.id }) });
        }
      }
    }
  }

  /** Un combo agrupa productos del mismo negocio que no sean combos (sin anidar) ni el propio combo. */
  private async validComboItems(tenantId: string, dto: ProductDto, id?: string) {
    const items = dto.comboItems ?? [];
    if (items.length < 1) throw new BadRequestException('Agrega al menos un producto al combo');
    const merged = new Map<string, number>();
    for (const c of items) merged.set(c.productId, (merged.get(c.productId) ?? 0) + c.quantity);
    if (id && merged.has(id)) throw new BadRequestException('Un combo no puede incluirse a sí mismo');
    const products = await this.prisma.product.findMany({ where: { tenantId, id: { in: [...merged.keys()] } }, select: { id: true, isCombo: true } });
    if (products.length !== merged.size) throw new BadRequestException('El combo tiene productos inválidos');
    if (products.some((p) => p.isCombo)) throw new BadRequestException('Un combo no puede incluir otro combo');
    return [...merged].map(([productId, quantity]) => ({ productId, quantity }));
  }

  private recipeRows(lines: RecipeLineDto[], owner: { productId?: string; modifierOptionId?: string }) {
    // Si el mismo insumo aparece dos veces se suman las cantidades.
    const merged = new Map<string, number>();
    for (const l of lines) merged.set(l.inventoryItemId, (merged.get(l.inventoryItemId) ?? 0) + l.quantity);
    return [...merged].map(([inventoryItemId, quantity]) => ({ ...owner, inventoryItemId, quantity }));
  }

  private async assertInventoryItems(tenantId: string, dto: ProductDto) {
    const ids = new Set<string>();
    dto.recipe?.forEach((l) => ids.add(l.inventoryItemId));
    dto.modifierGroups?.forEach((g) => g.options.forEach((o) => o.recipe?.forEach((l) => ids.add(l.inventoryItemId))));
    if (!ids.size) return;
    const count = await this.prisma.inventoryItem.count({ where: { tenantId, id: { in: [...ids] } } });
    if (count !== ids.size) throw new BadRequestException('La receta tiene ítems de inventario inválidos');
  }

  async uploadImage(user: AuthUser, id: string, file: Express.Multer.File | undefined) {
    const tenantId = tenantOf(user);
    const product = await this.prisma.product.findFirst({ where: { id, tenantId } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    const url = await this.uploads.saveImage(tenantId, file, 640);
    await this.prisma.product.update({ where: { id }, data: { imageUrl: url } });
    await this.uploads.remove(tenantId, product.imageUrl);
    return this.product(user, id);
  }

  async removeImage(user: AuthUser, id: string) {
    const tenantId = tenantOf(user);
    const product = await this.prisma.product.findFirst({ where: { id, tenantId } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    await this.prisma.product.update({ where: { id }, data: { imageUrl: null } });
    await this.uploads.remove(tenantId, product.imageUrl);
    return this.product(user, id);
  }

  async deleteProduct(user: AuthUser, id: string) {
    const tenantId = tenantOf(user);
    const product = await this.prisma.product.findFirst({ where: { id, tenantId } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    const inCombos = await this.prisma.comboItem.findMany({ where: { productId: id }, include: { combo: { select: { name: true } } } });
    if (inCombos.length) {
      throw new BadRequestException(`Está incluido en: ${[...new Set(inCombos.map((c) => c.combo.name))].join(', ')}. Quítalo de esos combos o desactívalo`);
    }
    // Las ventas guardan copia del nombre y precio, así que el historial no se pierde.
    await this.prisma.product.delete({ where: { id } });
    await this.uploads.remove(tenantId, product.imageUrl);
  }
}
