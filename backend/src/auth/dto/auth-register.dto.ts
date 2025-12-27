import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class AuthRegisterDto {
  @IsString()
  @IsIn(['EMAIL', 'AUTHME'])
  mode: 'EMAIL' | 'AUTHME' = 'EMAIL';

  @ValidateIf(
    (dto: AuthRegisterDto) =>
      dto.mode === 'EMAIL' || typeof dto.email === 'string',
  )
  @IsEmail({}, { message: 'Email must be an email' })
  @MaxLength(254)
  @ValidateIf((dto: AuthRegisterDto) => dto.mode === 'AUTHME')
  @IsNotEmpty()
  email?: string;

  @IsString()
  @ValidateIf((dto: AuthRegisterDto) => dto.mode === 'EMAIL')
  @MaxLength(128)
  password!: string;

  @ValidateIf((dto: AuthRegisterDto) => dto.mode === 'AUTHME')
  @IsString()
  @MaxLength(64)
  authmeId?: string;

  @ValidateIf(
    (dto: AuthRegisterDto) => dto.mode === 'EMAIL' || dto.mode === 'AUTHME',
  )
  @IsString()
  @Length(6, 6)
  code?: string;

  @ValidateIf((dto: AuthRegisterDto) => dto.mode === 'EMAIL')
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @ValidateIf((dto: AuthRegisterDto) => dto.mode === 'EMAIL')
  @IsOptional()
  @IsString()
  @MaxLength(64)
  minecraftId?: string;

  @ValidateIf((dto: AuthRegisterDto) => dto.mode === 'EMAIL')
  @IsOptional()
  @IsString()
  @MaxLength(64)
  minecraftNick?: string;

  @IsOptional()
  @IsString()
  @Length(32, 32)
  inviteCode?: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
