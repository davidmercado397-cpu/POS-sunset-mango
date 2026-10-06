import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ImageUpload } from '../common/image-upload';
import { CategoryDto, ProductDto } from './catalog.dto';
import { CatalogService } from './catalog.service';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('categories')
  @RequirePermissions('catalog.view')
  categories(@CurrentUser() user: AuthUser) {
    return this.catalog.categories(user);
  }

  @Post('categories')
  @RequirePermissions('catalog.manage')
  createCategory(@CurrentUser() user: AuthUser, @Body() dto: CategoryDto) {
    return this.catalog.saveCategory(user, dto);
  }

  @Put('categories/:id')
  @RequirePermissions('catalog.manage')
  updateCategory(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CategoryDto) {
    return this.catalog.saveCategory(user, dto, id);
  }

  @Delete('categories/:id')
  @RequirePermissions('catalog.manage')
  @HttpCode(204)
  deleteCategory(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.deleteCategory(user, id);
  }

  @Get('products')
  @RequirePermissions('catalog.view')
  products(@CurrentUser() user: AuthUser) {
    return this.catalog.products(user);
  }

  @Get('products/:id')
  @RequirePermissions('catalog.view')
  product(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.product(user, id);
  }

  @Post('products')
  @RequirePermissions('catalog.manage')
  createProduct(@CurrentUser() user: AuthUser, @Body() dto: ProductDto) {
    return this.catalog.saveProduct(user, dto);
  }

  @Put('products/:id')
  @RequirePermissions('catalog.manage')
  updateProduct(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProductDto) {
    return this.catalog.saveProduct(user, dto, id);
  }

  @Delete('products/:id')
  @RequirePermissions('catalog.manage')
  @HttpCode(204)
  deleteProduct(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.deleteProduct(user, id);
  }

  @Post('products/:id/image')
  @RequirePermissions('catalog.manage')
  @UseInterceptors(ImageUpload())
  uploadImage(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File) {
    return this.catalog.uploadImage(user, id, file);
  }

  @Delete('products/:id/image')
  @RequirePermissions('catalog.manage')
  removeImage(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.removeImage(user, id);
  }
}
