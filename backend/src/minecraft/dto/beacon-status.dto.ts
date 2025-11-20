import { IsOptional, IsString } from 'class-validator';

export class BeaconStatusQueryDto {
  @IsOptional()
  @IsString()
  scope?: string;
}
