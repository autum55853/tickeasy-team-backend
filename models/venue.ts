/**
 * 場地模型
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BeforeInsert,
  BeforeUpdate,
  OneToMany
} from 'typeorm';
import { getTaiwanTime } from '../utils/date.js';
import type { Concert } from './concert.js';

@Entity('venues')
export class Venue {
  @PrimaryGeneratedColumn('uuid', { name: 'venueId' })
  venueId: string;

  @Column({ type: 'varchar', length: 100, nullable: false })
  venueName: string;

  @Column({ type: 'text', nullable: true })
  venueDescription: string;

  @Column({ type: 'varchar', length: 200, nullable: false })
  venueAddress: string;

  @Column({ type: 'int', nullable: true })
  venueCapacity: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  venueImageUrl: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  googleMapUrl: string;

  @Column({ type: 'boolean', default: false })
  isAccessible: boolean;

  @Column({ type: 'boolean', default: false })
  hasParking: boolean;

  @Column({ type: 'boolean', default: false })
  hasTransit: boolean;

  @Column({ type: 'timestamp', nullable: false })
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: false })
  updatedAt: Date;

  @BeforeInsert()
  setTimestamps() {
    this.createdAt = getTaiwanTime();
    this.updatedAt = getTaiwanTime();
  }

  @BeforeUpdate()
  updateTimestamp() {
    this.updatedAt = getTaiwanTime();
  }
  
  @OneToMany('Concert', (concert: Concert) => concert.venue)
  concerts: Concert[];
} 