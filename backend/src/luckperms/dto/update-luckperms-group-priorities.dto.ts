import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsString, ValidateNested } from 'class-validator';

class LuckpermsGroupPriorityEntryDto {
  @IsString()
  group!: string;

  @Type(() => Number)
  @IsNumber()
  priority!: number;
}

export class UpdateLuckpermsGroupPrioritiesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LuckpermsGroupPriorityEntryDto)
  entries!: LuckpermsGroupPriorityEntryDto[];
}
