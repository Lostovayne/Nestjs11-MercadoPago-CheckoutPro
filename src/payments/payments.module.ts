import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderItem } from './entities/order-item.entity';
import { Order } from './entities/order.entity';
import { Payment } from './entities/payment.entity';
import { MercadoPagoService } from './mercadopago.service';
import { PaymentsController } from './payments.controller';
import { WebhookValidatorService } from './webhook-validator.service';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, Order, OrderItem])],
  controllers: [PaymentsController],
  providers: [MercadoPagoService, WebhookValidatorService],
  exports: [MercadoPagoService, WebhookValidatorService],
})
export class PaymentsModule {}
