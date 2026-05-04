/**
 * 票種模型
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Order } from './order.js';
import { Ticket } from './ticket.js';
import { ConcertSession } from './concert-session.js';
// import { Concert } from './concert.js';

@Entity('ticketType')
export class TicketType {
  @PrimaryGeneratedColumn('uuid', { name: 'ticketTypeId' })
  ticketTypeId: string;

  @Column({ name: 'concertSessionId', type: 'uuid', nullable: false })
  concertSessionId: string;

  @ManyToOne(() => ConcertSession, (session) => session.ticketTypes, {
    nullable: false,
    onDelete: 'CASCADE', // 刪除場次時也刪掉票種
  })
  @JoinColumn({ name: 'concertSessionId' })
  concertSession: ConcertSession;

  @Column({ type: 'varchar', length: 50, nullable: true })
  ticketTypeName: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  entranceType: string;

  @Column({ type: 'text', nullable: true })
  ticketBenefits: string;

  @Column({ type: 'text', nullable: true })
  ticketRefundPolicy: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  ticketTypePrice: number;

  @Column({ type: 'int', nullable: true })
  totalQuantity: number;

  @Column({ type: 'int', nullable: true })
  remainingQuantity: number;

  @Column({ type: 'timestamp', nullable: true })
  sellBeginDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  sellEndDate: Date;

  @CreateDateColumn({ nullable: false })
  createdAt: Date;

  @OneToMany(() => Order, (order) => order.ticketType)
  orders: Order[];

  @OneToMany(() => Ticket, (ticket) => ticket.ticketType, {
    cascade: false, // 不要同時建立票券
  })
  tickets: Ticket[];
}
