/**
 * 音樂類型標籤模型
 */
import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Concert } from './concert.js';

@Entity('musicTag')
export class MusicTag {
  @PrimaryGeneratedColumn('uuid', { name: 'musicTagId' })
  musicTagId: string;

  @Column({ type: 'varchar', length: 50, nullable: false })
  musicTagName: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  subLabel: string;

  @OneToMany(() => Concert, (concert) => concert.musicTag)
  concerts: Concert[];
}
