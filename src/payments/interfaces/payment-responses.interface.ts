import { Order, OrderStatus } from '../entities/order.entity';
import { Payment } from '../entities/payment.entity';

export interface CreatePaymentPreferenceResponse {
  preferenceId: string;
  initPoint: string;
  sandboxInitPoint?: string;
  orderId: string;
}

export interface OrderStatusResponse {
  order: Order;
  payments: Payment[];
  status: OrderStatus;
  isPaid: boolean;
  canRetry: boolean;
  message: string;
}

export interface RefundPaymentResponse {
  refundId: string;
  status: string;
  amount: number;
  paymentId: string;
}
