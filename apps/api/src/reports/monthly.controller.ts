import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AuthUser, BranchContext } from '../common/auth-user';
import { CurrentBranch, RequireModule } from '../common/decorators/branch.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireAnyPermission, RequirePermissions } from '../common/decorators/permissions.decorator';
import { MonthlyService } from './monthly.service';

class CloseMonthDto {
  @IsInt() @Min(2020) @Max(2100)
  year: number;

  @IsInt() @Min(1) @Max(12)
  month: number;

  @IsOptional() @IsString() @MaxLength(1000)
  notes?: string;
}

/** Cierre mensual de caja por sede. */
@Controller('cash/monthly')
@RequireModule('cash')
export class MonthlyController {
  constructor(private readonly monthly: MonthlyService) {}

  @Get()
  @RequireAnyPermission('cash.monthly', 'cash.view')
  get(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Query('year') year: string, @Query('month') month: string) {
    return this.monthly.get(user, branch, Number(year), Number(month));
  }

  @Get('history')
  @RequireAnyPermission('cash.monthly', 'cash.view')
  history(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext) {
    return this.monthly.history(user, branch);
  }

  @Post('close')
  @RequirePermissions('cash.monthly')
  close(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Body() dto: CloseMonthDto) {
    return this.monthly.close(user, branch, dto.year, dto.month, dto.notes);
  }
}
