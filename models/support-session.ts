import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, CreateDateColumn } from 'typeorm';
import { User } from './user.js';

/* eslint-disable no-unused-vars */
// 會話類型枚舉
export enum SessionType {
  BOT = 'bot',
  HUMAN = 'human',
  MIXED = 'mixed'
}

// 會話狀態枚舉
export enum SessionStatus {
  ACTIVE = 'active',
  WAITING = 'waiting',
  CLOSED = 'closed',
  TRANSFERRED = 'transferred'
}

// 優先級枚舉
export enum Priority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent'
}
/* eslint-enable no-unused-vars */

@Entity('supportSession')
export class SupportSession {
  @PrimaryGeneratedColumn('uuid')
  supportSessionId: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'enum', enum: SessionType, enumName: 'SupportSessionType', default: SessionType.BOT })
  sessionType: SessionType;

  @Column({ type: 'enum', enum: SessionStatus, enumName: 'SupportSessionStatus', default: SessionStatus.ACTIVE })
  status: SessionStatus;

  @Column({ type: 'uuid', nullable: true })
  agentId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'agentId' })
  agent: User;

  @Column({ type: 'enum', enum: Priority, enumName: 'SupportSessionPriority', default: Priority.NORMAL })
  priority: Priority;

  @Column({ type: 'varchar', length: 50, nullable: true })
  category: string;

  @Column({ type: 'timestamp', nullable: true })
  firstResponseAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  closedAt: Date;

  @Column({ type: 'int', nullable: true })
  satisfactionRating: number;

  @Column({ type: 'text', nullable: true })
  satisfactionComment: string;

  @OneToMany('SupportMessage', 'session')
  messages: any[];

  // 虛擬屬性：計算會話持續時間（分鐘）
  get durationMinutes(): number | null {
    if (!this.closedAt) return null;
    return Math.round((this.closedAt.getTime() - this.createdAt.getTime()) / (1000 * 60));
  }

  // 虛擬屬性：首次回應時間（分鐘）
  get firstResponseMinutes(): number | null {
    if (!this.firstResponseAt) return null;
    return Math.round((this.firstResponseAt.getTime() - this.createdAt.getTime()) / (1000 * 60));
  }

  // 虛擬屬性：檢查是否為活躍會話
  get isActive(): boolean {
    return this.status === SessionStatus.ACTIVE || this.status === SessionStatus.WAITING;
  }

  // 虛擬屬性：檢查是否已關閉
  get isClosed(): boolean {
    return this.status === SessionStatus.CLOSED;
  }

  // 虛擬屬性：檢查是否有客服參與
  get hasHumanAgent(): boolean {
    return this.sessionType === SessionType.HUMAN || this.sessionType === SessionType.MIXED;
  }

  // 虛擬屬性：取得訊息數量
  get messageCount(): number {
    return this.messages ? this.messages.length : 0;
  }

  // 虛擬屬性：檢查是否超時（30分鐘無活動）
  get isTimeout(): boolean {
    if (!this.isActive) return false;
    const lastActivity = this.messages && this.messages.length > 0 
      ? this.messages[this.messages.length - 1].createdAt 
      : this.createdAt;
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    return lastActivity < thirtyMinutesAgo;
  }

  // 方法：關閉會話
  close(satisfactionRating?: number, satisfactionComment?: string): void {
    this.status = SessionStatus.CLOSED;
    this.closedAt = new Date();
    if (satisfactionRating) this.satisfactionRating = satisfactionRating;
    if (satisfactionComment) this.satisfactionComment = satisfactionComment;
  }

  // 方法：轉接到人工客服
  transferToHuman(agentId: string): void {
    this.sessionType = this.sessionType === SessionType.BOT ? SessionType.MIXED : SessionType.HUMAN;
    this.agentId = agentId;
    this.status = SessionStatus.ACTIVE;
  }

  // 方法：設定首次回應時間
  setFirstResponse(): void {
    if (!this.firstResponseAt) {
      this.firstResponseAt = new Date();
    }
  }

  // 方法：更新優先級
  updatePriority(priority: Priority): void {
    this.priority = priority;
  }

  // 兼容舊代碼：id 別名
  get id(): string {
    return this.supportSessionId;
  }
}
