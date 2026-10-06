import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { AuthUser } from '../common/auth-user';
import { resolveBranch } from '../common/guards/branch.guard';
import { isValidPermission } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Canal en tiempo real por sede. El cliente se conecta con { token, branchId } y recibe
 * el evento "kitchen:changed" cada vez que cambia una comanda.
 */
@WebSocketGateway({ path: '/api/socket.io', cors: false })
export class KitchenGateway implements OnGatewayConnection {
  private readonly logger = new Logger(KitchenGateway.name);
  @WebSocketServer() server: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(socket: Socket) {
    try {
      const { token, branchId } = socket.handshake.auth as { token?: string; branchId?: string };
      if (!token || !branchId) throw new Error('missing auth');
      const { sub } = await this.jwt.verifyAsync<{ sub: string }>(token);
      const user = await this.prisma.user.findUnique({ where: { id: sub }, include: { role: true, tenant: true, branches: true } });
      if (!user || !user.isActive || !user.tenant?.isActive) throw new Error('inactive');
      const authUser: AuthUser = {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        isSuperAdmin: false,
        tenantId: user.tenantId,
        roleId: user.roleId,
        permissions: (user.role?.permissions ?? []).filter(isValidPermission),
        branchIds: user.branches.map((b) => b.branchId),
        tenantModules: user.tenant.enabledModules,
      };
      const branch = await resolveBranch(this.prisma, authUser, branchId);
      await socket.join(`branch:${branch.id}`);
    } catch {
      socket.disconnect(true);
    }
  }

  notify(branchId: string, event = 'kitchen:changed', payload: unknown = {}) {
    try {
      this.server?.to(`branch:${branchId}`).emit(event, payload);
    } catch (err) {
      this.logger.warn(`No se pudo notificar a la sede ${branchId}: ${(err as Error).message}`);
    }
  }
}
