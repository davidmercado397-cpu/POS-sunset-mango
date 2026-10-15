import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import ExcelJS from 'exceljs';
import { AuditService } from '../audit/audit.service';
import { AuthUser, BranchContext } from '../common/auth-user';
import { dayRange, tenantOf } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';

const MAX_ROWS = 3000;
const HEADERS = ['Fecha (AAAA-MM-DD)', 'Código del producto', 'Cantidad', 'Método de pago', 'Valor pagado'];

interface ParsedRow {
  row: number;
  day: string;
  productId: string;
  productName: string;
  quantity: number;
  method: PaymentMethod;
  amount: number;
}

const plain = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function parseMethod(value: string): PaymentMethod | null {
  const v = plain(value);
  if (!v) return null;
  if (/^(efectivo|cash|contado)/.test(v)) return 'CASH';
  if (/^(transferencia|transfer|nequi|daviplata|bancolombia|consignacion)/.test(v)) return 'TRANSFER';
  if (/^(qr|bold|tarjeta|datafono|credito|debito)/.test(v)) return 'QR_BOLD';
  return null;
}

/** Texto o número de una celda (incluye resultados de fórmulas y fechas de Excel). */
function cellValue(cell: ExcelJS.Cell): string | number | Date | null {
  let v = cell.value as unknown;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    v = o.result ?? o.text ?? (o.richText ? o.richText.map((t) => t.text).join('') : null);
  }
  if (v === undefined || v === null || v === '') return null;
  return v as string | number | Date;
}

function parseDay(v: string | number | Date | null): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    // Número de serie de Excel (días desde 1899-12-30)
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400_000);
    return d.toISOString().slice(0, 10);
  }
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(s); // DD/MM/AAAA
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function parseInteger(v: string | number | Date | null): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[$\s.]/g, '').replace(',', '.'));
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  return null;
}

