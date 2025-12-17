import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Order } from './order.entity';

export enum PaymentStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  AUTHORIZED = 'authorized',
  IN_PROCESS = 'in_process',
  IN_MEDIATION = 'in_mediation',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
  CHARGED_BACK = 'charged_back',
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  mercadoPagoPaymentId: string;

  @Column({ type: 'uuid' })
  orderId: string;

  @ManyToOne(() => Order, (order) => order.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @Column({ type: 'varchar', length: 50, nullable: true })
  previousStatus: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  refundedAmount: number;

  @Column({ type: 'varchar', length: 10, default: 'ARS' })
  currency: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  paymentMethodId: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  paymentTypeId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  transactionId: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'jsonb', nullable: true })
  mercadoPagoData: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  statusDetail: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  payerEmail: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  payerId: string;

  @Column({ type: 'int', default: 0 })
  webhookAttempts: number;

  @Column({ type: 'timestamp', nullable: true })
  lastWebhookAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  dateApproved: Date;

  @Column({ type: 'timestamp', nullable: true })
  dateCreated: Date;

  @Column({ type: 'timestamp', nullable: true })
  dateLastUpdated: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
