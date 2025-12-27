import { IsOptional, IsString } from 'class-validator';

export class AuthmeUnbindDto {
  @IsOptional()
  @IsString()
  username?: string;

  @IsString()
  password!: string;
}
