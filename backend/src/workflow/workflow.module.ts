import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { WorkflowService } from './workflow.service';
import { WorkflowAdminController } from './workflow-admin.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [WorkflowService],
  controllers: [WorkflowAdminController],
  exports: [WorkflowService],
})
export class WorkflowModule {}
