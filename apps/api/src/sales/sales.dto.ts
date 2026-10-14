import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';

export class SaleItemDto {
  @IsUUID()
  productId: string;

  @IsInt() @Min(1) @Max(999)
  quantity: number;

  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true })
  optionIds?: string[];

  @IsOptional() @IsString() @MaxLength(200)
  notes?: string;
}

export class PaymentDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsInt() @Min(1) @Max(1_000_000_000)
  amount: number;

  /** Solo efectivo: dinero entregado por el cliente */
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000_000)
  received?: number;

  @IsOptional() @IsString() @MaxLength(60)
  reference?: string;
}

/** Venta a crédito (fiado): lo que no se paga ahora queda como cuenta por cobrar */
export class CreditDto {
  @IsString() @MinLength(2, { message: 'Escribe el nombre de quien debe' }) @MaxLength(100)
  debtorName: string;

  @IsOptional() @IsString() @MaxLength(300)
  notes?: string;
}

export class PayDto {
  /** Puede ir vacío solo en una venta a crédito sin abono */
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => PaymentDto)
  payments: PaymentDto[] = [];

  @IsOptional() @ValidateNested() @Type(() => CreditDto)
  credit?: CreditDto;

  @IsOptional() @IsInt() @Min(0) @Max(100_000_000)
  tipAmount?: number;

  @IsOptional() @IsEnum(PaymentMethod)
  tipMethod?: PaymentMethod;

  /** Descuento en dinero sobre el valor de los productos */
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000_000)
  discount?: number;

  @IsOptional() @IsString() @MaxLength(120)
  discountNote?: string;
}

export class CreateSaleDto extends PayDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => SaleItemDto)
  items: SaleItemDto[];

  @IsOptional() @IsString() @MaxLength(80)
  customerName?: string;

  @IsOptional() @IsString() @MaxLength(300)
  notes?: string;
}

export class OpenOrderDto {
  @IsOptional() @IsUUID()
  tableId?: string;

  @IsOptional() @IsString() @MaxLength(80)
  customerName?: string;

  @IsOptional() @IsString() @MaxLength(300)
  notes?: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => SaleItemDto)
  items: SaleItemDto[];
}

export class AddItemsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => SaleItemDto)
  items: SaleItemDto[];
}

export class VoidDto {
  @IsString() @MinLength(3, { message: 'Escribe el motivo de la anulación' }) @MaxLength(300)
  reason: string;
}
