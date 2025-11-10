import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class AuthLoginDto {
  @IsString()
  @IsIn(['EMAIL', 'AUTHME'])
  mode: 'EMAIL' | 'AUTHME' = 'EMAIL';

  @ValidateIf((dto: AuthLoginDto) => dto.mode === 'EMAIL')
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ValidateIf((dto: AuthLoginDto) => dto.mode === 'AUTHME')
  @IsString()
  @MaxLength(64)
  authmeId?: string;

  @IsString()
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
