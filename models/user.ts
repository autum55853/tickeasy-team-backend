/**
 * 用戶模型
 *
 * 使用 TypeORM 的裝飾器語法定義實體和屬性
 */

import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    DeleteDateColumn,
    OneToMany,
    Index,
    BeforeInsert,
    BeforeUpdate,
} from 'typeorm';
import bcrypt from 'bcrypt';
// import crypto from 'crypto';
import { Ticket } from './ticket.js';
import { Order } from './order.js';
import { Organization } from './organization.js';

/* eslint-disable no-unused-vars */
export enum UserRole {
    USER = 'user',
    ADMIN = 'admin',
    SUPERUSER = 'superuser',
}
export enum Gender {
    MALE = 'male',
    FEMALE = 'female',
    OTHER = 'other',
}

/**
 * 用戶偏好地區枚舉
 */

/* eslint-disable no-unused-vars */
export enum Region {
    NORTH = '北部',
    SOUTH = '南部',
    EAST = '東部',
    CENTRAL = '中部',
    ISLANDS = '離島',
    OVERSEAS = '海外',
}
/**
 * 提供 Region 枚舉的選項列表 (供前端使用)
 */

export const RegionOptions = Object.entries(Region).map(([key, value]) => ({
    key: key,
    value: value,
}));

/**
 * 用戶偏好活動類型枚舉
 */

export enum EventType {
    POP = '流行音樂',
    ROCK = '搖滾',
    ELECTRONIC = '電子音樂',
    HIP_HOP = '嘻哈',
    JAZZ_BLUES = '爵士藍調',
    CLASSICAL = '古典音樂',
    OTHER = '其他',
}

/**
 * 提供 EventType 枚舉的選項列表 (供前端使用)
 */
export const EventTypeOptions = Object.entries(EventType).map(
    ([key, value]) => ({
        key: key,
        value: value,
    })
);

// OAuth Provider 介面定義
export interface OAuthProvider {
    provider: string;
    providerId: string;
    accessToken: string;
    refreshToken?: string;
    tokenExpiresAt: Date;
}

// 搜尋歷史項目介面
export interface SearchHistoryItem {
    query: string;
    timestamp: Date;
    category?: string;
}

@Entity('users')
export class User {
    @PrimaryGeneratedColumn('uuid', { name: 'userId' })
    userId: string;

    // 別名以兼容舊代碼
    get id(): string {
        return this.userId;
    }

    @Column({ type: 'varchar', length: 100, unique: true, nullable: false })
    @Index()
    email: string;

    @Column({ type: 'varchar', length: 60, nullable: true, select: false })
    password: string;

    @Column({ type: 'varchar', length: 50, nullable: false })
    name: string;

    @Column({ type: 'varchar', length: 20, nullable: true })
    nickname: string;

    @Column({
        type: 'enum',
        enum: UserRole,
        default: UserRole.USER,
    })
    @Index()
    role: UserRole;

    @Column({ type: 'varchar', length: 20, nullable: true })
    phone: string;

    @Column({ type: 'date', nullable: true })
    birthday: Date | null;

    @Column({
        type: 'enum',
        enum: Gender,
        nullable: true,
    })
    gender: Gender | null;

    @Column({
        type: 'enum',
        enum: Region,
        array: true,
        nullable: true,
        default: '{}',
    })
    preferredRegions: Region[];

    @Column({
        type: 'enum',
        enum: EventType,
        array: true,
        nullable: true,
        default: '{}',
    })
    preferredEventTypes: EventType[];

    @Column({ type: 'varchar', length: 20, nullable: true })
    country: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    address: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    avatar: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    verificationToken: string;

    @Column({ type: 'timestamp', nullable: true })
    verificationTokenExpires: Date;

    @Column({ type: 'boolean', default: false, nullable: false })
    isEmailVerified: boolean;

    @Column({ type: 'varchar', length: 50, nullable: true })
    passwordResetToken: string;

    @Column({ type: 'timestamp', nullable: true })
    passwordResetExpires: Date;

    @Column({ type: 'timestamp', nullable: true })
    lastVerificationAttempt: Date;

    @Column({ type: 'timestamp', nullable: true })
    lastPasswordResetAttempt: Date;

    @Column('jsonb', { default: '[]', nullable: false })
    oauthProviders: OAuthProvider[];

    @Column('jsonb', { default: '[]', nullable: true })
    searchHistory: SearchHistoryItem[];

    @CreateDateColumn({ nullable: false })
    createdAt: Date;

    @UpdateDateColumn({ nullable: false })
    updatedAt: Date;

    @DeleteDateColumn({ nullable: true })
    deletedAt: Date;

    @OneToMany(() => Ticket, ticket => ticket.user)
    tickets: Ticket[];

    @OneToMany(() => Order, order => order.user)
    orders: Order[];

    @OneToMany('Organization', 'user')
    organizations: Organization[];

    @BeforeInsert()
    @BeforeUpdate()
    async hashPassword() {
        // Check if password exists and if it's likely *not* already hashed
        // Common bcrypt hash prefixes: $2a$, $2b$, $2y$
        // If it doesn't look like a hash, hash it.
        if (this.password && !/^\$2[aby]\$/.test(this.password)) {
            this.password = await bcrypt.hash(this.password, 12);
        }
    }

    /**
     * 比較密碼
     * @param candidatePassword 候選密碼
     * @returns 密碼是否匹配
     */
    async comparePassword(candidatePassword: string): Promise<boolean> {
        // Ensure this.password is not null or undefined before comparing
        if (!this.password) {
            return false;
        }
        return bcrypt.compare(candidatePassword, this.password);
    }

    /**
     * 創建驗證碼
     * @returns 驗證碼和令牌
     */
    async createVerificationToken(): Promise<{ token: string; code: string }> {
        // 生成6位數驗證碼
        const code = Array(6)
            .fill(0)
            .map(() => Math.floor(Math.random() * 10))
            .join('');

        // 存儲驗證碼和過期時間
        this.verificationToken = code;
        this.verificationTokenExpires = new Date(Date.now() + 10 * 60 * 1000); // 10分鐘
        this.lastVerificationAttempt = new Date();

        return { token: '', code };
    }

    /**
     * 創建密碼重置碼
     * @returns 密碼重置碼和令牌
     */
    async createPasswordResetToken(): Promise<{ token: string; code: string }> {
        // 生成6位數重置碼
        const code = Array(6)
            .fill(0)
            .map(() => Math.floor(Math.random() * 10))
            .join('');

        // 存儲重置碼和過期時間
        this.passwordResetToken = code;
        this.passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10分鐘
        this.lastPasswordResetAttempt = new Date();

        return { token: '', code };
    }
}
