import { Injectable } from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { round3 } from '../common/util';

export interface StockLine {
  itemId: string;
  /** Positivo entra, negativo sale */
  quantity: number;
  /** Costo unitario para entradas (compras, traslados); actualiza el costo promedio */
  unitCost?: number;
}

export interface StockOperation {
  tenantId: string;
  branchId: string;
  userId?: string;
  type: StockMovementType;
  refType?: string;
  refId?: string;
  note?: string;
  lines: StockLine[];
}

/**
 * Movimientos de inventario atómicos. Cada línea actualiza la existencia de la sede con una sola
 * sentencia SQL (sin condiciones de carrera) y deja el registro en el kardex.
 */
@Injectable()
export class StockService {
  async apply(tx: Prisma.TransactionClient, op: StockOperation): Promise<{ itemId: string; quantity: number; unitCost: number }[]> {
    const results: { itemId: string; quantity: number; unitCost: number }[] = [];
    for (const line of mergeLines(op.lines)) {
      if (line.quantity === 0) continue;
      const cost = line.quantity > 0 && line.unitCost != null ? line.unitCost : null;
      const [row] = await tx.$queryRaw<{ quantity: Prisma.Decimal; avgCost: Prisma.Decimal }[]>`
        INSERT INTO "Stock" ("itemId", "branchId", "quantity", "avgCost")
        VALUES (${line.itemId}, ${op.branchId}, ${line.quantity}, ${cost ?? 0})
        ON CONFLICT ("itemId", "branchId") DO UPDATE SET
          "avgCost" = CASE
            WHEN ${cost}::numeric IS NULL THEN "Stock"."avgCost"
            WHEN "Stock"."quantity" <= 0 THEN ${cost}::numeric
            ELSE ROUND(("Stock"."quantity" * "Stock"."avgCost" + ${line.quantity}::numeric * ${cost}::numeric) / ("Stock"."quantity" + ${line.quantity}::numeric), 2)
          END,
          "quantity" = "Stock"."quantity" + ${line.quantity}::numeric
        RETURNING "quantity", "avgCost"`;
      const unitCost = cost ?? Number(row.avgCost);
      await tx.stockMovement.create({
        data: {
          tenantId: op.tenantId,
          branchId: op.branchId,
          itemId: line.itemId,
          type: op.type,
          quantity: line.quantity,
          unitCost,
          balanceAfter: row.quantity,
          refType: op.refType,
          refId: op.refId,
          note: op.note,
          userId: op.userId,
        },
      });
      results.push({ itemId: line.itemId, quantity: line.quantity, unitCost });
    }
    return results;
  }
}

/** Agrupa líneas del mismo ítem (y mismo costo) para generar un solo movimiento. */
function mergeLines(lines: StockLine[]): StockLine[] {
  const map = new Map<string, StockLine>();
  for (const l of lines) {
    const key = `${l.itemId}|${l.unitCost ?? ''}`;
    const prev = map.get(key);
    map.set(key, prev ? { ...prev, quantity: round3(prev.quantity + l.quantity) } : { ...l, quantity: round3(l.quantity) });
  }
  return [...map.values()];
}
