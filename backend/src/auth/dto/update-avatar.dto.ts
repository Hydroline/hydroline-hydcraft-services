import { ApiProperty } from '@nestjs/swagger';

export class UpdateAvatarResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ nullable: true })
  avatarAttachmentId!: string | null;

  @ApiProperty({ nullable: true })
  avatarUrl!: string | null;
}
