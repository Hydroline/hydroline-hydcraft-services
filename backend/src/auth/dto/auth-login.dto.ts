import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class AuthLoginDto {
  @IsString()
  @IsIn(['EMAIL', 'AUTHME', 'EMAIL_CODE'])
  mode: 'EMAIL' | 'AUTHME' | 'EMAIL_CODE' = 'EMAIL';

  @ValidateIf((dto: AuthLoginDto) => dto.mode === 'EMAIL')
  @IsEmail({}, { message: 'Email must be an email' })
  @MaxLength(254)
  email?: string;

  @ValidateIf((dto: AuthLoginDto) => dto.mode === 'AUTHME')
  @IsString()
  @MaxLength(64)
  authmeId?: string;

  @ValidateIf((dto: AuthLoginDto) => dto.mode !== 'EMAIL_CODE')
  @IsString()
  @ValidateIf((dto: AuthLoginDto) => dto.mode === 'EMAIL')
  @MaxLength(128)
  password?: string;

  @ValidateIf((dto: AuthLoginDto) => dto.mode === 'EMAIL_CODE')
  @IsString()
  @Length(6, 6)
  code?: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
