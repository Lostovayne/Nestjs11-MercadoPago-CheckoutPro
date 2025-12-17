import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import {
  MercadoPagoConfig,
  Payment as MercadoPagoPayment,
  PaymentRefund,
  Preference,
} from 'mercadopago';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderItem } from './entities/order-item.entity';
import { Order, OrderStatus } from './entities/order.entity';
import { Payment, PaymentStatus } from './entities/payment.entity';
import type {
  CreatePaymentPreferenceResponse,
  OrderStatusResponse,
  RefundPaymentResponse,
} from './interfaces/payment-responses.interface';

@Injectable()
export class MercadoPagoService {
  private readonly logger = new Logger(MercadoPagoService.name);
  private readonly client: MercadoPagoConfig;
  private readonly preference: Preference;
  private readonly payment: MercadoPagoPayment;
  private readonly refund: PaymentRefund;

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
  ) {
    const accessToken = this.configService.get<string>(
      'MERCADOPAGO_ACCESS_TOKEN',
    );

    if (!accessToken) {
      throw new Error('MERCADOPAGO_ACCESS_TOKEN is required');
    }

    // Configuración segura del cliente de Mercado Pago
    this.client = new MercadoPagoConfig({
      accessToken,
      options: {
        timeout: 5000,
      },
    });

    this.preference = new Preference(this.client);
    this.payment = new MercadoPagoPayment(this.client);
    this.refund = new PaymentRefund(this.client);
  }

  /**
   * Crea una preferencia de pago en Mercado Pago y guarda la orden en la base de datos
   * Implementa idempotencia mediante transacciones de base de datos
   */
  async createPaymentPreference(
    createOrderDto: CreateOrderDto,
  ): Promise<CreatePaymentPreferenceResponse> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Calcular el total
      const totalAmount = createOrderDto.items.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0,
      );

      // Validar que el total sea mayor a 0
      if (totalAmount <= 0) {
        throw new BadRequestException('El monto total debe ser mayor a cero');
      }

      // Crear la orden en la base de datos
      const order = queryRunner.manager.create(Order, {
        status: OrderStatus.PENDING,
        totalAmount,
        currency: 'ARS',
        customerEmail: createOrderDto.customerEmail,
        customerName: createOrderDto.customerName,
        customerPhone: createOrderDto.customerPhone,
        notes: createOrderDto.notes,
        metadata: createOrderDto.metadata,
      });

      const savedOrder = await queryRunner.manager.save(order);

      // Crear los items de la orden
      const orderItems = createOrderDto.items.map((item) =>
        queryRunner.manager.create(OrderItem, {
          orderId: savedOrder.id,
          title: item.title,
          description: item.description,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.unitPrice * item.quantity,
          pictureUrl: item.pictureUrl,
          metadata: item.metadata,
        }),
      );

      await queryRunner.manager.save(orderItems);

      // Preparar items para Mercado Pago
      const preferenceItems = createOrderDto.items.map((item, index) => ({
        id: item.productId || `item-${index}-${savedOrder.id}`,
        title: item.title.substring(0, 256), // Límite de Mercado Pago
        description: item.description?.substring(0, 256) || '',
        quantity: item.quantity,
        unit_price: Number(item.unitPrice.toFixed(2)),
        currency_id: 'ARS', // Ajustar según tu país
        picture_url: item.pictureUrl,
        category_id: item.categoryId || 'others', // Mejora tasa de aprobación
      }));

      // URLs del backend para recibir las notificaciones
      const backendUrl =
        this.configService.get<string>('BACKEND_URL') ||
        `http://localhost:${this.configService.get<string>('PORT') || 3000}`;

      // URLs del frontend para redireccionar al usuario
      const frontendUrl =
        this.configService.get<string>('FRONTEND_URL') ||
        'http://localhost:3001';

      // Construir objeto payer con información completa para mejorar tasa de aprobación
      const payerName = createOrderDto.customerFirstName || 
                        createOrderDto.customerName?.split(' ')[0] || 
                        'Cliente';
      const payerSurname = createOrderDto.customerLastName || 
                          createOrderDto.customerName?.split(' ').slice(1).join(' ') || 
                          '';

      // Extraer código de área del teléfono si está disponible
      const phoneData = this.extractPhoneData(createOrderDto.customerPhone);

      // Construir dirección del payer si está disponible
      const payerAddress = createOrderDto.customerAddress ? {
        street_name: createOrderDto.customerAddress.streetName,
        street_number: createOrderDto.customerAddress.streetNumber,
        zip_code: createOrderDto.customerAddress.zipCode,
      } : undefined;

      // Construir identificación del payer si está disponible
      const payerIdentification = createOrderDto.customerIdentificationNumber ? {
        type: createOrderDto.customerIdentificationType || 'DNI',
        number: createOrderDto.customerIdentificationNumber,
      } : undefined;

      // Crear preferencia en Mercado Pago con configuración completa de seguridad
      const preferenceData = {
        items: preferenceItems,
        payer: {
          name: payerName,
          surname: payerSurname,
          email: createOrderDto.customerEmail,
          phone: phoneData,
          identification: payerIdentification,
          address: payerAddress,
        },
        back_urls: {
          success: `${frontendUrl}/payment/success?order_id=${savedOrder.id}`,
          failure: `${frontendUrl}/payment/failure?order_id=${savedOrder.id}`,
          pending: `${frontendUrl}/payment/pending?order_id=${savedOrder.id}`,
        },
        auto_return: 'approved' as const,
        external_reference: savedOrder.id,
        notification_url: `${backendUrl}/payments/webhook`,
        statement_descriptor: 'COMPRA ONLINE',
        // Configuraciones de seguridad adicionales
        binary_mode: false, // Permite pagos pending
        expires: true, // La preferencia expira
        expiration_date_from: new Date().toISOString(),
        expiration_date_to: new Date(
          Date.now() + 
          (this.configService.get<number>('PREFERENCE_EXPIRATION_DAYS') || 30) * 
          24 * 60 * 60 * 1000,
        ).toISOString(), // Configurable vía env
        metadata: {
          order_id: savedOrder.id,
          customer_email: createOrderDto.customerEmail,
          created_at: new Date().toISOString(),
        },
        // Configuraciones adicionales de pago
        payment_methods: {
          excluded_payment_methods: this.configService.get<string[]>('EXCLUDED_PAYMENT_METHODS') || [],
          excluded_payment_types: this.configService.get<string[]>('EXCLUDED_PAYMENT_TYPES') || [],
          installments: createOrderDto.maxInstallments || 
                       this.configService.get<number>('MAX_INSTALLMENTS') || 
                       12, // Número máximo de cuotas
        },
        // Monto de envío si está disponible
        shipments: createOrderDto.shipmentAmount ? {
          cost: Number(createOrderDto.shipmentAmount.toFixed(2)),
          mode: 'not_specified' as const,
        } : undefined,
      };

      const response = await this.preference.create({ body: preferenceData });

      // Actualizar la orden con el preference_id
      savedOrder.mercadoPagoPreferenceId = response.id;
      await queryRunner.manager.save(savedOrder);

      // Commit de la transacción
      await queryRunner.commitTransaction();

      this.logger.log(
        `Preferencia de pago creada: ${response.id} para orden: ${savedOrder.id}`,
      );

      return {
        preferenceId: response.id,
        initPoint: response.init_point,
        sandboxInitPoint: response.sandbox_init_point,
        orderId: savedOrder.id,
      };
    } catch (error) {
      // Rollback en caso de error
      await queryRunner.rollbackTransaction();

      this.logger.error(
        `Error al crear preferencia de pago: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        `Error al crear la preferencia de pago: ${error.message}`,
      );
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Verifica y procesa una notificación de webhook de Mercado Pago
   * Implementa idempotencia para evitar procesamiento duplicado
   */
  async processWebhookNotification(
    notificationId: string,
    notificationType: string,
  ): Promise<void> {
    try {
      this.logger.log(
        `Procesando notificación: ${notificationId}, tipo: ${notificationType}`,
      );

      if (notificationType === 'payment') {
        // Obtener información del pago desde Mercado Pago
        const paymentData = await this.payment.get({ id: notificationId });

        // Actualizar el pago con idempotencia
        await this.updatePaymentStatus(paymentData);
      } else if (notificationType === 'merchant_order') {
        // Procesar actualización de orden si es necesario
        this.logger.log(
          `Notificación de merchant_order recibida: ${notificationId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error al procesar notificación: ${error.message}`,
        error.stack,
      );
      // No lanzamos el error para que Mercado Pago no reintente indefinidamente
      // En su lugar, logueamos el error para investigación
    }
  }

  /**
   * Actualiza el estado del pago basado en la información de Mercado Pago
   * Implementa idempotencia y transacciones para consistencia de datos
   */
  async updatePaymentStatus(paymentData: any): Promise<Payment> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const mercadoPagoPaymentId = paymentData.id.toString();
      const externalReference = paymentData.external_reference;

      if (!externalReference) {
        throw new BadRequestException(
          'El pago no tiene external_reference asociado',
        );
      }

      // Buscar el pago existente
      let payment = await queryRunner.manager.findOne(Payment, {
        where: { mercadoPagoPaymentId },
        relations: ['order'],
      });

      // Buscar la orden
      const order = await queryRunner.manager.findOne(Order, {
        where: { id: externalReference },
        relations: ['payments', 'items'],
      });

      if (!order) {
        throw new NotFoundException(
          `Orden no encontrada: ${externalReference}`,
        );
      }

      // Mapear el estado de Mercado Pago a nuestro enum
      const status = this.mapPaymentStatus(paymentData.status);
      const previousStatus = payment?.status;

      // Verificar si ya procesamos este estado (idempotencia)
      if (payment && payment.status === status) {
        this.logger.log(
          `Pago ${mercadoPagoPaymentId} ya está en estado ${status}, saltando actualización`,
        );
        await queryRunner.commitTransaction();
        return payment;
      }

      if (!payment) {
        // Crear nuevo pago
        payment = queryRunner.manager.create(Payment, {
          mercadoPagoPaymentId,
          orderId: order.id,
          status,
          previousStatus: null,
          amount: paymentData.transaction_amount,
          refundedAmount: paymentData.transaction_amount_refunded || 0,
          currency: paymentData.currency_id,
          paymentMethodId: paymentData.payment_method_id,
          paymentTypeId: paymentData.payment_type_id,
          transactionId: paymentData.transaction_details?.transaction_id,
          description: paymentData.description,
          mercadoPagoData: paymentData,
          statusDetail: paymentData.status_detail,
          payerEmail: paymentData.payer?.email,
          payerId: paymentData.payer?.id?.toString(),
          webhookAttempts: 1,
          lastWebhookAt: new Date(),
          dateApproved: paymentData.date_approved
            ? new Date(paymentData.date_approved)
            : null,
          dateCreated: paymentData.date_created
            ? new Date(paymentData.date_created)
            : null,
          dateLastUpdated: paymentData.date_last_updated
            ? new Date(paymentData.date_last_updated)
            : null,
        });

        this.logger.log(
          `Creando nuevo pago ${mercadoPagoPaymentId} con estado ${status}`,
        );
      } else {
        // Actualizar pago existente
        payment.previousStatus = previousStatus;
        payment.status = status;
        payment.amount = paymentData.transaction_amount;
        payment.refundedAmount = paymentData.transaction_amount_refunded || 0;
        payment.currency = paymentData.currency_id;
        payment.paymentMethodId = paymentData.payment_method_id;
        payment.paymentTypeId = paymentData.payment_type_id;
        payment.transactionId = paymentData.transaction_details?.transaction_id;
        payment.statusDetail = paymentData.status_detail;
        payment.mercadoPagoData = paymentData;
        payment.webhookAttempts += 1;
        payment.lastWebhookAt = new Date();
        payment.dateApproved = paymentData.date_approved
          ? new Date(paymentData.date_approved)
          : null;
        payment.dateLastUpdated = paymentData.date_last_updated
          ? new Date(paymentData.date_last_updated)
          : null;

        this.logger.log(
          `Actualizando pago ${mercadoPagoPaymentId} de ${previousStatus} a ${status}`,
        );
      }

      const savedPayment = await queryRunner.manager.save(payment);

      // Actualizar el estado de la orden basado en el estado del pago
      await this.updateOrderStatus(
        queryRunner,
        order,
        status,
        paymentData.status_detail,
      );

      // Commit de la transacción
      await queryRunner.commitTransaction();

      this.logger.log(
        `Pago ${savedPayment.id} actualizado exitosamente con estado: ${status}`,
      );

      return savedPayment;
    } catch (error) {
      // Rollback en caso de error
      await queryRunner.rollbackTransaction();

      this.logger.error(
        `Error al actualizar estado de pago: ${error.message}`,
        error.stack,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Mapea el estado de Mercado Pago a nuestro enum de estados
   */
  private mapPaymentStatus(mercadoPagoStatus: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      pending: PaymentStatus.PENDING,
      approved: PaymentStatus.APPROVED,
      authorized: PaymentStatus.AUTHORIZED,
      in_process: PaymentStatus.IN_PROCESS,
      in_mediation: PaymentStatus.IN_MEDIATION,
      rejected: PaymentStatus.REJECTED,
      cancelled: PaymentStatus.CANCELLED,
      refunded: PaymentStatus.REFUNDED,
      charged_back: PaymentStatus.CHARGED_BACK,
    };

    return statusMap[mercadoPagoStatus] || PaymentStatus.PENDING;
  }

  /**
   * Actualiza el estado de la orden basado en el estado del pago
   * Maneja todos los casos de estado de pago incluyendo reembolsos y contracargos
   */
  private async updateOrderStatus(
    queryRunner: QueryRunner,
    order: Order,
    paymentStatus: PaymentStatus,
    statusDetail?: string,
  ): Promise<void> {
    const previousOrderStatus = order.status;
    let newOrderStatus: OrderStatus;

    switch (paymentStatus) {
      case PaymentStatus.APPROVED:
      case PaymentStatus.AUTHORIZED:
        newOrderStatus = OrderStatus.PAID;
        order.paidAt = new Date();
        this.logger.log(`Orden ${order.id} marcada como PAGADA`);
        break;

      case PaymentStatus.REJECTED:
        newOrderStatus = OrderStatus.FAILED;
        order.failureReason = statusDetail || 'Pago rechazado';
        this.logger.log(
          `Orden ${order.id} marcada como FALLIDA: ${statusDetail}`,
        );
        break;

      case PaymentStatus.CANCELLED:
        newOrderStatus = OrderStatus.CANCELLED;
        order.cancelledAt = new Date();
        order.failureReason = statusDetail || 'Pago cancelado por el usuario';
        this.logger.log(`Orden ${order.id} CANCELADA`);
        break;

      case PaymentStatus.REFUNDED:
      case PaymentStatus.CHARGED_BACK:
        newOrderStatus = OrderStatus.REFUNDED;
        order.refundedAt = new Date();
        this.logger.log(`Orden ${order.id} marcada como REEMBOLSADA`);
        break;

      case PaymentStatus.IN_PROCESS:
      case PaymentStatus.IN_MEDIATION:
        newOrderStatus = OrderStatus.PROCESSING;
        this.logger.log(`Orden ${order.id} en PROCESAMIENTO`);
        break;

      case PaymentStatus.PENDING:
      default:
        newOrderStatus = OrderStatus.PENDING;
        this.logger.log(`Orden ${order.id} permanece en PENDIENTE`);
        break;
    }

    // Solo actualizar si el estado cambió
    if (order.status !== newOrderStatus) {
      order.previousStatus = previousOrderStatus;
      order.status = newOrderStatus;
      await queryRunner.manager.save(order);

      this.logger.log(
        `Orden ${order.id} actualizada de ${previousOrderStatus} a ${newOrderStatus}`,
      );

      // Aquí puedes agregar lógica adicional como:
      // - Enviar email de confirmación al cliente
      // - Notificar a sistemas internos
      // - Actualizar inventario
      // - Generar factura
      this.handleOrderStatusChange(order, previousOrderStatus, newOrderStatus);
    }
  }

  /**
   * Maneja acciones adicionales cuando cambia el estado de una orden
   */
  private handleOrderStatusChange(
    order: Order,
    previousStatus: OrderStatus,
    newStatus: OrderStatus,
  ): void {
    // Aquí puedes implementar lógica adicional según el cambio de estado
    switch (newStatus) {
      case OrderStatus.PAID:
        this.logger.log(`Procesando orden pagada ${order.id}`);
        // TODO: Enviar email de confirmación
        // TODO: Actualizar inventario
        // TODO: Notificar a sistemas de fulfillment
        break;

      case OrderStatus.FAILED:
        this.logger.log(`Procesando orden fallida ${order.id}`);
        // TODO: Enviar email de pago fallido
        // TODO: Liberar inventario reservado
        break;

      case OrderStatus.REFUNDED:
        this.logger.log(`Procesando orden reembolsada ${order.id}`);
        // TODO: Enviar email de reembolso
        // TODO: Revertir cambios en inventario
        // TODO: Notificar a contabilidad
        break;

      case OrderStatus.CANCELLED:
        this.logger.log(`Procesando orden cancelada ${order.id}`);
        // TODO: Enviar email de cancelación
        // TODO: Liberar inventario reservado
        break;

      default:
        break;
    }
  }

  /**
   * Obtiene información de un pago desde Mercado Pago y actualiza la base de datos
   */
  async verifyPayment(paymentId: string): Promise<Payment> {
    try {
      const paymentData = await this.payment.get({ id: paymentId });
      return await this.updatePaymentStatus(paymentData);
    } catch (error) {
      this.logger.error(
        `Error al verificar pago: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        `Error al verificar el pago: ${error.message}`,
      );
    }
  }

  /**
   * Obtiene una orden con todos sus detalles
   */
  async getOrder(orderId: string): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['payments', 'items'],
    });

    if (!order) {
      throw new NotFoundException(`Orden no encontrada: ${orderId}`);
    }

    return order;
  }

  /**
   * Obtiene todos los pagos de una orden
   */
  async getOrderPayments(orderId: string): Promise<Payment[]> {
    return await this.paymentRepository.find({
      where: { orderId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Verifica el estado de una orden y devuelve información completa
   */
  async getOrderStatus(orderId: string): Promise<OrderStatusResponse> {
    const order = await this.getOrder(orderId);
    const payments = await this.getOrderPayments(orderId);

    const latestPayment = payments[0];
    const isPaid = order.status === OrderStatus.PAID;
    const canRetry = [
      OrderStatus.FAILED,
      OrderStatus.CANCELLED,
      OrderStatus.PENDING,
    ].includes(order.status);

    let message = '';
    switch (order.status) {
      case OrderStatus.PAID:
        message = 'Pago aprobado correctamente';
        break;
      case OrderStatus.PENDING:
        message = 'Pago pendiente de aprobación';
        break;
      case OrderStatus.PROCESSING:
        message = 'Pago en proceso de verificación';
        break;
      case OrderStatus.FAILED:
        message = `Pago rechazado: ${order.failureReason || 'Error desconocido'}`;
        break;
      case OrderStatus.CANCELLED:
        message = 'Pago cancelado';
        break;
      case OrderStatus.REFUNDED:
        message = 'Pago reembolsado';
        break;
      default:
        message = 'Estado desconocido';
    }

    return {
      order,
      payments,
      status: order.status,
      isPaid,
      canRetry,
      message,
    };
  }

  /**
   * Crea un reembolso para un pago (total o parcial)
   * @param paymentId - ID del pago en Mercado Pago
   * @param amount - Monto a reembolsar (opcional, si no se especifica es reembolso total)
   * @returns Información del reembolso creado
   */
  async refundPayment(
    paymentId: string,
    amount?: number,
  ): Promise<RefundPaymentResponse> {
    try {
      // Buscar el pago en nuestra base de datos
      const payment = await this.paymentRepository.findOne({
        where: { mercadoPagoPaymentId: paymentId },
        relations: ['order'],
      });

      if (!payment) {
        throw new NotFoundException(`Pago no encontrado: ${paymentId}`);
      }

      // Validar que el pago esté aprobado
      if (payment.status !== PaymentStatus.APPROVED) {
        throw new BadRequestException(
          `Solo se pueden reembolsar pagos aprobados. Estado actual: ${payment.status}`,
        );
      }

      // Validar el monto del reembolso
      const maxRefundAmount =
        Number(payment.amount) - Number(payment.refundedAmount || 0);

      if (amount && amount > maxRefundAmount) {
        throw new BadRequestException(
          `El monto del reembolso (${amount}) excede el monto disponible (${maxRefundAmount})`,
        );
      }

      // Crear el reembolso en Mercado Pago
      const refundBody: any = {
        payment_id: paymentId,
      };

      // Si se especifica un monto, es reembolso parcial
      if (amount) {
        refundBody.body = {
          amount: Number(amount.toFixed(2)),
        };
      }

      this.logger.log(
        `Creando reembolso para pago ${paymentId}${amount ? ` por monto ${amount}` : ' (total)'}`,
      );

      const refundResponse = await this.refund.create(refundBody);

      // Actualizar el payment en nuestra BD
      payment.refundedAmount =
        Number(payment.refundedAmount || 0) +
        Number(refundResponse.amount || amount || payment.amount);

      // Si el reembolso es total, actualizar el estado
      if (payment.refundedAmount >= Number(payment.amount)) {
        payment.previousStatus = payment.status;
        payment.status = PaymentStatus.REFUNDED;

        // Actualizar la orden
        if (payment.order) {
          payment.order.status = OrderStatus.REFUNDED;
          payment.order.refundedAt = new Date();
          await this.orderRepository.save(payment.order);
        }
      }

      await this.paymentRepository.save(payment);

      this.logger.log(
        `Reembolso creado exitosamente: ${refundResponse.id} para pago ${paymentId}`,
      );

      return {
        refundId: refundResponse.id.toString(),
        status: refundResponse.status || 'approved',
        amount: Number(refundResponse.amount || amount || payment.amount),
        paymentId: paymentId,
      };
    } catch (error) {
      this.logger.error(
        `Error al procesar reembolso: ${error.message}`,
        error.stack,
      );

      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      throw new BadRequestException(
        `Error al procesar el reembolso: ${error.message}`,
      );
    }
  }

  /**
   * Obtiene la lista de reembolsos de un pago
   */
  async getPaymentRefunds(paymentId: string): Promise<any[]> {
    try {
      const refundsList = await this.refund.list({
        payment_id: paymentId,
      });

      return refundsList.results || [];
    } catch (error) {
      this.logger.error(
        `Error al obtener reembolsos: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        `Error al obtener los reembolsos: ${error.message}`,
      );
    }
  }

  /**
   * Obtiene información de un reembolso específico
   */
  async getRefundDetails(paymentId: string, refundId: string): Promise<any> {
    try {
      const refundDetails = await this.refund.get({
        payment_id: paymentId,
        refund_id: refundId,
      });

      return refundDetails;
    } catch (error) {
      this.logger.error(
        `Error al obtener detalles del reembolso: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        `Error al obtener detalles del reembolso: ${error.message}`,
      );
    }
  }

  /**
   * Extrae código de área y número de teléfono
   * Soporta formatos comunes: +54 11 1234-5678, 011-1234-5678, etc.
   */
  private extractPhoneData(phone?: string): { area_code: string; number: string } | undefined {
    if (!phone) {
      return undefined;
    }

    // Limpiar el teléfono (remover espacios, guiones, paréntesis)
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');

    // Para Argentina: código de país +54 o sin prefijo, código de área 11, 15, etc.
    // Extraer código de área (2-3 dígitos después del código de país)
    const argentinaPattern = /^(\+?54)?(\d{2,3})(\d{6,8})$/;
    const match = cleanPhone.match(argentinaPattern);

    if (match) {
      return {
        area_code: match[2] || '',
        number: match[3] || cleanPhone,
      };
    }

    // Si no coincide con el patrón, intentar extraer primeros 2-3 dígitos como código de área
    if (cleanPhone.length >= 8) {
      const areaCode = cleanPhone.substring(0, 2);
      const number = cleanPhone.substring(2);
      return {
        area_code: areaCode,
        number: number,
      };
    }

    // Fallback: devolver todo como número
    return {
      area_code: '',
      number: cleanPhone,
    };
  }

  /**
   * Cancela una orden y su preferencia de pago si aún está pendiente
   */
  async cancelOrder(orderId: string, reason?: string): Promise<Order> {
    const order = await this.getOrder(orderId);

    if (order.status === OrderStatus.PAID) {
      throw new BadRequestException(
        'No se puede cancelar una orden ya pagada. Solicita un reembolso.',
      );
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('La orden ya está cancelada');
    }

    order.status = OrderStatus.CANCELLED;
    order.cancelledAt = new Date();
    order.failureReason = reason || 'Cancelado por el usuario';

    await this.orderRepository.save(order);

    this.logger.log(
      `Orden ${orderId} cancelada: ${reason || 'Sin razón especificada'}`,
    );

    return order;
  }
}
