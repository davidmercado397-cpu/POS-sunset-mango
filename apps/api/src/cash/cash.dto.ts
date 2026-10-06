import { CashMovementType, PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class OpenCashDto {
  @IsInt() @Min(0) @Max(1_000_000_000)
  openingAmount: number;

  /** Conteo por denominación { "50000": 2, "1000": 5 } */
  @IsOptional() @IsObject()
  openingCount?: Record<string, number>;

  @IsOptional() @IsString() @MaxLength(500)
  notes?: string;
}

export class CashMovementDto {
  @IsEnum(CashMovementType)
  type: CashMovementType;

  /** Solo para gastos: efectivo de la caja o transferencia */
  @IsOptional() @IsIn(['CASH', 'TRANSFER'])
  method?: Extract<PaymentMethod, 'CASH' | 'TRANSFER'>;

  @IsInt() @Min(1) @Max(1_000_000_000)
  amount: number;

  @IsOptional() @IsUUID()
  categoryId?: string;

  @IsOptional() @IsString() @MaxLength(300)
  description?: string;
}

export class CountedDto {
  @IsInt() @Min(0) @Max(1_000_000_000)
  CASH: number;

  @IsInt() @Min(0) @Max(1_000_000_000)
  TRANSFER: number;

  @IsInt() @Min(0) @Max(1_000_000_000)
  QR_BOLD: number;
}

export class CloseCashDto {
  @ValidateNested() @Type(() => CountedDto)
  counted: CountedDto;

  @IsOptional() @IsObject()
  closingCount?: Record<string, number>;

  @IsOptional() @IsString() @MaxLength(1000)
  notes?: string;
}
