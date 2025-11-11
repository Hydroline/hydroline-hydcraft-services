import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
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
  @IsEmail()
  @MaxLength(254)
  @ValidateIf((dto: AuthRegisterDto) => dto.mode === 'AUTHME')
  @IsNotEmpty()
  email?: string;

  @IsString()
  @MaxLength(128)
  password!: string;

  @ValidateIf((dto: AuthRegisterDto) => dto.mode === 'AUTHME')
  @IsString()
  @MaxLength(64)
  authmeId?: string;

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
  @IsBoolean()
  rememberMe?: boolean;
}
