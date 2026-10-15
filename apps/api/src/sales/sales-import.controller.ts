import { Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuthUser, BranchContext } from '../common/auth-user';
import { CurrentBranch, RequireModule } from '../common/decorators/branch.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { SalesImportService } from './sales-import.service';

/** Carga de ventas por archivo de Excel en la sede seleccionada. */
@Controller('sales-import')
@RequireModule('pos')
@RequirePermissions('sales.import')
export class SalesImportController {
  constructor(private readonly imports: SalesImportService) {}

  @Get('template')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="plantilla-ventas.xlsx"')
  async template(@CurrentUser() user: AuthUser) {
    return new StreamableFile(await this.imports.template(user));
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  upload(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @UploadedFile() file: Express.Multer.File) {
    return this.imports.import(user, branch, file);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext) {
    return this.imports.list(user, branch);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @CurrentBranch() branch: BranchContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.imports.remove(user, branch, id);
  }
}
