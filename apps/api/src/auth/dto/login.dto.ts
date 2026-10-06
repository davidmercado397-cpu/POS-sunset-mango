import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  username: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password: string;
}
