import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { SaleItemDto } from '../sales/sales.dto';

export class PublicOrderDto {
  @IsUUID()
  branchId: string;

  @IsIn(['DELIVERY', 'PICKUP'])
  type: 'DELIVERY' | 'PICKUP';

  @IsString() @MinLength(2, { message: 'Escribe tu nombre' }) @MaxLength(80)
  customerName: string;

  @IsString() @Matches(/^[\d\s+()-]{7,20}$/, { message: 'Teléfono inválido' })
  phone: string;

  @IsOptional() @IsString() @MaxLength(200)
  address?: string;

  @IsOptional() @IsString() @MaxLength(200)
  addressNotes?: string;

  @IsOptional() @IsString() @MaxLength(300)
  notes?: string;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsOptional() @IsInt() @Min(0) @Max(10_000_000)
  payWith?: number;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => SaleItemDto)
  items: SaleItemDto[];

  /** Campo trampa contra bots: debe llegar vacío */
  @IsOptional() @IsString() @MaxLength(200)
  website?: string;
}

export class OnlineStatusDto {
  @IsIn(['ACCEPTED', 'READY', 'DISPATCHED'])
  status: 'ACCEPTED' | 'READY' | 'DISPATCHED';
}

export class ReasonDto {
  @IsString() @MinLength(3, { message: 'Escribe el motivo' }) @MaxLength(300)
  reason: string;
}

export class OnlineSettingsDto {
  @IsBoolean()
  onlineAccepting: boolean;

  @IsBoolean()
  allowDelivery: boolean;

  @IsBoolean()
  allowPickup: boolean;

  @IsInt() @Min(0) @Max(1_000_000)
  deliveryFee: number;

  @IsInt() @Min(0) @Max(10_000_000)
  minOrder: number;

  @IsOptional() @IsString() @MaxLength(300)
  onlineMessage?: string;

  @IsOptional() @IsString() @Matches(/^[\d\s+()-]{0,20}$/, { message: 'WhatsApp inválido' })
  whatsapp?: string;
}
