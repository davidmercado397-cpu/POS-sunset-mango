import { PaymentMethod } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class AdminExpenseDto {
  /** Vacío = gasto general del negocio */
  @IsOptional() @IsUUID()
  branchId?: string | null;

  @IsOptional() @IsUUID()
  categoryId?: string | null;

  @IsString() @MinLength(2, { message: 'Describe el gasto' }) @MaxLength(300)
  description: string;

  @IsInt() @Min(1) @Max(10_000_000_000)
  amount: number;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  /** Fecha contable (YYYY-MM-DD) */
  @IsDateString()
  date: string;

  @IsOptional() @IsString() @MaxLength(80)
  reference?: string;
}