/** Carga de ventas desde Excel: no pasan por caja ni descuentan inventario. */
@Injectable()
export class SalesImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Plantilla con la hoja para llenar, la lista de productos con su código e instrucciones. */
  async template(user: AuthUser): Promise<Buffer> {
    const products = await this.prisma.product.findMany({
      where: { tenantId: tenantOf(user) },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: { code: true, name: true, price: true, isActive: true },
    });
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Sunset Mango POS';

    const ws = wb.addWorksheet('Ventas');
    ws.columns = [{ width: 20 }, { width: 22 }, { width: 12 }, { width: 18 }, { width: 16 }];
    ws.addRow(HEADERS);
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' } };
    const sample = products.find((p) => p.isActive && p.code) ?? products[0];
    const today = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
    if (sample) ws.addRow([today, sample.code ?? '', 2, 'Efectivo', sample.price * 2]);
    for (let r = 2; r <= MAX_ROWS + 1; r++) {
      ws.getCell(`D${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Efectivo,Transferencia,QR Bold"'] };
    }
    ws.getColumn(1).numFmt = '@';
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    const ps = wb.addWorksheet('Productos');
    ps.columns = [{ header: 'Código', width: 14 }, { header: 'Producto', width: 36 }, { header: 'Precio', width: 14 }, { header: 'Activo', width: 10 }];
    ps.getRow(1).font = { bold: true };
    for (const p of products) ps.addRow([p.code ?? '', p.name, p.price, p.isActive ? 'Sí' : 'No']);

    const info = wb.addWorksheet('Instrucciones');
    info.getColumn(1).width = 110;
    [
      'Cómo llenar la hoja "Ventas" (una fila por producto vendido):',
      '• Fecha: el día de la venta, en formato AAAA-MM-DD (ej. 2026-10-15). También se acepta DD/MM/AAAA.',
      '• Código del producto: el de la hoja "Productos" (se ve y se edita en Catálogo).',
      '• Cantidad: unidades vendidas (número entero).',
      '• Método de pago: Efectivo, Transferencia o QR Bold.',
      '• Valor pagado: lo que se cobró por esa fila, en pesos y sin puntos (ej. 11000).',
      '',
      'Cada fila queda como una venta en la fecha indicada. No afecta la caja del día ni descuenta inventario.',
      'Si alguna fila tiene un error no se carga nada y el sistema indica la fila y el problema para corregirlo.',
      'Borra la fila de ejemplo antes de cargar el archivo.',
    ].forEach((t, i) => {
      info.addRow([t]);
      if (i === 0) info.getRow(1).font = { bold: true };
    });

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async import(user: AuthUser, branch: BranchContext, file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Adjunta el archivo de Excel');
    const tenantId = tenantOf(user);
    const rows = await this.parse(tenantId, branch, file.buffer);
    const total = rows.reduce((s, r) => s + r.amount, 0);

    const batch = await this.prisma.$transaction(
      async (tx) => {
        const batch = await tx.salesImport.create({
          data: { tenantId, branchId: branch.id, fileName: (file.originalname || 'ventas.xlsx').slice(0, 120), rowCount: rows.length, total, createdById: user.id },
        });
        for (const r of rows) {
          const { saleSeq: number } = await tx.branch.update({ where: { id: branch.id }, data: { saleSeq: { increment: 1 } }, select: { saleSeq: true } });
          const at = new Date(`${r.day}T12:00:00-05:00`);
          await tx.sale.create({
            data: {
              tenantId, branchId: branch.id, number, status: 'COMPLETED', subtotal: r.amount,
              notes: `Cargada desde Excel (fila ${r.row})`, createdById: user.id, createdAt: at, completedAt: at, importId: batch.id,
              items: { create: { productId: r.productId, productName: r.productName, unitPrice: Math.round(r.amount / r.quantity), quantity: r.quantity, lineTotal: r.amount, sentAt: at } },
              payments: { create: { method: r.method, amount: r.amount, received: r.method === 'CASH' ? r.amount : null, change: r.method === 'CASH' ? 0 : null } },
            },
          });
        }
        return batch;
      },
      { timeout: 120_000 },
    );
    await this.audit.log({ tenantId, branchId: branch.id, userId: user.id, action: 'sales.imported', entity: 'SalesImport', entityId: batch.id, data: { rows: rows.length, total, file: batch.fileName } });
    return { id: batch.id, rowCount: rows.length, total };
  }

  async list(user: AuthUser, branch: BranchContext) {
    const rows = await this.prisma.salesImport.findMany({ where: { tenantId: tenantOf(user), branchId: branch.id }, orderBy: { createdAt: 'desc' }, take: 50 });
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById))] } }, select: { id: true, fullName: true } });
    const names = new Map(users.map((u) => [u.id, u.fullName]));
    return rows.map((r) => ({ ...r, createdBy: names.get(r.createdById) ?? '' }));
  }

  /** Deshace una carga: borra sus ventas (si los meses involucrados no están cerrados). */
  async remove(user: AuthUser, branch: BranchContext, id: string) {
    const tenantId = tenantOf(user);
    const batch = await this.prisma.salesImport.findFirst({ where: { id, tenantId, branchId: branch.id } });
    if (!batch) throw new NotFoundException('Carga no encontrada');
    const months = await this.prisma.$queryRaw<{ y: number; m: number }[]>`
      SELECT DISTINCT EXTRACT(YEAR FROM "completedAt" AT TIME ZONE 'America/Bogota')::int AS y,
             EXTRACT(MONTH FROM "completedAt" AT TIME ZONE 'America/Bogota')::int AS m
      FROM "Sale" WHERE "importId" = ${id}`;
    for (const { y, m } of months) {
      if (await this.prisma.monthlyClose.findUnique({ where: { branchId_year_month: { branchId: branch.id, year: y, month: m } } })) {
        throw new BadRequestException(`La carga tiene ventas de ${String(m).padStart(2, '0')}/${y}, que ya fue cerrado`);
      }
    }
    await this.prisma.salesImport.delete({ where: { id } }); // las ventas se borran en cascada
    await this.audit.log({ tenantId, branchId: branch.id, userId: user.id, action: 'sales.import_deleted', entity: 'SalesImport', entityId: id, data: { rows: batch.rowCount, total: batch.total, file: batch.fileName } });
  }

  /** Lee y valida todo el archivo; si hay errores no se carga nada. */
  private async parse(tenantId: string, branch: BranchContext, buffer: Buffer): Promise<ParsedRow[]> {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw new BadRequestException('No se pudo leer el archivo. Usa la plantilla en formato .xlsx');
    }
    const ws = wb.getWorksheet('Ventas') ?? wb.worksheets[0];
    if (!ws) throw new BadRequestException('El archivo no tiene hojas');

    const products = await this.prisma.product.findMany({ where: { tenantId }, select: { id: true, code: true, name: true } });
    const byCode = new Map(products.filter((p) => p.code).map((p) => [plain(p.code!), p]));
    const today = dayRange().gte;
    const closedMonths = new Set(
      (await this.prisma.monthlyClose.findMany({ where: { branchId: branch.id }, select: { year: true, month: true } })).map((c) => `${c.year}-${String(c.month).padStart(2, '0')}`),
    );

    const rows: ParsedRow[] = [];
    const errors: string[] = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return;
      const values = [1, 2, 3, 4, 5].map((c) => cellValue(row.getCell(c)));
      if (values.every((v) => v === null || String(v).trim() === '')) return;
      const problems: string[] = [];
      const day = parseDay(values[0]);
      if (!day) problems.push('fecha inválida (usa AAAA-MM-DD)');
      else if (new Date(`${day}T00:00:00-05:00`) > today) problems.push('la fecha no puede ser futura');
      else if (closedMonths.has(day.slice(0, 7))) problems.push(`el mes ${day.slice(0, 7)} ya fue cerrado`);
      const code = values[1] === null ? '' : String(values[1]).trim();
      const product = code ? byCode.get(plain(code)) : undefined;
      if (!code) problems.push('falta el código del producto');
      else if (!product) problems.push(`no existe un producto con código "${code}"`);
      const quantity = parseInteger(values[2]);
      if (!quantity || quantity < 1 || quantity > 100_000) problems.push('cantidad inválida');
      const method = parseMethod(values[3] === null ? '' : String(values[3]));
      if (!method) problems.push('método de pago inválido (Efectivo, Transferencia o QR Bold)');
      const amount = parseInteger(values[4]);
      if (amount === null || amount < 1 || amount > 1_000_000_000) problems.push('valor pagado inválido');
      if (problems.length) errors.push(`Fila ${n}: ${problems.join('; ')}`);
      else rows.push({ row: n, day: day!, productId: product!.id, productName: product!.name, quantity: quantity!, method: method!, amount: amount! });
    });

    if (errors.length) {
      throw new BadRequestException({ message: `El archivo tiene ${errors.length} fila(s) con errores; no se cargó nada`, errors: errors.slice(0, 200) });
    }
    if (!rows.length) throw new BadRequestException('El archivo no tiene ventas para cargar');
    if (rows.length > MAX_ROWS) throw new BadRequestException(`Máximo ${MAX_ROWS} filas por archivo`);
    return rows;
  }
}

