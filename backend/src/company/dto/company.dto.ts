import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  CompanyCategory,
  CompanyStatus,
  CompanyVisibility,
} from '@prisma/client';

export class CompanyRecommendationsQueryDto {
  @IsOptional()
  @IsString()
  kind?: 'recent' | 'active';

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(50)
  limit?: number;
}

export class CreateCompanyApplicationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  summary?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  typeCode?: string;

  @ValidateIf((o) => !o.typeCode)
  @IsOptional()
  @IsUUID()
  typeId?: string;

  @IsOptional()
  @IsString()
  industryCode?: string;

  @ValidateIf((o) => !o.industryCode)
  @IsOptional()
  @IsUUID()
  industryId?: string;

  @IsOptional()
  @IsEnum(CompanyCategory)
  category?: CompanyCategory;

  @IsOptional()
  @IsBoolean()
  isIndividualBusiness?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  legalRepresentativeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  legalRepresentativeCode?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactPhone?: string;

  @IsOptional()
  @IsString()
  contactAddress?: string;

  @IsOptional()
  @IsString()
  homepageUrl?: string;

  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  unifiedSocialCreditCode?: string;

  @IsOptional()
  @IsString()
  workflowCode?: string;

  @IsOptional()
  @IsObject()
  extra?: Record<string, unknown>;
}

export class UpdateCompanyProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  summary?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  contactAddress?: string;

  @IsOptional()
  @IsString()
  homepageUrl?: string;

  @IsOptional()
  @IsString()
  industryId?: string;

  @IsOptional()
  @IsString()
  industryCode?: string;

  @IsOptional()
  @IsObject()
  extra?: Record<string, unknown>;
}

export class AdminUpdateCompanyDto extends UpdateCompanyProfileDto {
  @IsOptional()
  @IsEnum(CompanyStatus)
  status?: CompanyStatus;

  @IsOptional()
  @IsEnum(CompanyVisibility)
  visibility?: CompanyVisibility;

  @IsOptional()
  @IsBoolean()
  highlighted?: boolean;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  recommendationScore?: number;

  @IsOptional()
  @IsUUID()
  typeId?: string;

  @IsOptional()
  @IsString()
  typeCode?: string;
}

export class AdminCompanyListQueryDto {
  @IsOptional()
  @IsEnum(CompanyStatus)
  status?: CompanyStatus;

  @IsOptional()
  @IsUUID()
  typeId?: string;

  @IsOptional()
  @IsUUID()
  industryId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(5)
  @Max(50)
  pageSize?: number;
}

export class CompanyActionDto {
  @IsString()
  actionKey!: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
