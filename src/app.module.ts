import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from './config/config.module';
import { AppLoggerModule } from './observability/logger.module';

@Module({
  imports: [HealthModule, PrismaModule, ConfigModule, AppLoggerModule], // ← the CLI added this
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
