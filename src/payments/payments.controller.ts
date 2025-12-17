import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Res,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { CreateOrderDto } from './dto/create-order.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { WebhookNotificationDto } from './dto/webhook-notification.dto';
import { MercadoPagoService } from './mercadopago.service';
import { WebhookValidatorService } from './webhook-validator.service';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly mercadoPagoService: MercadoPagoService,
    private readonly webhookValidator: WebhookValidatorService,
  ) {}

  /**
   * Crea una preferencia de pago
   */
  @Post('create-preference')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async createPaymentPreference(@Body() createOrderDto: CreateOrderDto) {
    this.logger.log('Creando preferencia de pago');
    return await this.mercadoPagoService.createPaymentPreference(
      createOrderDto,
    );
  }

  /**
   * Webhook para recibir notificaciones de Mercado Pago
   * IMPORTANTE: Verificar la firma del webhook para seguridad
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() notification: WebhookNotificationDto,
    @Headers('x-signature') signature: string,
    @Headers('x-request-id') requestId: string,
  ) {
    this.logger.log(
      `Webhook recibido - ID: ${notification.id}, Tipo: ${notification.type}, Acción: ${notification.action}`,
    );

    try {
      // Validar la firma del webhook si está disponible
      if (signature && requestId) {
        const dataId = notification.data?.id || notification.id;
        const isValid = this.webhookValidator.validateWebhookSignature(
          signature,
          requestId,
          dataId,
        );

        if (!isValid) {
          this.logger.error(
            'Firma de webhook inválida - Posible intento de fraude',
          );
          throw new BadRequestException('Firma de webhook inválida');
        }
      } else {
        this.logger.warn(
          'Webhook recibido sin firma - Considere configurar MERCADOPAGO_WEBHOOK_SECRET',
        );
      }

      // Procesar la notificación según el tipo
      if (notification.type === 'payment') {
        const paymentId = notification.data.id;
        await this.mercadoPagoService.processWebhookNotification(
          paymentId,
          notification.type,
        );
      } else if (notification.type === 'merchant_order') {
        this.logger.log(
          `Notificación de merchant_order: ${notification.data.id}`,
        );
      }

      return { received: true, timestamp: new Date().toISOString() };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Error desconocido';
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        `Error al procesar webhook: ${errorMessage}`,
        errorStack,
      );

      // Devolver 200 incluso en caso de error para evitar reintentos infinitos
      // pero loguear el error para investigación
      return {
        received: true,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Endpoint de callback para cuando el usuario retorna del checkout de Mercado Pago
   * Este endpoint maneja el redirect después de un pago exitoso
   */
  @Get('callback/success')
  async handleSuccessCallback(
    @Query('collection_id') collectionId: string,
    @Query('collection_status') collectionStatus: string,
    @Query('payment_id') paymentId: string,
    @Query('status') status: string,
    @Query('external_reference') externalReference: string,
    @Query('payment_type') paymentType: string,
    @Query('merchant_order_id') merchantOrderId: string,
    @Query('preference_id') preferenceId: string,
    @Query('site_id') siteId: string,
    @Query('processing_mode') processingMode: string,
    @Query('merchant_account_id') merchantAccountId: string,
    @Res() res: Response,
  ) {
    this.logger.log(
      `Callback de éxito recibido - Payment ID: ${paymentId}, Status: ${status}, Order: ${externalReference}`,
    );

    try {
      // Verificar el pago en Mercado Pago para asegurar su validez
      if (paymentId) {
        await this.mercadoPagoService.verifyPayment(paymentId);
      }

      // Obtener el estado actualizado de la orden
      const orderStatus =
        await this.mercadoPagoService.getOrderStatus(externalReference);

      // Redireccionar al frontend con la información
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      const redirectUrl = `${frontendUrl}/payment/success?order_id=${externalReference}&payment_id=${paymentId}&status=${orderStatus.status}`;

      return res.redirect(redirectUrl);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Error desconocido';
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        `Error en callback de éxito: ${errorMessage}`,
        errorStack,
      );

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      const redirectUrl = `${frontendUrl}/payment/error?message=${encodeURIComponent(errorMessage)}`;

      return res.redirect(redirectUrl);
    }
  }

  /**
   * Endpoint de callback para pagos fallidos
   */
  @Get('callback/failure')
  async handleFailureCallback(
    @Query('collection_id') collectionId: string,
    @Query('collection_status') collectionStatus: string,
    @Query('payment_id') paymentId: string,
    @Query('status') status: string,
    @Query('external_reference') externalReference: string,
    @Query('payment_type') paymentType: string,
    @Query('merchant_order_id') merchantOrderId: string,
    @Query('preference_id') preferenceId: string,
    @Res() res: Response,
  ) {
    this.logger.log(
      `Callback de fallo recibido - Payment ID: ${paymentId}, Status: ${status}, Order: ${externalReference}`,
    );

    try {
      if (paymentId) {
        await this.mercadoPagoService.verifyPayment(paymentId);
      }

      const orderStatus =
        await this.mercadoPagoService.getOrderStatus(externalReference);

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      const redirectUrl = `${frontendUrl}/payment/failure?order_id=${externalReference}&status=${orderStatus.status}&message=${encodeURIComponent(orderStatus.message)}`;

      return res.redirect(redirectUrl);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Error desconocido';
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        `Error en callback de fallo: ${errorMessage}`,
        errorStack,
      );

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      const redirectUrl = `${frontendUrl}/payment/error?message=${encodeURIComponent(errorMessage)}`;

      return res.redirect(redirectUrl);
    }
  }

  /**
   * Endpoint de callback para pagos pendientes
   */
  @Get('callback/pending')
  async handlePendingCallback(
    @Query('collection_id') collectionId: string,
    @Query('collection_status') collectionStatus: string,
    @Query('payment_id') paymentId: string,
    @Query('status') status: string,
    @Query('external_reference') externalReference: string,
    @Query('payment_type') paymentType: string,
    @Query('merchant_order_id') merchantOrderId: string,
    @Query('preference_id') preferenceId: string,
    @Res() res: Response,
  ) {
    this.logger.log(
      `Callback de pendiente recibido - Payment ID: ${paymentId}, Status: ${status}, Order: ${externalReference}`,
    );

    try {
      if (paymentId) {
        await this.mercadoPagoService.verifyPayment(paymentId);
      }

      const orderStatus =
        await this.mercadoPagoService.getOrderStatus(externalReference);

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      const redirectUrl = `${frontendUrl}/payment/pending?order_id=${externalReference}&payment_id=${paymentId}&status=${orderStatus.status}`;

      return res.redirect(redirectUrl);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Error desconocido';
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        `Error en callback de pendiente: ${errorMessage}`,
        errorStack,
      );

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      const redirectUrl = `${frontendUrl}/payment/error?message=${encodeURIComponent(errorMessage)}`;

      return res.redirect(redirectUrl);
    }
  }

  /**
   * Verifica el estado de un pago específico
   */
  @Get('verify/:paymentId')
  async verifyPayment(@Param('paymentId') paymentId: string) {
    this.logger.log(`Verificando pago: ${paymentId}`);
    return await this.mercadoPagoService.verifyPayment(paymentId);
  }

  /**
   * Obtiene información completa de una orden
   */
  @Get('order/:orderId')
  async getOrder(@Param('orderId') orderId: string) {
    this.logger.log(`Obteniendo orden: ${orderId}`);
    return await this.mercadoPagoService.getOrder(orderId);
  }

  /**
   * Obtiene el estado detallado de una orden
   */
  @Get('order/:orderId/status')
  async getOrderStatus(@Param('orderId') orderId: string) {
    this.logger.log(`Obteniendo estado de orden: ${orderId}`);
    return await this.mercadoPagoService.getOrderStatus(orderId);
  }

  /**
   * Obtiene todos los pagos de una orden
   */
  @Get('order/:orderId/payments')
  async getOrderPayments(@Param('orderId') orderId: string) {
    this.logger.log(`Obteniendo pagos de orden: ${orderId}`);
    return await this.mercadoPagoService.getOrderPayments(orderId);
  }

  /**
   * Endpoint para verificar el estado de un pago usando query params
   */
  @Get('verify')
  @UsePipes(new ValidationPipe({ transform: true }))
  async verifyPaymentQuery(@Query() query: VerifyPaymentDto) {
    this.logger.log(`Verificando pago desde query: ${query.paymentId}`);
    return await this.mercadoPagoService.verifyPayment(query.paymentId);
  }

  /**
   * Cancela una orden
   */
  @Post('order/:orderId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelOrder(
    @Param('orderId') orderId: string,
    @Body('reason') reason?: string,
  ) {
    this.logger.log(`Cancelando orden: ${orderId}`);
    return await this.mercadoPagoService.cancelOrder(orderId, reason);
  }

  /**
   * Procesa un reembolso total o parcial
   */
  @Post('payment/:paymentId/refund')
  @HttpCode(HttpStatus.OK)
  async refundPayment(
    @Param('paymentId') paymentId: string,
    @Body('amount') amount?: number,
  ) {
    this.logger.log(
      `Procesando reembolso para pago: ${paymentId}${amount ? ` por monto ${amount}` : ' (total)'}`,
    );
    return await this.mercadoPagoService.refundPayment(paymentId, amount);
  }

  /**
   * Obtiene todos los reembolsos de un pago
   */
  @Get('payment/:paymentId/refunds')
  async getPaymentRefunds(@Param('paymentId') paymentId: string) {
    this.logger.log(`Obteniendo reembolsos del pago: ${paymentId}`);
    return await this.mercadoPagoService.getPaymentRefunds(paymentId);
  }

  /**
   * Obtiene detalles de un reembolso específico
   */
  @Get('payment/:paymentId/refund/:refundId')
  async getRefundDetails(
    @Param('paymentId') paymentId: string,
    @Param('refundId') refundId: string,
  ) {
    this.logger.log(
      `Obteniendo detalles del reembolso ${refundId} del pago ${paymentId}`,
    );
    return await this.mercadoPagoService.getRefundDetails(paymentId, refundId);
  }
}
