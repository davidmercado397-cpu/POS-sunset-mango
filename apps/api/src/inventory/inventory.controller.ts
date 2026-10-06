import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { AuthUser, BranchContext } from '../common/auth-user';
import { CurrentBranch, RequireModule, RequireTenantModule } from '../common/decorators/branch.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireAnyPermission, RequirePermissions } from '../common/decorators/permissions.decorator';
import { AdjustDto, InventoryItemDto, PurchaseDto, SupplierDto, TransferDto } from './inventory.dto';
import { InventoryService } from './inventory.service';

@Controller()
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  // Ítems (a nivel de negocio)
  @Get('inventory/items')
  @RequireTenantModule('inventory')
  @RequireAnyPermission('inventory.view', 'catalog.manage', 'purchases.manage', 'transfers.manage')
  items(@CurrentUser() user: AuthUser) {
    return this.inventory.items(user);
  }

  @Post('inventory/items')
  @RequireTenantModule('inventory')
  @RequirePermissions('inventory.manage')
  createItem(@CurrentUser() user: AuthUser, @Body() dto: InventoryItemDto) {
    return this.inventory.saveItem(user, dto);
  }

  @Put('inventory/items/:id')
  @RequireTenantModule('inventory')
  @RequirePermissions('inventory.manage')
  updateItem(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: InventoryItemDto) {
    return this.inventory.saveItem(user, dto, id);
  }

  // Existencias por sede
  @Get('inventory/stock')
  @RequireModule('inventory')
  @RequirePermissions('inventory.view')
  stock(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext) {
    return this.inventory.stockList(user, branch);
  }

  @Post('inventory/adjust')
  @RequireModule('inventory')
  @RequirePermissions('inventory.adjust')
  adjust(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Body() dto: AdjustDto) {
    return this.inventory.adjust(user, branch, dto);
  }

  @Get('inventory/movements')
  @RequireModule('inventory')
  @RequirePermissions('inventory.view')
  movements(
    @CurrentUser() user: AuthUser,
    @CurrentBranch() branch: BranchContext,
    @Query('itemId') itemId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.inventory.movements(user, branch, itemId, from, to);
  }

  // Proveedores
  @Get('suppliers')
  @RequireTenantModule('purchases')
  @RequirePermissions('purchases.manage')
  suppliers(@CurrentUser() user: AuthUser) {
    return this.inventory.suppliers(user);
  }

  @Post('suppliers')
  @RequireTenantModule('purchases')
  @RequirePermissions('purchases.manage')
  createSupplier(@CurrentUser() user: AuthUser, @Body() dto: SupplierDto) {
    return this.inventory.saveSupplier(user, dto);
  }

  @Put('suppliers/:id')
  @RequireTenantModule('purchases')
  @RequirePermissions('purchases.manage')
  updateSupplier(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SupplierDto) {
    return this.inventory.saveSupplier(user, dto, id);
  }

  // Compras
  @Get('purchases')
  @RequireModule('purchases')
  @RequirePermissions('purchases.manage')
  purchases(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Query('from') from?: string, @Query('to') to?: string) {
    return this.inventory.purchases(user, branch, from, to);
  }

  @Get('purchases/:id')
  @RequireModule('purchases')
  @RequirePermissions('purchases.manage')
  purchase(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.purchase(user, branch, id);
  }

  @Post('purchases')
  @RequireModule('purchases')
  @RequirePermissions('purchases.manage')
  createPurchase(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Body() dto: PurchaseDto) {
    return this.inventory.createPurchase(user, branch, dto);
  }

  // Traslados
  @Get('transfers/branches')
  @RequireModule('transfers')
  @RequirePermissions('transfers.manage')
  transferBranches(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext) {
    return this.inventory.transferBranches(user, branch);
  }

  @Get('transfers')
  @RequireModule('transfers')
  @RequirePermissions('transfers.manage')
  transfers(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext) {
    return this.inventory.transfers(user, branch);
  }

  @Post('transfers')
  @RequireModule('transfers')
  @RequirePermissions('transfers.manage')
  createTransfer(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Body() dto: TransferDto) {
    return this.inventory.createTransfer(user, branch, dto);
  }

  @Post('transfers/:id/receive')
  @RequireModule('inventory')
  @RequirePermissions('transfers.manage')
  receive(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.receiveTransfer(user, branch, id);
  }

  @Post('transfers/:id/cancel')
  @RequireModule('transfers')
  @RequirePermissions('transfers.manage')
  cancel(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.cancelTransfer(user, branch, id);
  }
}
