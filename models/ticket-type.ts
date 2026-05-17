/**
 * 票種模型
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BeforeInsert,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { ConcertSession } from './concert-session.js';
import { getTaiwanTime } from '../utils/date.js';
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
  concertSession: any;

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

  @Column({ type: 'timestamp', nullable: false })
  createdAt: Date;

  @BeforeInsert()
  setCreatedAt() {
    this.createdAt = getTaiwanTime();
  }

  @OneToMany('Order', 'ticketType')
  orders: any[];

  @OneToMany('Ticket', 'ticketType', {
    cascade: false,
  })
  tickets: any[];
}
