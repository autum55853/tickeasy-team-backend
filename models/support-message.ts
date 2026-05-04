import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { User } from './user.js';

/* eslint-disable no-unused-vars */
export enum SenderType {
  USER = 'user',
  BOT = 'bot',
  AGENT = 'agent'
}

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  FILE = 'file',
  QUICK_REPLY = 'quick_reply',
  FAQ_SUGGESTION = 'faq_suggestion'
}
/* eslint-enable no-unused-vars */

interface MessageMetadata {
  confidence?: number;          // AI 回應信心度 (0-1)
  faqId?: number;              // 相關 FAQ ID
  intentType?: string;         // 意圖類型
  sentiment?: 'positive' | 'neutral' | 'negative';  // 情感分析
  transferReason?: string;     // 轉接原因
  fileUrl?: string;           // 檔案 URL
  fileName?: string;          // 檔案名稱
  fileSize?: number;          // 檔案大小
  quickReplies?: string[];    // 快速回覆選項
  suggestions?: Array<{       // FAQ 建議
    faqId: number;
    question: string;
    confidence: number;
  }>;
  processingTime?: number;    // 處理時間（毫秒）
  model?: string;             // 使用的 AI 模型
  tokens?: number;            // 使用的 token 數量
  responseId?: string;        // OpenAI Responses API 的回應 ID
}

@Entity('supportMessage')
export class SupportMessage {
  @PrimaryGeneratedColumn('uuid')
  supportMessageId: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @ManyToOne('SupportSession', 'messages')
  @JoinColumn({ name: 'sessionId' })
  session: any;

  @Column({ type: 'enum', enum: SenderType, enumName: 'SupportMessageSender' })
  senderType: SenderType;

  @Column({ type: 'uuid', nullable: true })
  senderId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'senderId' })
  sender: User;

  @Column({ type: 'text', nullable: true })
  messageText: string;

  @Column({ type: 'enum', enum: MessageType, enumName: 'SupportMessageType', default: MessageType.TEXT })
  messageType: MessageType;

  @Column({ type: 'jsonb', default: {} })
  metadata: MessageMetadata;

  @Column({ type: 'boolean', default: false })
  isRead: boolean;

  @CreateDateColumn()
  createdAt: Date;

  // 虛擬屬性：檢查是否為用戶訊息
  get isFromUser(): boolean {
    return this.senderType === SenderType.USER;
  }

  // 虛擬屬性：檢查是否為機器人訊息
  get isFromBot(): boolean {
    return this.senderType === SenderType.BOT;
  }

  // 虛擬屬性：檢查是否為客服訊息
  get isFromAgent(): boolean {
    return this.senderType === SenderType.AGENT;
  }

  // 虛擬屬性：檢查是否為檔案訊息
  get isFileMessage(): boolean {
    return this.messageType === MessageType.FILE || this.messageType === MessageType.IMAGE;
  }

  // 虛擬屬性：取得 AI 信心度
  get aiConfidence(): number | null {
    return this.metadata.confidence || null;
  }

  // 虛擬屬性：取得相關 FAQ ID
  get relatedFaqId(): number | null {
    return this.metadata.faqId || null;
  }

  // 虛擬屬性：取得情感分析結果
  get sentiment(): string | null {
    return this.metadata.sentiment || null;
  }

  // 虛擬屬性：檢查是否為低信心度回應
  get isLowConfidence(): boolean {
    return this.isFromBot && (this.metadata.confidence || 0) < 0.6;
  }

  // 虛擬屬性：取得處理時間
  get processingTimeMs(): number | null {
    return this.metadata.processingTime || null;
  }

  // 虛擬屬性：取得檔案資訊
  get fileInfo(): { url?: string; name?: string; size?: number } | null {
    if (!this.isFileMessage) return null;
    return {
      url: this.metadata.fileUrl,
      name: this.metadata.fileName,
      size: this.metadata.fileSize
    };
  }

  // 虛擬屬性：取得快速回覆選項
  get quickReplies(): string[] {
    return this.metadata.quickReplies || [];
  }

  // 虛擬屬性：取得 FAQ 建議
  get faqSuggestions(): Array<{ faqId: number; question: string; confidence: number }> {
    return this.metadata.suggestions || [];
  }

  // 方法：標記為已讀
  markAsRead(): void {
    this.isRead = true;
  }

  // 方法：設定 AI 信心度
  setAiConfidence(confidence: number): void {
    this.metadata = { ...this.metadata, confidence };
  }

  // 方法：設定相關 FAQ
  setRelatedFaq(faqId: number): void {
    this.metadata = { ...this.metadata, faqId };
  }

  // 方法：設定情感分析結果
  setSentiment(sentiment: 'positive' | 'neutral' | 'negative'): void {
    this.metadata = { ...this.metadata, sentiment };
  }

  // 方法：設定處理時間
  setProcessingTime(timeMs: number): void {
    this.metadata = { ...this.metadata, processingTime: timeMs };
  }

  // 方法：添加 FAQ 建議
  addFaqSuggestions(suggestions: Array<{ faqId: number; question: string; confidence: number }>): void {
    this.metadata = { ...this.metadata, suggestions };
  }

  // 方法：設定快速回覆選項
  setQuickReplies(replies: string[]): void {
    this.metadata = { ...this.metadata, quickReplies: replies };
  }

  // 方法：設定檔案資訊
  setFileInfo(url: string, name: string, size: number): void {
    this.metadata = { 
      ...this.metadata, 
      fileUrl: url, 
      fileName: name, 
      fileSize: size 
    };
  }

  // 方法：記錄 AI 使用情況
  recordAiUsage(model: string, tokens: number): void {
    this.metadata = { ...this.metadata, model, tokens };
  }

  // 兼容舊代碼
  get id(): string {
    return this.supportMessageId;
  }
}
