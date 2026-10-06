import { LOGIN_ID_MESSAGE, LOGIN_ID_REGEX } from '../common/login-id';
import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';

export class TenantAdminDto {
  @IsString() @MinLength(2) @MaxLength(100)
  fullName: string;

  @IsString() @MaxLength(120) @Matches(LOGIN_ID_REGEX, { message: LOGIN_ID_MESSAGE })
  username: string;

  @IsString() @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' }) @MaxLength(200)
  password: string;
}

export class CreateTenantDto {
  @IsString() @MinLength(2) @MaxLength(100)
  name: string;

  @IsOptional() @IsString() @Matches(/^[a-z0-9-]{2,50}$/, { message: 'Identificador inválido (minúsculas, números y guiones)' })
  slug?: string;

  @IsArray() @ArrayUnique() @IsString({ each: true })
  enabledModules: string[];

  @IsOptional() @IsString() @MaxLength(100)
  branchName?: string;

  @ValidateNested() @Type(() => TenantAdminDto)
  admin: TenantAdminDto;
}

export class UpdateTenantDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100)
  name?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true })
  enabledModules?: string[];
}

export class ResetPasswordDto {
  @IsString() @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' }) @MaxLength(200)
  password: string;
}
