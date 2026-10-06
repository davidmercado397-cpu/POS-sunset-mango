import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { ResetPasswordDto } from '../platform/platform.dto';
import { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ImageUpload } from '../common/image-upload';
import { BoldSettingsDto, BranchDto, BrandingDto, CreateUserDto, NamedDto, RoleDto, TableDto, UpdateUserDto } from './admin.dto';
import { AdminService } from './admin.service';

@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  // Sedes
  @Get('branches')
  @RequirePermissions('branches.manage')
  branches(@CurrentUser() user: AuthUser) {
    return this.admin.branches(user);
  }

  @Post('branches')
  @RequirePermissions('branches.manage')
  createBranch(@CurrentUser() user: AuthUser, @Body() dto: BranchDto) {
    return this.admin.createBranch(user, dto);
  }

  @Put('branches/:id')
  @RequirePermissions('branches.manage')
  updateBranch(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BranchDto) {
    return this.admin.updateBranch(user, id, dto);
  }

  // Usuarios
  @Get('users')
  @RequirePermissions('users.manage')
  users(@CurrentUser() user: AuthUser) {
    return this.admin.users(user);
  }

  @Post('users')
  @RequirePermissions('users.manage')
  createUser(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return this.admin.createUser(user, dto);
  }

  @Patch('users/:id')
  @RequirePermissions('users.manage')
  updateUser(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.admin.updateUser(user, id, dto);
  }

  @Post('users/:id/reset-password')
  @RequirePermissions('users.manage')
  @HttpCode(204)
  resetPassword(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResetPasswordDto) {
    return this.admin.resetPassword(user, id, dto.password);
  }

  // Roles (la lista también se usa al crear usuarios)
  @Get('roles')
  @RequirePermissions('users.manage')
  roles(@CurrentUser() user: AuthUser) {
    return this.admin.roles(user);
  }

  @Post('roles')
  @RequirePermissions('roles.manage')
  createRole(@CurrentUser() user: AuthUser, @Body() dto: RoleDto) {
    return this.admin.saveRole(user, dto);
  }

  @Put('roles/:id')
  @RequirePermissions('roles.manage')
  updateRole(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RoleDto) {
    return this.admin.saveRole(user, dto, id);
  }

  @Delete('roles/:id')
  @RequirePermissions('roles.manage')
  @HttpCode(204)
  deleteRole(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.deleteRole(user, id);
  }

  // Marca
  @Get('branding')
  @RequirePermissions('settings.manage')
  branding(@CurrentUser() user: AuthUser) {
    return this.admin.branding(user);
  }

  @Put('branding')
  @RequirePermissions('settings.manage')
  updateBranding(@CurrentUser() user: AuthUser, @Body() dto: BrandingDto) {
    return this.admin.updateBranding(user, dto);
  }

  @Post('branding/logo')
  @RequirePermissions('settings.manage')
  @UseInterceptors(ImageUpload())
  uploadLogo(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    return this.admin.uploadLogo(user, file);
  }

  @Delete('branding/logo')
  @RequirePermissions('settings.manage')
  removeLogo(@CurrentUser() user: AuthUser) {
    return this.admin.removeLogo(user);
  }

  // Pagos en línea (Bold)
  @Get('payments/bold')
  @RequirePermissions('settings.manage')
  boldSettings(@CurrentUser() user: AuthUser) {
    return this.admin.boldSettings(user);
  }

  @Put('payments/bold')
  @RequirePermissions('settings.manage')
  updateBoldSettings(@CurrentUser() user: AuthUser, @Body() dto: BoldSettingsDto) {
    return this.admin.updateBoldSettings(user, dto);
  }

  // Categorías de gastos (lectura para quien registra gastos)
  @Get('expense-categories')
  @RequirePermissions('cash.movements')
  expenseCategories(@CurrentUser() user: AuthUser) {
    return this.admin.expenseCategories(user);
  }

  @Post('expense-categories')
  @RequirePermissions('expenses.categories')
  createExpenseCategory(@CurrentUser() user: AuthUser, @Body() dto: NamedDto) {
    return this.admin.saveExpenseCategory(user, dto);
  }

  @Put('expense-categories/:id')
  @RequirePermissions('expenses.categories')
  updateExpenseCategory(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NamedDto) {
    return this.admin.saveExpenseCategory(user, dto, id);
  }

  // Mesas por sede
  @Get('branches/:branchId/tables')
  @RequirePermissions('branches.manage')
  tables(@CurrentUser() user: AuthUser, @Param('branchId', ParseUUIDPipe) branchId: string) {
    return this.admin.tables(user, branchId);
  }

  @Post('branches/:branchId/tables')
  @RequirePermissions('branches.manage')
  createTable(@CurrentUser() user: AuthUser, @Param('branchId', ParseUUIDPipe) branchId: string, @Body() dto: TableDto) {
    return this.admin.saveTable(user, branchId, dto);
  }

  @Put('branches/:branchId/tables/:id')
  @RequirePermissions('branches.manage')
  updateTable(
    @CurrentUser() user: AuthUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TableDto,
  ) {
    return this.admin.saveTable(user, branchId, dto, id);
  }

  // Auditoría
  @Get('audit')
  @RequirePermissions('audit.view')
  audit(@CurrentUser() user: AuthUser, @Query('page') page?: string) {
    return this.admin.auditLog(user, Math.max(1, Number(page) || 1));
  }
}
