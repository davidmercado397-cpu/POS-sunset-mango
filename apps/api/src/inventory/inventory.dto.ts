import { InventoryItemType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';

export const UNITS = ['und', 'g', 'kg', 'ml', 'l', 'lb', 'oz', 'porcion'] as const;

export class InventoryItemDto {
  @IsString() @MinLength(1) @MaxLength(80)
  name: string;

  @IsEnum(InventoryItemType)
  type: InventoryItemType;

  @IsIn(UNITS as unknown as string[])
  unit: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) @Max(1_000_000_000)
  minStock?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class StockLineDto {
  @IsUUID()
  itemId: string;

  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) @Max(1_000_000_000)
  quantity: number;

  /** Costo unitario (COP) para entradas */
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1_000_000_000)
  unitCost?: number;
}

export class AdjustDto {
  /** COUNT: conteo físico (fija la existencia real) · WASTE: merma · IN: entrada manual */
  @IsIn(['COUNT', 'WASTE', 'IN'])
  mode: 'COUNT' | 'WASTE' | 'IN';

  @IsOptional() @IsString() @MaxLength(300)
  note?: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => StockLineDto)
  lines: StockLineDto[];
}

export class SupplierDto {
  @IsString() @MinLength(2) @MaxLength(100)
  name: string;

  @IsOptional() @IsString() @MaxLength(30)
  nit?: string;

  @IsOptional() @IsString() @MaxLength(40)
  phone?: string;

  @IsOptional() @IsString() @MaxLength(120)
  email?: string;

  @IsOptional() @IsString() @MaxLength(300)
  notes?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class PurchaseLineDto {
  @IsUUID()
  itemId: string;

  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) @Max(1_000_000_000)
  quantity: number;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1_000_000_000)
  unitCost: number;
}

export class PurchaseDto {
  @IsOptional() @IsUUID()
  supplierId?: string;

  @IsOptional() @IsString() @MaxLength(60)
  invoiceNumber?: string;

  @IsOptional() @IsDateString()
  date?: string;

  @IsOptional() @IsString() @MaxLength(300)
  notes?: string;

  @IsOptional() @IsBoolean()
  paidFromCash?: boolean;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(300) @ValidateNested({ each: true }) @Type(() => PurchaseLineDto)
  items: PurchaseLineDto[];
}

export class TransferLineDto {
  @IsUUID()
  itemId: string;

  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) @Max(1_000_000_000)
  quantity: number;
}

export class TransferDto {
  @IsUUID()
  toBranchId: string;

  @IsOptional() @IsString() @MaxLength(300)
  notes?: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(300) @ValidateNested({ each: true }) @Type(() => TransferLineDto)
  items: TransferLineDto[];
}

export class EditMovementDto {
  /** Cantidad corregida (positiva). Para mermas es la cantidad que salió. */
  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) @Max(1_000_000_000)
  quantity?: number;

  /** Costo unitario corregido (solo entradas manuales) */
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1_000_000_000)
  unitCost?: number;

  @IsString() @MinLength(3, { message: 'Escribe el motivo de la corrección' }) @MaxLength(300)
  reason: string;
}

export class SetCostDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1_000_000_000)
  avgCost: number;

  @IsOptional() @IsString() @MaxLength(300)
  reason?: string;
}
