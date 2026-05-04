/**
 * 音樂會場次模型
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
import { TicketType } from './ticket-type.js';
import { Concert } from './concert.js';

// export type SessionStatus = 'draft' | 'published' | 'finished';

@Entity('concertSession')
export class ConcertSession {
  @PrimaryGeneratedColumn('uuid', { name: 'sessionId' })
  sessionId: string;

  @Column({ name: 'concertId', type: 'uuid', nullable: false })
  concertId: string;

  @ManyToOne(() => Concert, (concert) => concert.sessions, {
    nullable: false,
    onDelete: 'CASCADE', // 刪除音樂會時也刪掉場次
  })
  @JoinColumn({ name: 'concertId' })
  concert: Concert;

  @OneToMany(() => TicketType, (ticketType) => ticketType.concertSession, {
    cascade: true, // 建立 session 時可同時建立 ticketTypes
  })
  ticketTypes: TicketType[];

  @Column({ type: 'date', nullable: true })
  sessionDate: Date; // yyyy-mm-dd

  @Column({ type: 'time', nullable: true })
  sessionStart: string; // HH:mm

  @Column({ type: 'time', nullable: true })
  sessionEnd: string; // HH:mm

  @Column({ type: 'varchar', length: 100, nullable: true })
  sessionTitle: string;

  @Column({ type: 'text', nullable: true })
  imgSeattable: string; // 只會有一張

  @CreateDateColumn()
  createdAt: Date;
}
