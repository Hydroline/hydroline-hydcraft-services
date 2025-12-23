import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { ConfigModule } from '../config/config.module';
import { CompanyService } from './company.service';
import { CompanyController } from './company.controller';
import { CompanyAdminController } from './company-admin.controller';
import { CompanyConfigAdminController } from './company-config-admin.controller';
import { CompanyApplicationAdminController } from './company-application-admin.controller';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AttachmentsModule,
    WorkflowModule,
    ConfigModule,
  ],
  providers: [CompanyService],
  controllers: [
    CompanyController,
    CompanyAdminController,
    CompanyConfigAdminController,
    CompanyApplicationAdminController,
  ],
  exports: [CompanyService],
})
export class CompanyModule {}
