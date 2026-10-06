import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { AuthUser, BranchContext } from '../common/auth-user';
import { CurrentBranch, RequireModule } from '../common/decorators/branch.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireAnyPermission, RequirePermissions } from '../common/decorators/permissions.decorator';
import { CashMovementDto, CloseCashDto, OpenCashDto } from './cash.dto';
import { CashService } from './cash.service';

@Controller('cash')
@RequireModule('cash')
export class CashController {
  constructor(private readonly cash: CashService) {}

  @Get('current')
  @RequireAnyPermission('cash.open', 'cash.close', 'cash.view', 'cash.movements', 'pos.sell')
  current(@CurrentBranch() branch: BranchContext) {
    return this.cash.current(branch);
  }

  @Post('open')
  @RequirePermissions('cash.open')
  open(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Body() dto: OpenCashDto) {
    return this.cash.open(user, branch, dto);
  }

  @Post('movements')
  @RequirePermissions('cash.movements')
  movement(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Body() dto: CashMovementDto) {
    return this.cash.addMovement(user, branch, dto);
  }

  @Post('close')
  @RequirePermissions('cash.close')
  close(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Body() dto: CloseCashDto) {
    return this.cash.close(user, branch, dto);
  }

  @Get('sessions')
  @RequirePermissions('cash.view')
  sessions(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Query('from') from?: string, @Query('to') to?: string) {
    return this.cash.sessions(user, branch, from, to);
  }

  @Get('sessions/:id')
  @RequireAnyPermission('cash.view', 'cash.close')
  detail(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.cash.detail(user, id, branch.id);
  }
}
