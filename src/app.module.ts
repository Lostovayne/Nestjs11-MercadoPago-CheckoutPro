import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { PaymentsModule } from './payments/payments.module';

@Module({
  imports: [ConfigModule, DatabaseModule, PaymentsModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
