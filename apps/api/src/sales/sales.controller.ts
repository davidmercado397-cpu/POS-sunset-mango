import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { AuthUser, BranchContext } from '../common/auth-user';
import { CurrentBranch, RequireModule } from '../common/decorators/branch.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireAnyPermission, RequirePermissions } from '../common/decorators/permissions.decorator';
import { AddItemsDto, CreateSaleDto, OpenOrderDto, PayDto, VoidDto } from './sales.dto';
import { SalesService } from './sales.service';

@Controller()
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get('pos/menu')
  @RequireModule('pos')
  @RequireAnyPermission('pos.sell', 'tables.manage')
  menu(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext) {
    return this.sales.menu(user, branch);
  }

  @Post('sales')
  @RequireModule('pos')
  @RequirePermissions('pos.sell')
  create(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Body() dto: CreateSaleDto) {
    return this.sales.create(user, branch, dto);
  }

  @Get('sales')
  @RequireModule('pos')
  @RequirePermissions('sales.view')
  list(
    @CurrentUser() user: AuthUser,
    @CurrentBranch() branch: BranchContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
  ) {
    return this.sales.list(user, branch, from, to, status);
  }

  @Get('sales/:id')
  @RequireModule('pos')
  @RequireAnyPermission('sales.view', 'pos.sell', 'tables.manage')
  detail(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.sales.detail(user, branch, id);
  }

  @Post('sales/:id/void')
  @RequireModule('pos')
  @RequirePermissions('sales.void')
  void(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VoidDto) {
    return this.sales.void(user, branch, id, dto.reason);
  }

  // Cuentas abiertas (módulo de mesas)

  @Get('orders')
  @RequireModule('tables')
  @RequirePermissions('tables.manage')
  openOrders(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext) {
    return this.sales.openOrders(user, branch);
  }

  @Post('orders')
  @RequireModule('tables')
  @RequirePermissions('tables.manage')
  openOrder(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Body() dto: OpenOrderDto) {
    return this.sales.openOrder(user, branch, dto);
  }

  @Post('orders/:id/items')
  @RequireModule('tables')
  @RequirePermissions('tables.manage')
  addItems(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddItemsDto) {
    return this.sales.addItems(user, branch, id, dto);
  }

  @Delete('orders/:id/items/:itemId')
  @RequireModule('tables')
  @RequirePermissions('tables.manage')
  removeItem(
    @CurrentUser() user: AuthUser,
    @CurrentBranch() branch: BranchContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.sales.removeItem(user, branch, id, itemId);
  }

  @Post('orders/:id/pay')
  @RequireModule('tables')
  @RequirePermissions('pos.sell')
  pay(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PayDto) {
    return this.sales.payOrder(user, branch, id, dto);
  }

  @Post('orders/:id/cancel')
  @RequireModule('tables')
  @RequirePermissions('sales.void')
  cancel(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VoidDto) {
    return this.sales.cancelOrder(user, branch, id, dto.reason);
  }
}
