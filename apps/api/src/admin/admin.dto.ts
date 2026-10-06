import { LOGIN_ID_MESSAGE, LOGIN_ID_REGEX } from '../common/login-id';
import { ArrayUnique, IsArray, IsBoolean, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength } from 'class-validator';

export class BranchDto {
  @IsString() @MinLength(2) @MaxLength(100)
  name: string;

  @IsOptional() @IsString() @MaxLength(200)
  address?: string;

  @IsOptional() @IsString() @MaxLength(40)
  phone?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true })
  activeModules?: string[];
}

export class CreateUserDto {
  @IsString() @MinLength(2) @MaxLength(100)
  fullName: string;

  @IsString() @MaxLength(120) @Matches(LOGIN_ID_REGEX, { message: LOGIN_ID_MESSAGE })
  username: string;

  @IsOptional() @IsString() @MaxLength(120)
  email?: string;

  @IsString() @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' }) @MaxLength(200)
  password: string;

  @IsUUID()
  roleId: string;

  @IsArray() @ArrayUnique() @IsUUID('all', { each: true })
  branchIds: string[];
}

export class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100)
  fullName?: string;

  @IsOptional() @IsString() @MaxLength(120)
  email?: string;

  @IsOptional() @IsUUID()
  roleId?: string;

  @IsOptional() @IsArray() @ArrayUnique() @IsUUID('all', { each: true })
  branchIds?: string[];

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class RoleDto {
  @IsString() @MinLength(2) @MaxLength(60)
  name: string;

  @IsOptional() @IsString() @MaxLength(200)
  description?: string;

  @IsArray() @ArrayUnique() @IsString({ each: true })
  permissions: string[];
}

export class BrandingDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100)
  brandName?: string;

  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Color inválido' })
  primaryColor?: string;

  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Color inválido' })
  secondaryColor?: string;
}

export class NamedDto {
  @IsString() @MinLength(1) @MaxLength(80)
  name: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class TableDto {
  @IsString() @MinLength(1) @MaxLength(40)
  name: string;

  @IsOptional() @IsString() @MaxLength(40)
  area?: string;

  @IsOptional() @IsInt() @Min(0)
  sortOrder?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class BoldSettingsDto {
  @IsBoolean()
  enabled: boolean;

  @IsOptional() @IsString() @MaxLength(200)
  identityKey?: string;

  /** Solo se envía para cambiarla; vacío conserva la actual */
  @IsOptional() @IsString() @MaxLength(300)
  secretKey?: string;
}
