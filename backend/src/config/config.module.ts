import { Module, forwardRef } from '@nestjs/common';
import { ConfigController } from './config.controller';
import { ConfigService } from './config.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ConfigBootstrap } from './config.bootstrap';

@Module({
  imports: [PrismaModule, forwardRef(() => AuthModule)],
  controllers: [ConfigController],
  providers: [ConfigService, ConfigBootstrap],
  exports: [ConfigService],
})
export class ConfigModule {}
