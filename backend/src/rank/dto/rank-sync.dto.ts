import { IsOptional, IsUUID } from 'class-validator';

export class RankSyncRequestDto {
  @IsOptional()
  @IsUUID()
  serverId?: string;
}
