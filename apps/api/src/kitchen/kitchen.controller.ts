import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { KitchenStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { BranchContext } from '../common/auth-user';
import { CurrentBranch, RequireModule } from '../common/decorators/branch.decorator';
import { RequireAnyPermission } from '../common/decorators/permissions.decorator';
import { KitchenService } from './kitchen.service';

class StatusDto {
  @IsEnum(KitchenStatus)
  status: KitchenStatus;
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
}
