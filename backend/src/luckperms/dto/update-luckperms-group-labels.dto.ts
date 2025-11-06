import { Type } from 'class-transformer';
import { IsArray, IsString, MaxLength, ValidateNested } from 'class-validator';

class LuckpermsGroupLabelEntryDto {
  @IsString()
  @MaxLength(191)
  group!: string;

  @IsString()
  @MaxLength(191)
  label!: string;
}

export class UpdateLuckpermsGroupLabelsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LuckpermsGroupLabelEntryDto)
  entries!: LuckpermsGroupLabelEntryDto[];
}
