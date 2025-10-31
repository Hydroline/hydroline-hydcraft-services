import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SignUpDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  minecraftId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  minecraftNick?: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
