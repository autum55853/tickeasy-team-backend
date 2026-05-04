import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.js';

// 工作日枚舉
/* eslint-disable no-unused-vars */
export enum DayOfWeek {
  SUNDAY = 0,
  MONDAY = 1,
  TUESDAY = 2,
  WEDNESDAY = 3,
  THURSDAY = 4,
  FRIDAY = 5,
  SATURDAY = 6
}
/* eslint-enable no-unused-vars */

@Entity('supportSchedule')
export class SupportSchedule {
  @PrimaryGeneratedColumn('uuid')
  supportScheduleId: string;

  @Column({ type: 'uuid' })
  agentId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'agentId' })
  agent: User;

  @Column({ type: 'int' })
  dayOfWeek: DayOfWeek;

  @Column({ type: 'time' })
  startTime: string;

  @Column({ type: 'time' })
  endTime: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // 虛擬屬性：取得星期名稱
  get dayName(): string {
    const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    return days[this.dayOfWeek];
  }

  // 虛擬屬性：取得英文星期名稱
  get dayNameEn(): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[this.dayOfWeek];
  }

  // 虛擬屬性：取得工作時間範圍字串
  get timeRange(): string {
    return `${this.startTime} - ${this.endTime}`;
  }

  // 虛擬屬性：計算工作時長（小時）
  get workingHours(): number {
    const start = this.parseTime(this.startTime);
    const end = this.parseTime(this.endTime);
    
    let diff = end - start;
    if (diff < 0) {
      // 跨日情況（如：22:00 - 06:00）
      diff += 24 * 60;
    }
    
    return diff / 60; // 轉換為小時
  }

  // 虛擬屬性：檢查是否為全天工作
  get isFullDay(): boolean {
    return this.workingHours >= 24;
  }

  // 虛擬屬性：檢查是否為跨日工作
  get isCrossDay(): boolean {
    const start = this.parseTime(this.startTime);
    const end = this.parseTime(this.endTime);
    return end < start;
  }

  // 方法：解析時間字串為分鐘數
  private parseTime(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  // 方法：檢查指定時間是否在工作時間內
  isWorkingTime(time: string): boolean {
    const checkTime = this.parseTime(time);
    const start = this.parseTime(this.startTime);
    const end = this.parseTime(this.endTime);

    if (this.isCrossDay) {
      // 跨日情況：時間在開始時間之後或結束時間之前
      return checkTime >= start || checkTime <= end;
    } else {
      // 一般情況：時間在開始和結束時間之間
      return checkTime >= start && checkTime <= end;
    }
  }

  // 方法：檢查現在是否在工作時間內
  isCurrentlyWorking(): boolean {
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = now.toTimeString().substring(0, 5); // HH:MM 格式

    return this.dayOfWeek === currentDay && 
           this.isActive && 
           this.isWorkingTime(currentTime);
  }

  // 方法：取得下次工作時間
  getNextWorkingTime(): Date | null {
    if (!this.isActive) return null;

    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = now.toTimeString().substring(0, 5);

    // 如果今天是工作日且還在工作時間內
    if (this.dayOfWeek === currentDay && this.isWorkingTime(currentTime)) {
      return now;
    }

    // 計算下次工作時間
    const nextWorkingDate = new Date();
    let daysUntilNextWork = this.dayOfWeek - currentDay;
    
    if (daysUntilNextWork <= 0) {
      daysUntilNextWork += 7; // 下週的同一天
    }
    
    nextWorkingDate.setDate(nextWorkingDate.getDate() + daysUntilNextWork);
    
    const [hours, minutes] = this.startTime.split(':').map(Number);
    nextWorkingDate.setHours(hours, minutes, 0, 0);
    
    return nextWorkingDate;
  }

  // 方法：驗證時間格式
  static isValidTimeFormat(time: string): boolean {
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(time);
  }

  // 方法：驗證工作時間設定
  validateSchedule(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!SupportSchedule.isValidTimeFormat(this.startTime)) {
      errors.push('開始時間格式不正確');
    }

    if (!SupportSchedule.isValidTimeFormat(this.endTime)) {
      errors.push('結束時間格式不正確');
    }

    if (this.dayOfWeek < 0 || this.dayOfWeek > 6) {
      errors.push('星期設定不正確');
    }

    if (this.workingHours > 24) {
      errors.push('工作時間不能超過24小時');
    }

    if (this.workingHours < 0.5) {
      errors.push('工作時間不能少於30分鐘');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // 兼容舊代碼
  get id(): string {
    return this.supportScheduleId;
  }
}
