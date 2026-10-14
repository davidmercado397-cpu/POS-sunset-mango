import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class ReceivablePaymentDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsInt() @Min(1) @Max(1_000_000_000)
  amount: number;

  /** Fecha del pago (AAAA-MM-DD); por defecto hoy */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Fecha inválida' })
  paidAt?: string;

  @IsOptional() @IsString() @MaxLength(60)
  reference?: string;

  @IsOptional() @IsString() @MaxLength(300)
  notes?: string;
}
