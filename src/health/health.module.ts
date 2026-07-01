import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  controllers: [HealthController], // ← added by 'generate controller'
  providers: [HealthService], // ← added by 'generate service'
})
export class HealthModule {}
