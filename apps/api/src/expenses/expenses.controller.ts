import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { AuthUser } from '../common/auth-user';
import { RequireTenantModule } from '../common/decorators/branch.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ImageUpload } from '../common/image-upload';
import { AdminExpenseDto, RecurringExpenseDto, RegisterRecurringDto } from './expenses.dto';
import { ExpensesService } from './expenses.service';

/** Gastos administrativos: no pasan por la caja del día. */
@Controller('expenses')
@RequireTenantModule('expenses')
@RequirePermissions('expenses.manage')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('from') from?: string, @Query('to') to?: string, @Query('branch') branch?: string) {
    return this.expenses.list(user, from, to, branch);
  }

  // Gastos fijos (recurrentes)
  @Get('recurring')
  recurring(@CurrentUser() user: AuthUser, @Query('month') month?: string) {
    return this.expenses.recurring(user, month);
  }

  @Post('recurring')
  createRecurring(@CurrentUser() user: AuthUser, @Body() dto: RecurringExpenseDto) {
    return this.expenses.saveRecurring(user, dto);
  }

  @Post('recurring/register-all')
  registerAll(@CurrentUser() user: AuthUser, @Body() dto: RegisterRecurringDto) {
    return this.expenses.registerAllRecurring(user, dto);
  }

  @Put('recurring/:id')
  updateRecurring(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RecurringExpenseDto) {
    return this.expenses.saveRecurring(user, dto, id);
  }

  @Delete('recurring/:id')
  @HttpCode(204)
  removeRecurring(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.expenses.removeRecurring(user, id);
  }

  @Post('recurring/:id/register')
  register(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RegisterRecurringDto) {
    return this.expenses.registerRecurring(user, id, dto);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: AdminExpenseDto) {
    return this.expenses.save(user, dto);
  }

  @Put(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminExpenseDto) {
    return this.expenses.save(user, dto, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.expenses.remove(user, id);
  }

  @Post(':id/receipt')
  @UseInterceptors(ImageUpload())
  receipt(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File) {
    return this.expenses.uploadReceipt(user, id, file);
  }
}
