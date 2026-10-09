import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { KitchenStatus, Prisma } from '@prisma/client';
import { BranchContext } from '../common/auth-user';
import { dayRange } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';
import { KitchenGateway } from './kitchen.gateway';

export interface KitchenTicketItem {
  name: string;
  quantity: number;
  modifiers: string[];
  /** Combo: productos que incluye */
  components?: string[];
  notes?: string | null;
}

const NEXT: Record<KitchenStatus, KitchenStatus[]> = {
  PENDING: ['PREPARING', 'READY', 'DELIVERED', 'CANCELLED'],
  PREPARING: ['READY', 'PENDING', 'DELIVERED', 'CANCELLED'],
  READY: ['DELIVERED', 'PREPARING'],
  DELIVERED: ['READY'],
  CANCELLED: [],
};

@Injectable()
export class KitchenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: KitchenGateway,
  ) {}

  createTicket(
    tx: Prisma.TransactionClient,
    data: { tenantId: string; branchId: string; saleId?: string; onlineOrderId?: string; label: string; items: KitchenTicketItem[] },
  ) {
    return tx.kitchenTicket.create({ data: { ...data, items: data.items as unknown as Prisma.InputJsonValue } });
  }

  notify(branchId: string) {
    this.gateway.notify(branchId);
  }

  async list(branch: BranchContext) {
    const since = new Date(Date.now() - 60 * 60_000);
    return this.prisma.kitchenTicket.findMany({
      where: {
        branchId: branch.id,
        OR: [{ status: { in: ['PENDING', 'PREPARING', 'READY'] } }, { status: 'DELIVERED', updatedAt: { gte: since } }],
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
  }

  async setStatus(branch: BranchContext, id: string, status: KitchenStatus) {
    const ticket = await this.prisma.kitchenTicket.findFirst({ where: { id, branchId: branch.id } });
    if (!ticket) throw new NotFoundException('Comanda no encontrada');
    if (!NEXT[ticket.status].includes(status)) throw new BadRequestException('Cambio de estado no permitido');
    const updated = await this.prisma.kitchenTicket.update({ where: { id }, data: { status } });
    this.notify(branch.id);
    return updated;
  }

  /** Cierra (marca como entregadas) las comandas abiertas: solo las de días anteriores o todas. */
  async closeOpen(branch: BranchContext, scope: 'previous' | 'all') {
    const where: Prisma.KitchenTicketWhereInput = {
      branchId: branch.id,
      status: { in: ['PENDING', 'PREPARING', 'READY'] },
      ...(scope === 'previous' ? { createdAt: { lt: dayRange().gte } } : {}),
    };
    const { count } = await this.prisma.kitchenTicket.updateMany({ where, data: { status: 'DELIVERED' } });
    if (count) this.notify(branch.id);
    return { closed: count };
  }
}
