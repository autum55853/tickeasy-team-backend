/**
 * 地區標籤模型
 */
import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Concert } from './concert.js';

@Entity('locationTag')
export class LocationTag {
  @PrimaryGeneratedColumn('uuid', { name: 'locationTagId' })
  locationTagId: string;

  @Column({ type: 'varchar', length: 50, nullable: false })
  locationTagName: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  subLabel: string;

  @OneToMany(() => Concert, (concert) => concert.locationTag)
  concerts: Concert[];
}
