/**
 * 票券模型
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  // CreateDateColumn
} from 'typeorm';
import { Order } from './order.js';
import { TicketType } from './ticket-type.js';
// 移除直接引入 User
// import { User } from './user.js';

// --- 新增 TicketStatus ---
export type TicketStatus = 'purchased' | 'refunded' | 'used';
// ------------------------

@Entity('ticket')
export class Ticket {
  @PrimaryGeneratedColumn('uuid', { name: 'ticketId' })
  ticketId: string;

  @Column({ name: 'orderId', type: 'uuid', nullable: false })
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column({ name: 'ticketTypeId', type: 'uuid', nullable: false })
  ticketTypeId: string;

  @ManyToOne(() => TicketType, (ticketType) => ticketType.tickets, {
    nullable: false,
    onDelete: 'RESTRICT', // 刪除票券時不刪除票種
  })
  @JoinColumn({ name: 'ticketTypeId' })
  ticketType: TicketType;

  @Column({ name: 'userId', type: 'uuid', nullable: false })
  userId: string;

  @ManyToOne('User', { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user: any; // 或者可以使用 Record<string, any> 類型

  @Column({ type: 'varchar', length: 100, nullable: true })
  purchaserName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  purchaserEmail: string | null;

  @Column({ type: 'timestamp', nullable: false })
  concertStartTime: Date;

  @Column({ type: 'varchar', length: 100, nullable: true })
  seatNumber: string | null;

  @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
  qrCode: string | null;

  @Column({
    type: 'enum',
    enum: ['purchased', 'refunded', 'used'] as TicketStatus[],
    nullable: false,
  })
  status: TicketStatus;

  @Column({ type: 'timestamp', name: 'purchaseTime', nullable: false })
  purchaseTime: Date;
}
