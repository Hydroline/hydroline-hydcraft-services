import { IsString, Length, Matches, MinLength } from 'class-validator';

export class ChangePasswordWithCodeDto {
  @IsString()
  @Length(6, 6)
  @Matches(/^[0-9]+$/)
  code!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
