import { IsBoolean } from 'class-validator';

export class UpdateInviteFeatureDto {
  @IsBoolean()
  inviteRequired!: boolean;
}
