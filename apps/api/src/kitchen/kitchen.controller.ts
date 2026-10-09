import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { KitchenStatus } from '@prisma/client';
import { IsEnum, IsIn } from 'class-validator';
import { BranchContext } from '../common/auth-user';
import { CurrentBranch, RequireModule } from '../common/decorators/branch.decorator';
import { RequireAnyPermission } from '../common/decorators/permissions.decorator';
import { KitchenService } from './kitchen.service';

class StatusDto {
  @IsEnum(KitchenStatus)
  status: KitchenStatus;
}

class CloseDto {
  @IsIn(['previous', 'all'])
  scope: 'previous' | 'all';
}

@Controller('kitchen')
@RequireModule('kitchen')
@RequireAnyPermission('kitchen.view', 'pos.sell')
export class KitchenController {
  constructor(private readonly kitchen: KitchenService) {}

  @Get('tickets')
  list(@CurrentBranch() branch: BranchContext) {
    return this.kitchen.list(branch);
  }

  @Patch('tickets/:id')
  setStatus(@CurrentBranch() branch: BranchContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StatusDto) {
    return this.kitchen.setStatus(branch, id, dto.status);
  }

  @Post('tickets/close')
  @HttpCode(200)
  close(@CurrentBranch() branch: BranchContext, @Body() dto: CloseDto) {
    return this.kitchen.closeOpen(branch, dto.scope);
  }
}
