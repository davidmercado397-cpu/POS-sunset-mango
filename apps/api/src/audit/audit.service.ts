import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  tenantId?: string | null;
  branchId?: string | null;
  userId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  data?: Prisma.InputJsonValue;
  ip?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Registra un evento de auditoría. Nunca interrumpe la operación si falla. */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: entry });
    } catch (err) {
      this.logger.error(`No se pudo registrar auditoría ${entry.action}`, err as Error);
    }
  }
}
