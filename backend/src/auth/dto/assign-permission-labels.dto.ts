import { IsArray, IsOptional, IsString } from 'class-validator';

export class AssignPermissionLabelsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labelKeys?: string[];
}
