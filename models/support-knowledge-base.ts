import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('supportKnowledgeBase')
export class SupportKnowledgeBase {
  @PrimaryGeneratedColumn('uuid')
  supportKBId: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'text', array: true, default: [] })
  tags: string[];

  @Column({ type: 'varchar', length: 50, nullable: true })
  category: string;

  @Column({ type: 'jsonb', nullable: true })
  embeddingVector: number[];

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  // 智能回覆規則相關欄位
  @Column({ type: 'varchar', length: 100, nullable: true })
  ruleId: string; // 對應 smart-reply-rules 的 ID

  @Column({ type: 'varchar', length: 20, nullable: true })
  replyType: 'tutorial' | 'faq' | 'knowledge'; // 回覆類型

  @Column({ type: 'text', array: true, default: [] })
  keywords: string[]; // 關鍵字陣列

  @Column({ type: 'integer', default: 3 })
  priority: number; // 優先級 (1-3)

  // Tutorial 相關欄位
  @Column({ type: 'varchar', length: 500, nullable: true })
  tutorialUrl: string;

  @Column({ type: 'text', nullable: true })
  tutorialDescription: string;

  // FAQ 相關欄位
  @Column({ type: 'text', nullable: true })
  faqAnswer: string;

  @Column({ type: 'text', array: true, default: [] })
  relatedQuestions: string[];

  // 統計欄位
  @Column({ type: 'integer', default: 0 })
  viewCount: number;

  @Column({ type: 'integer', default: 0 })
  helpfulCount: number;

  @Column({ type: 'integer', default: 0 })
  notHelpfulCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // 虛擬屬性：檢查是否有嵌入向量
  get hasEmbedding(): boolean {
    return Boolean(this.embeddingVector && this.embeddingVector.length > 0);
  }

  // 虛擬屬性：取得標籤字串
  get tagString(): string {
    return this.tags.join(', ');
  }

  // 虛擬屬性：取得內容摘要（前100字元）
  get contentSummary(): string {
    if (this.content.length <= 100) return this.content;
    return this.content.substring(0, 100) + '...';
  }

  // 虛擬屬性：檢查是否包含特定標籤
  hasTag(tag: string): boolean {
    return this.tags.some(t => t.toLowerCase() === tag.toLowerCase());
  }

  // 方法：添加標籤
  addTag(tag: string): void {
    const normalizedTag = tag.trim().toLowerCase();
    if (!this.hasTag(normalizedTag)) {
      this.tags.push(normalizedTag);
    }
  }

  // 方法：移除標籤
  removeTag(tag: string): void {
    const normalizedTag = tag.toLowerCase();
    this.tags = this.tags.filter(t => t.toLowerCase() !== normalizedTag);
  }

  // 方法：設定嵌入向量
  setEmbedding(vector: number[]): void {
    this.embeddingVector = vector;
  }

  // 方法：清除嵌入向量
  clearEmbedding(): void {
    this.embeddingVector = [];
  }

  // 方法：更新內容並清除舊的嵌入向量
  updateContent(newContent: string): void {
    this.content = newContent;
    this.clearEmbedding(); // 內容變更時需要重新生成嵌入向量
  }

  // 方法：檢查內容是否包含關鍵字
  containsKeyword(keyword: string): boolean {
    const lowerKeyword = keyword.toLowerCase();
    return this.title.toLowerCase().includes(lowerKeyword) ||
           this.content.toLowerCase().includes(lowerKeyword) ||
           this.tags.some(tag => tag.toLowerCase().includes(lowerKeyword));
  }

  // 智能回覆相關方法
  
  // 檢查是否匹配關鍵字
  matchesKeywords(userInput: string): boolean {
    if (!this.keywords || this.keywords.length === 0) return false;
    
    const lowerInput = userInput.toLowerCase();
    return this.keywords.some(keyword => 
      lowerInput.includes(keyword.toLowerCase())
    );
  }

  // 計算關鍵字匹配分數
  calculateKeywordScore(userInput: string): number {
    if (!this.keywords || this.keywords.length === 0) return 0;
    
    const lowerInput = userInput.toLowerCase().trim();
    let matchCount = 0;
    let totalScore = 0;
    let hasExactMatch = false;
    let hasCoreKeyword = false;
    
    // 核心功能關鍵字清單（單純詞彙需要特殊保護）
    const coreKeywords = [
      '註冊', '登入', '購票', '買票', '退票', '取票', '領票',
      '忘記密碼', '修改密碼', '付款方式', '客服時間', '電子票'
    ];
    
    this.keywords.forEach(keyword => {
      const lowerKeyword = keyword.toLowerCase();
      if (lowerInput.includes(lowerKeyword)) {
        matchCount++;
        
        // 檢查是否完全匹配
        if (lowerInput === lowerKeyword) {
          hasExactMatch = true;
        }
        
        // 檢查是否為核心關鍵字
        if (coreKeywords.includes(lowerKeyword)) {
          hasCoreKeyword = true;
        }
        
        // 關鍵字越長，分數越高，並增加基礎分數
        totalScore += (lowerKeyword.length / 5) + 0.5;
      }
    });
    
    if (matchCount === 0) return 0;
    
    // 改進的分數計算
    let baseScore = Math.min(matchCount * 0.3, 1.0); // 每匹配一個關鍵字得 0.3 分
    const lengthBonus = totalScore / matchCount; // 平均長度獎勵
    
    // 🎯 優化權重策略
    let priorityWeight;
    if (this.priority === 1) {
      priorityWeight = 1.2;
    } else if (this.priority === 2) {
      priorityWeight = 0.8;
    } else {
      // Priority 3 的特殊處理
      if (hasCoreKeyword && hasExactMatch) {
        // 核心關鍵字完全匹配：提高權重到 0.8
        priorityWeight = 0.8;
        console.log(`🎯 核心關鍵字完全匹配獎勵: "${lowerInput}" 權重提升至 0.8`);
      } else if (hasCoreKeyword) {
        // 包含核心關鍵字：提高權重到 0.7
        priorityWeight = 0.7;
        console.log(`🎯 核心關鍵字獎勵: "${lowerInput}" 權重提升至 0.7`);
      } else {
        priorityWeight = 0.5;
      }
    }
    
    // 🚀 完全匹配獎勵
    if (hasExactMatch) {
      baseScore = Math.min(baseScore * 1.2, 1.0); // 完全匹配額外 20% 獎勵
      console.log(`🎯 完全匹配獎勵: "${lowerInput}" baseScore 提升 20%`);
    }
    
    const finalScore = Math.min(baseScore * lengthBonus * priorityWeight, 1.0);
    
    if (hasCoreKeyword) {
      console.log(`🧮 核心關鍵字分數計算: 
        - 輸入: "${lowerInput}"
        - 匹配數: ${matchCount}
        - baseScore: ${baseScore.toFixed(4)}
        - lengthBonus: ${lengthBonus.toFixed(4)}
        - priorityWeight: ${priorityWeight}
        - 最終分數: ${finalScore.toFixed(4)}`);
    }
    
    return finalScore;
  }

  // 檢查是否為圖文教學
  get isTutorial(): boolean {
    return this.replyType === 'tutorial';
  }

  // 檢查是否為 FAQ
  get isFAQ(): boolean {
    return this.replyType === 'faq';
  }

  // 檢查是否為一般知識庫
  get isKnowledge(): boolean {
    return this.replyType === 'knowledge';
  }

  // 取得回覆內容
  getReplyContent(): string {
    if (this.isFAQ && this.faqAnswer) {
      return this.faqAnswer;
    }
    return this.content;
  }

  // 取得回覆 URL（如果是教學類型）
  getReplyUrl(): string | null {
    if (this.isTutorial && this.tutorialUrl) {
      return this.tutorialUrl;
    }
    return null;
  }

  // 增加有用計數
  incrementHelpful(): void {
    this.helpfulCount++;
  }

  // 增加無用計數
  incrementNotHelpful(): void {
    this.notHelpfulCount++;
  }

  // 增加查看計數
  incrementView(): void {
    this.viewCount++;
  }

  // 取得滿意度分數
  get satisfactionScore(): number {
    const total = this.helpfulCount + this.notHelpfulCount;
    if (total === 0) return 0;
    return this.helpfulCount / total;
  }

  // 兼容舊代碼
  get id(): string {
    return this.supportKBId;
  }
}
