import { PaymentMethod } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

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

/** Gasto fijo que se repite cada mes */
export class RecurringExpenseDto {
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

  /** Día del mes en que se causa (1 a 28) */
  @IsInt() @Min(1) @Max(28)
  dayOfMonth: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class RegisterRecurringDto {
  /** Mes a registrar (AAAA-MM) */
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Mes inválido' })
  month: string;

  /** Valor de este mes si cambió (por defecto el del gasto fijo) */
  @IsOptional() @IsInt() @Min(1) @Max(10_000_000_000)
  amount?: number;
}
