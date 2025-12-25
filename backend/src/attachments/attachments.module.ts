import { Module, forwardRef } from '@nestjs/common';
import { AttachmentsService } from './attachments.service';
import { AttachmentsController } from './attachments.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { attachmentsStorageProvider } from './storage/attachments-storage.provider';

@Module({
  imports: [PrismaModule, forwardRef(() => AuthModule)],
  controllers: [AttachmentsController],
  providers: [attachmentsStorageProvider, AttachmentsService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
