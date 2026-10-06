import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthUser, BranchContext } from '../common/auth-user';
import { CurrentBranch, RequireModule } from '../common/decorators/branch.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Public } from '../common/decorators/public.decorator';
import { PayDto } from '../sales/sales.dto';
import { ConfirmPaymentDto, OnlineSettingsDto, OnlineStatusDto, PublicOrderDto, ReasonDto, SubdomainDto } from './online.dto';
import { OnlineService } from './online.service';

/** Tienda pública: no requiere usuario. */
@Controller('public')
@Public()
export class PublicStoreController {
  constructor(private readonly online: OnlineService) {}

  /** El frontend pregunta si el host actual es la tienda de un negocio (subdominio o dominio propio). */
  @Get('host')
  @SkipThrottle()
  host(@Req() req: Request) {
    return this.online.resolveHost(req.hostname || req.headers.host || '');
  }

  @Get('store/:slug')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  store(@Param('slug') slug: string) {
    return this.online.store(slug);
  }

  @Get('store/:slug/menu')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  menu(@Param('slug') slug: string, @Query('branchId', ParseUUIDPipe) branchId: string) {
    return this.online.menu(slug, branchId);
  }

  @Post('store/:slug/orders')
  @Throttle({ default: { limit: () => Number(process.env.ONLINE_ORDER_RATE_LIMIT ?? 5), ttl: 60_000 } })
  order(@Param('slug') slug: string, @Body() dto: PublicOrderDto, @Req() req: Request) {
    return this.online.placeOrder(slug, dto, req.ip);
  }

  @Get('orders/:code')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  track(@Param('code') code: string) {
    return this.online.track(code);
  }
}

@Controller('online')
@RequireModule('online')
@RequirePermissions('online.manage')
export class OnlineController {
  constructor(private readonly online: OnlineService) {}

  @Get('orders')
  @SkipThrottle()
  list(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Query('scope') scope?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.online.list(user, branch, scope, from, to);
  }

  @Patch('orders/:id/status')
  status(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: OnlineStatusDto) {
    return this.online.setStatus(user, branch, id, dto.status);
  }

  @Post('orders/:id/payment')
  confirmPayment(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmPaymentDto) {
    return this.online.confirmPayment(user, branch, id, dto.reference);
  }

  @Post('orders/:id/reject')
  reject(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.online.close(user, branch, id, 'REJECTED', dto.reason);
  }

  @Post('orders/:id/cancel')
  cancel(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.online.close(user, branch, id, 'CANCELLED', dto.reason);
  }

  @Post('orders/:id/pay')
  @RequirePermissions('online.manage', 'pos.sell')
  pay(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PayDto) {
    return this.online.pay(user, branch, id, dto);
  }

  @Get('settings')
  settings(@CurrentBranch() branch: BranchContext) {
    return this.online.settings(branch);
  }

  @Put('subdomain')
  @RequirePermissions('online.manage', 'settings.manage')
  subdomain(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Body() dto: SubdomainDto) {
    return this.online.updateSubdomain(user, branch, dto.storeSubdomain);
  }

  @Put('settings')
  updateSettings(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Body() dto: OnlineSettingsDto) {
    return this.online.updateSettings(user, branch, dto);
  }
}
