import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';

export class CategoryDto {
  @IsString() @MinLength(1) @MaxLength(60)
  name: string;

  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;

  @IsOptional() @IsInt() @Min(0)
  sortOrder?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class RecipeLineDto {
  @IsUUID()
  inventoryItemId: string;

  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) @Max(1_000_000)
  quantity: number;
}

export class ModifierOptionDto {
  @IsOptional() @IsUUID()
  id?: string;

  @IsString() @MinLength(1) @MaxLength(60)
  name: string;

  @IsInt() @Min(-10_000_000) @Max(10_000_000)
  priceDelta: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => RecipeLineDto)
  recipe?: RecipeLineDto[];

  @IsOptional() @IsBoolean()
  isCombo?: boolean;

  /** Productos que incluye el combo */
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => ComboItemDto)
  comboItems?: ComboItemDto[];
}

export class ModifierGroupDto {
  @IsOptional() @IsUUID()
  id?: string;

  @IsString() @MinLength(1) @MaxLength(60)
  name: string;

  @IsInt() @Min(0) @Max(50)
  minSelect: number;

  @IsInt() @Min(1) @Max(50)
  maxSelect: number;

  /** Permite repetir la misma opción (ej. doble topping) */
  @IsOptional() @IsBoolean()
  allowRepeat?: boolean;

  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => ModifierOptionDto)
  options: ModifierOptionDto[];
}

export class ComboItemDto {
  @IsUUID()
  productId: string;

  @IsInt() @Min(1) @Max(50)
  quantity: number;
}

export class ProductDto {
  @IsString() @MinLength(1) @MaxLength(80)
  name: string;

  @IsOptional() @IsString() @MaxLength(300)
  description?: string;

  @IsInt() @Min(0) @Max(100_000_000)
  price: number;

  @IsOptional() @IsUUID()
  categoryId?: string | null;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsBoolean()
  sendToKitchen?: boolean;

  @IsOptional() @IsInt() @Min(0)
  sortOrder?: number;

  @IsOptional() @IsArray() @IsUUID('all', { each: true })
  disabledBranchIds?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => ModifierGroupDto)
  modifierGroups?: ModifierGroupDto[];

  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => RecipeLineDto)
  recipe?: RecipeLineDto[];

  @IsOptional() @IsBoolean()
  isCombo?: boolean;

  /** Productos que incluye el combo */
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => ComboItemDto)
  comboItems?: ComboItemDto[];
}
