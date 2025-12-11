import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { CompanyService } from './company.service';
import { CompanyController } from './company.controller';
import { CompanyAdminController } from './company-admin.controller';

@Module({
  imports: [PrismaModule, AuthModule, WorkflowModule],
  providers: [CompanyService],
  controllers: [CompanyController, CompanyAdminController],
  exports: [CompanyService],
})
export class CompanyModule {}
