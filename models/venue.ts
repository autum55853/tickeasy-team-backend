/**
 * 場地模型
 */
import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column, 
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany
} from 'typeorm';
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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
  
  @OneToMany('Concert', (concert: Concert) => concert.venue)
  concerts: Concert[];
} 