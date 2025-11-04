import { IsBoolean } from 'class-validator';

export class UpdateAuthmeFeatureDto {
  @IsBoolean()
  emailVerificationEnabled!: boolean;

  @IsBoolean()
  authmeRegisterEnabled!: boolean;

  @IsBoolean()
  authmeLoginEnabled!: boolean;

  @IsBoolean()
  authmeBindingEnabled!: boolean;
}
