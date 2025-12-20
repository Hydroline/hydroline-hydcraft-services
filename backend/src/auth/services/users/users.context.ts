import { Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { AuthmeService } from '../../../authme/authme.service';
import type { AuthmeBindingService } from '../../../authme/authme-binding.service';
import type { LuckpermsService } from '../../../luckperms/luckperms.service';
import type { AuthmeLookupService } from '../../../authme/authme-lookup.service';
import type { LuckpermsLookupService } from '../../../luckperms/luckperms-lookup.service';
import type { IpLocationService } from '../../../lib/ip2region/ip-location.service';
import type { AdminAuditService } from '../admin-audit.service';
import type { MailService } from '../../../mail/mail.service';
import type { ConfigService } from '../../../config/config.service';

export type PrismaClientOrTx = PrismaService | Prisma.TransactionClient;

export interface UsersServiceContext {
  prisma: PrismaService;
  authmeService: AuthmeService;
  authmeBindingService: AuthmeBindingService;
  luckpermsService: LuckpermsService;
  authmeLookupService: AuthmeLookupService;
  luckpermsLookupService: LuckpermsLookupService;
  ipLocationService: IpLocationService;
  adminAuditService: AdminAuditService;
  mailService: MailService;
  configService: ConfigService;
  logger: Logger;
  piicPrefix: string;
  verificationTtlMs: number;
  emailVerificationIdentifierPrefix: string;
  phoneVerificationIdentifierPrefix: string;
}
