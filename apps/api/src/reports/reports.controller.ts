import { Controller, Get, Query } from '@nestjs/common';
import { AuthUser, BranchContext } from '../common/auth-user';
import { CurrentBranch, RequireModule } from '../common/decorators/branch.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ReportsService } from './reports.service';

@Controller('reports')
@RequireModule('reports')
@RequirePermissions('reports.view')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  summary(
    @CurrentUser() user: AuthUser,
    @CurrentBranch() branch: BranchContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('scope') scope?: string,
  ) {
    return this.reports.summary(user, branch, from, to, scope);
  }

  @Get('margins')
  margins(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext) {
    return this.reports.productMargins(user, branch);
  }
}
