import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class SelfAssignPermissionsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  permissionKeys!: string[];
}
