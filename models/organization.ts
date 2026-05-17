/**
 * 組織/公司模型
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BeforeInsert,
  ManyToOne,
  JoinColumn
} from 'typeorm';
import { getTaiwanTime } from '../utils/date.js';

// 避免直接導入 User 類型，使用接口代替
interface UserRef {
  userId: string;
}

@Entity('organization')
export class Organization {
  @PrimaryGeneratedColumn('uuid', { name: 'organizationId' })
  organizationId: string;

  @Column({ name: 'userId', type: 'uuid', nullable: false })
  userId: string;

  @ManyToOne('User', 'organizations', { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user: UserRef;

  @Column({ type: 'varchar', length: 100, nullable: false, unique: true })
  orgName: string;

  @Column({ type: 'varchar', length: 100, nullable: false })
  orgAddress: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  orgMail: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  orgContact: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  orgMobile: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  orgPhone: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  orgWebsite: string;

  @Column({ type: 'timestamp', nullable: false })
  createdAt: Date;

  @BeforeInsert()
  setCreatedAt() {
    this.createdAt = getTaiwanTime();
  }
}