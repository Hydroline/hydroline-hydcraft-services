import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class McsmCommandDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  command!: string;
}
