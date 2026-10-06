import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SuperAdminOnly } from '../common/decorators/permissions.decorator';
import { CreateTenantDto, ResetPasswordDto, UpdateTenantDto } from './platform.dto';
import { PlatformService } from './platform.service';

@Controller('platform')
@SuperAdminOnly()
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get('modules')
  modules() {
    return this.platform.modules();
  }

  @Get('tenants')
  list() {
    return this.platform.list();
  }

  @Get('tenants/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.get(id);
  }

  @Post('tenants')
  create(@Body() dto: CreateTenantDto, @CurrentUser() user: AuthUser) {
    return this.platform.create(dto, user);
  }

  @Patch('tenants/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTenantDto, @CurrentUser() user: AuthUser) {
    return this.platform.update(id, dto, user);
  }

  @Post('tenants/:id/users/:userId/reset-password')
  @HttpCode(204)
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.platform.resetUserPassword(id, userId, dto.password, user);
  }
}
