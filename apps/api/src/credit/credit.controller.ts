import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { AuthUser, BranchContext } from '../common/auth-user';
import { CurrentBranch, RequireModule } from '../common/decorators/branch.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ReceivablePaymentDto } from './credit.dto';
import { CreditService } from './credit.service';

/** Cuentas por cobrar de las ventas a crédito (fiado) de la sede. */
@Controller('credit/receivables')
@RequireModule('credit')
@RequirePermissions('credit.manage')
export class CreditController {
  constructor(private readonly credit: CreditService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Query('status') status?: string, @Query('q') q?: string) {
    return this.credit.list(user, branch, status, q);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.credit.detail(user, branch, id);
  }

  @Post(':id/payments')
  pay(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReceivablePaymentDto) {
    return this.credit.pay(user, branch, id, dto);
  }
}
