/**
 * 支付模型
 */
import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column, 
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn
} from 'typeorm';

// 避免直接導入 Order 類型，使用接口代替
interface OrderRef {
  orderId: string;
}

// --- 新增 PaymentStatus ---
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';
// -------------------------

@Entity('payment')
export class Payment {
  @PrimaryGeneratedColumn('uuid', { name: 'paymentId' })
  paymentId: string;

  @Column({ name: 'orderId', type: 'uuid', nullable: false })
  orderId: string;

  @ManyToOne('Order', 'payments', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order: OrderRef;

  @Column({ type: 'varchar', length: 50, nullable: false })
  method: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  provider: string;

  @Column({
    type: 'enum',
    enum: ['pending', 'completed', 'failed', 'refunded'] as PaymentStatus[],
    nullable: false
  })
  status: PaymentStatus;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: false })
  amount: number;

  @Column({ type: 'varchar', length: 10, default: 'TWD' })
  currency: string;

  @Column({ type: 'timestamp', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'varchar', unique: true, nullable: true })
  transactionId: string;

  @Column({ type: 'jsonb', nullable: true })
  rawPayload: object;
  
  @CreateDateColumn({ nullable: false })
  createdAt: Date;

  @UpdateDateColumn({ nullable: true })
  updatedAt?: Date;

  @Column({ type: 'varchar', length: 50, nullable: true })
  tradeNo: string;

} 