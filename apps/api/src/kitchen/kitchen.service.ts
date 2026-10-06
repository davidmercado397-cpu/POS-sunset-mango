import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { KitchenStatus, Prisma } from '@prisma/client';
import { BranchContext } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { KitchenGateway } from './kitchen.gateway';

export interface KitchenTicketItem {
  name: string;
  quantity: number;
  modifiers: string[];
  notes?: string | null;
}

const NEXT: Record<KitchenStatus, KitchenStatus[]> = {
  PENDING: ['PREPARING', 'READY', 'CANCELLED'],
  PREPARING: ['READY', 'PENDING', 'CANCELLED'],
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
}
