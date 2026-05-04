/**
 * 演唱會搜索服務
 * 為客服系統提供演唱會查詢功能
 * 支援藝人名、地區、時間、場地等多維度搜索
 */

import { AppDataSource } from '../config/database.js';
import { Concert } from '../models/concert.js';
import { ConcertSession } from '../models/concert-session.js';
import { Venue } from '../models/venue.js';
import { LocationTag } from '../models/location-tag.js';
import { MusicTag } from '../models/music-tag.js';
import { Brackets, IsNull } from 'typeorm';

/* eslint-disable no-unused-vars */
// 查詢意圖枚舉
export enum SearchIntent {
  ARTIST = 'artist',           // 藝人名查詢
  LOCATION = 'location',       // 地區查詢  
  VENUE = 'venue',            // 場地查詢
  DATE_RANGE = 'date_range',   // 時間範圍查詢
  GENRE = 'genre',            // 音樂類型查詢
  GENERAL = 'general'         // 一般關鍵字查詢
}
/* eslint-enable no-unused-vars */

// 查詢參數介面
export interface ConcertSearchParams {
  query: string;
  intent?: SearchIntent;
  limit?: number;
  includeUpcoming?: boolean;
  includeOngoing?: boolean;
  includePast?: boolean;
}

// 搜索結果介面
export interface ConcertSearchResult {
  concertId: string;
  title: string;
  artist?: string;
  introduction?: string;
  location: string;
  address: string;
  venue?: {
    name: string;
    capacity?: number;
    facilities: string[];
  };
  dateRange: {
    start: Date;
    end: Date;
  };
  sessions: {
    sessionId: string;
    title?: string;
    date: Date;
    startTime: string;
    endTime: string;
    ticketPriceRange?: {
      min: number;
      max: number;
    };
  }[];
  tags: {
    location?: string;
    music?: string;
  };
  imageUrl?: string;
  status: string;
  relevanceScore: number;
}

// 格式化回覆介面
export interface FormattedConcertReply {
  message: string;
  concerts: ConcertSearchResult[];
  summary: {
    totalFound: number;
    upcomingCount: number;
    locationSummary: string[];
    priceRange?: {
      min: number;
      max: number;
    };
  };
}

export class ConcertSearchService {
  private concertRepo = AppDataSource.getRepository(Concert);
  private sessionRepo = AppDataSource.getRepository(ConcertSession);
  private venueRepo = AppDataSource.getRepository(Venue);
  private locationTagRepo = AppDataSource.getRepository(LocationTag);
  private musicTagRepo = AppDataSource.getRepository(MusicTag);

  /**
   * 主要搜索方法
   */
  async searchConcerts(params: ConcertSearchParams): Promise<ConcertSearchResult[]> {
    try {
      console.log(`🎵 搜索演唱會: "${params.query}"`);
      
      // 1. 檢查是否詢問範圍外場地
      const unsupportedVenueMessage = this.checkUnsupportedVenue(params.query);
      if (unsupportedVenueMessage) {
        console.log(`⚠️ 偵測到範圍外場地查詢: "${params.query}"`);
        return []; // 返回空結果，讓上層處理範圍外回覆
      }
      
      // 2. 分析查詢意圖
      const intent = params.intent || await this.analyzeSearchIntent(params.query);
      
      // 3. 根據意圖執行搜索
      const results = await this.executeSearch(params.query, intent, params);
      
      // 4. 計算相關性分數並排序
      const scoredResults = await this.calculateRelevanceScores(results, params.query);
      
      // 5. 限制結果數量
      const limit = params.limit || 5;
      
      console.log(`✅ 找到 ${scoredResults.length} 個演唱會結果`);
      return scoredResults.slice(0, limit);
      
    } catch (error) {
      console.error('❌ 演唱會搜索失敗:', error);
      return [];
    }
  }

  /**
   * 檢查是否詢問不支援的場地
   */
  private checkUnsupportedVenue(query: string): string | null {
    const unsupportedVenues = [
      '台北巨蛋', '高雄巨蛋', '桃園巨蛋', '台南巨蛋',
      '洲際棒球場', '台中洲際', '新竹棒球場', 
      '國家體育場', '小港機場', '松山機場',
      '世運主場館', '高雄世運', '澄清湖棒球場',
      '花蓮棒球場', '斗六棒球場', '嘉義棒球場',
      '中華電信會議中心', '君悅酒店', '圓山飯店',
      '展覽館', '世貿', '南港展覽館', '信義威秀',
      '夢時代', '統一夢時代', '義大世界', '劍湖山',
      '六福村', '遊樂園'
    ];

    const lowerQuery = query.toLowerCase();
    const foundUnsupportedVenue = unsupportedVenues.find(venue => 
      lowerQuery.includes(venue.toLowerCase())
    );

    return foundUnsupportedVenue || null;
  }

  /**
   * 從查詢中提取場地關鍵詞
   */
  private extractVenueKeywords(query: string): string[] {
    const lowerQuery = query.toLowerCase();
    
    // 場地相關關鍵字
    const venueKeywords = [
      '森林音樂城', '流行音樂中心', '天空演藝中心', '光譜音樂會場', '城市體育館',
      '河岸留言', '西門紅樓', '夢想體育場', '銀河演奏廳', '星光大劇院', '陽光音樂廣場',
      '風之大舞台', '極光展演中心', '曙光體育館', '黎明演奏館', '藍海演唱會場地',
      '海岸音樂祭', '星辰展演空間', '城市音樂公園', '彩虹文化中心', '台北小巨蛋',
      '夏日音樂舞台', '光之音樂廳', 'Legacy', '華山1914'
    ];
    
    // 找出查詢中包含的場地關鍵詞
    const foundKeywords = venueKeywords.filter(keyword => 
      lowerQuery.includes(keyword.toLowerCase())
    );
    
    return foundKeywords;
  }

  /**
   * 從查詢中提取地區關鍵詞
   */
  private extractLocationKeywords(query: string): string[] {
    const lowerQuery = query.toLowerCase();
    
    // 地區相關關鍵字
    const locationKeywords = [
      // 直轄市/縣市
      '台北', '新北', '桃園', '新竹', '苗栗', '台中', '彰化', '南投',
      '雲林', '嘉義', '台南', '高雄', '屏東', '宜蘭', '花蓮', '台東', '澎湖',
      // 區/市/鄉鎮
      '板橋', '豐原', '新營', '橫山', '蘆竹', '北港', '古坑', '關山', '馬公',
      '松山', '萬華', '中正', '光明', '劍南', '光華', '石牌', '和平', '景美',
      '萬隆', '勝利', '中山', '文昌', '大坪', '五福', '育英', '民富', '劍潭'
    ];
    
    // 找出查詢中包含的地區關鍵詞
    const foundKeywords = locationKeywords.filter(keyword => 
      lowerQuery.includes(keyword.toLowerCase())
    );
    
    return foundKeywords;
  }

  /**
   * 分析搜索意圖
   */
  private async analyzeSearchIntent(query: string): Promise<SearchIntent> {
    const lowerQuery = query.toLowerCase();
    
    // 時間相關關鍵字
    const timeKeywords = [
      '今天', '明天', '這週', '下週', '這個月', '下個月', '今年', '明年',
      '週末', '假日', '最近', '即將', '年底', '聖誕', '跨年',
      '1月', '2月', '3月', '4月', '5月', '6月', 
      '7月', '8月', '9月', '10月', '11月', '12月'
    ];
    
    // 地區相關關鍵字
    const locationKeywords = [
      // 直轄市/縣市
      '台北', '新北', '桃園', '新竹', '苗栗', '台中', '彰化', '南投',
      '雲林', '嘉義', '台南', '高雄', '屏東', '宜蘭', '花蓮', '台東', '澎湖',
      // 區/市/鄉鎮 (根據實際場地資料)
      '板橋', '豐原', '新營', '橫山', '蘆竹', '北港', '古坑', '關山', '馬公',
      '松山', '萬華', '中正', '光明', '劍南', '光華', '石牌', '和平', '景美',
      '萬隆', '勝利', '中山', '文昌', '大坪', '五福', '育英', '民富', '劍潭',
      // 大區域
      '北部', '中部', '南部', '東部', '北台灣', '南台灣', '離島',
      // 場地類型關鍵字
      '市政府', '體育場', '演藝廳', '音樂廳', '巨蛋', '小巨蛋', '文化中心',
      '展演館', '音樂中心', '藝術中心', '國際會議中心'
    ];
    
    // 場地相關關鍵字
    const venueKeywords = [
      // 實際場地名稱
      '森林音樂城', '流行音樂中心', '天空演藝中心', '光譜音樂會場', '城市體育館',
      '河岸留言', '西門紅樓', '夢想體育場', '銀河演奏廳', '星光大劇院', '陽光音樂廣場',
      '風之大舞台', '極光展演中心', '曙光體育館', '黎明演奏館', '藍海演唱會場地',
      '海岸音樂祭', '星辰展演空間', '城市音樂公園', '彩虹文化中心', '台北小巨蛋',
      '夏日音樂舞台', '光之音樂廳', 'Legacy', '華山1914',
      // 場地類型關鍵字
      '小巨蛋', '巨蛋', '體育場', '演藝廳', '音樂廳', '文化中心',
      '展演館', '音樂中心', '藝術中心', '國際會議中心', '演奏廳', '劇院',
      '音樂廣場', '大舞台', '展演中心', '演奏館', '音樂公園', '音樂舞台'
    ];
    
    // 音樂類型關鍵字
    const genreKeywords = [
      '流行', '搖滾', '爵士', '古典', '電音', '嘻哈', '民謠', '獨立',
      '演唱會', '音樂會', '演奏會', '音樂節', '演出'
    ];

    // 判斷意圖優先級
    if (timeKeywords.some(keyword => lowerQuery.includes(keyword))) {
      return SearchIntent.DATE_RANGE;
    }
    
    if (venueKeywords.some(keyword => lowerQuery.includes(keyword))) {
      return SearchIntent.VENUE;
    }
    
    if (locationKeywords.some(keyword => lowerQuery.includes(keyword))) {
      return SearchIntent.LOCATION;
    }
    
    if (genreKeywords.some(keyword => lowerQuery.includes(keyword))) {
      return SearchIntent.GENRE;
    }
    
    // 預設為藝人名查詢
    return SearchIntent.ARTIST;
  }

  /**
   * 執行搜索
   */
  private async executeSearch(
    query: string, 
    intent: SearchIntent, 
    params: ConcertSearchParams
  ): Promise<Concert[]> {
    const queryBuilder = this.concertRepo.createQueryBuilder('concert')
      .leftJoinAndSelect('concert.venue', 'venue')
      .leftJoinAndSelect('concert.locationTag', 'locationTag')
      .leftJoinAndSelect('concert.musicTag', 'musicTag')
      .leftJoinAndSelect('concert.organization', 'organization')
      .leftJoinAndSelect('concert.sessions', 'sessions')
      .leftJoinAndSelect('sessions.ticketTypes', 'ticketTypes')
      .where('concert.conInfoStatus = :status', { status: 'published' })
      .andWhere('concert.cancelledAt IS NULL');

    // 根據意圖添加搜索條件
    switch (intent) {
      case SearchIntent.ARTIST:
        queryBuilder.andWhere(
          '(concert.conTitle ILIKE :query OR concert.conIntroduction ILIKE :query)',
          { query: `%${query}%` }
        );
        break;

      case SearchIntent.LOCATION: {
        // 從查詢中提取地區關鍵詞
        const locationKeywords = this.extractLocationKeywords(query);
        if (locationKeywords.length > 0) {
          queryBuilder.andWhere(
            new Brackets(qb => {
              locationKeywords.forEach((keyword: string, index: number) => {
                const paramName = `locKeyword${index}`;
                if (index === 0) {
                  qb.where(`(concert.conLocation ILIKE :${paramName} OR concert.conAddress ILIKE :${paramName} OR venue.venueName ILIKE :${paramName} OR venue.venueAddress ILIKE :${paramName} OR locationTag.locationTagName ILIKE :${paramName})`, 
                    { [paramName]: `%${keyword}%` });
                } else {
                  qb.orWhere(`(concert.conLocation ILIKE :${paramName} OR concert.conAddress ILIKE :${paramName} OR venue.venueName ILIKE :${paramName} OR venue.venueAddress ILIKE :${paramName} OR locationTag.locationTagName ILIKE :${paramName})`, 
                    { [paramName]: `%${keyword}%` });
                }
              });
            })
          );
        } else {
          queryBuilder.andWhere(
            new Brackets(qb => {
              qb.where('concert.conLocation ILIKE :query', { query: `%${query}%` })
                .orWhere('concert.conAddress ILIKE :query', { query: `%${query}%` })
                .orWhere('venue.venueName ILIKE :query', { query: `%${query}%` })
                .orWhere('venue.venueAddress ILIKE :query', { query: `%${query}%` })
                .orWhere('locationTag.locationTagName ILIKE :query', { query: `%${query}%` });
            })
          );
        }
        break;
      }
      case SearchIntent.VENUE: {
        // 從查詢中提取場地關鍵詞
        const venueKeywords = this.extractVenueKeywords(query);
        if (venueKeywords.length > 0) {
          queryBuilder.andWhere(
            new Brackets(qb => {
                             venueKeywords.forEach((keyword: string, index: number) => {
                 if (index === 0) {
                   qb.where('venue.venueName ILIKE :keyword0', { ['keyword0']: `%${keyword}%` });
                 } else {
                   qb.orWhere(`venue.venueName ILIKE :keyword${index}`, { [`keyword${index}`]: `%${keyword}%` });
                 }
               });
            })
          );
        } else {
          queryBuilder.andWhere(
            'venue.venueName ILIKE :query',
            { query: `%${query}%` }
          );
        }
        break;
      }
      case SearchIntent.GENRE:
        queryBuilder.andWhere(
          new Brackets(qb => {
            qb.where('musicTag.musicTagName ILIKE :query', { query: `%${query}%` })
              .orWhere('concert.conTitle ILIKE :query', { query: `%${query}%` })
              .orWhere('concert.conIntroduction ILIKE :query', { query: `%${query}%` });
          })
        );
        break;

      case SearchIntent.DATE_RANGE: {
        const dateRange = this.parseDateFromQuery(query);
        if (dateRange.start) {
          queryBuilder.andWhere('concert.eventStartDate >= :startDate', { 
            startDate: dateRange.start 
          });
        }
        if (dateRange.end) {
          queryBuilder.andWhere('concert.eventEndDate <= :endDate', { 
            endDate: dateRange.end 
          });
        }
        break;
      }
      default:
        // 一般查詢：搜索所有文字欄位
        queryBuilder.andWhere(
          new Brackets(qb => {
            qb.where('concert.conTitle ILIKE :query', { query: `%${query}%` })
              .orWhere('concert.conIntroduction ILIKE :query', { query: `%${query}%` })
              .orWhere('concert.conLocation ILIKE :query', { query: `%${query}%` })
              .orWhere('venue.venueName ILIKE :query', { query: `%${query}%` })
              .orWhere('organization.orgName ILIKE :query', { query: `%${query}%` });
          })
        );
    }

    // 時間範圍過濾
    const now = new Date();
    
    // 根據查詢意圖決定時間過濾策略
    if (intent === SearchIntent.VENUE || intent === SearchIntent.LOCATION) {
      // 場地/地區查詢：顯示所有相關活動（包括最近3個月內的活動）
      const threeMonthsAgo = new Date(now);
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      queryBuilder.andWhere('concert.eventEndDate >= :threeMonthsAgo', { threeMonthsAgo });
    } else if (params.includeUpcoming !== false) {
      // 其他查詢：預設只顯示未來的演唱會
      queryBuilder.andWhere('concert.eventStartDate >= :now', { now });
    }

    return await queryBuilder
      .orderBy('concert.eventStartDate', 'ASC')
      .addOrderBy('concert.visitCount', 'DESC')
      .getMany();
  }

  /**
   * 從查詢中解析日期範圍
   */
  private parseDateFromQuery(query: string): { start?: Date; end?: Date } {
    const now = new Date();
    const lowerQuery = query.toLowerCase();

    if (lowerQuery.includes('今天')) {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return {
        start: today,
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000)
      };
    }

    if (lowerQuery.includes('明天')) {
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      return {
        start: tomorrow,
        end: new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000)
      };
    }

    if (lowerQuery.includes('這週') || lowerQuery.includes('本週')) {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      return { start: startOfWeek, end: endOfWeek };
    }

    if (lowerQuery.includes('下週')) {
      const startOfNextWeek = new Date(now);
      startOfNextWeek.setDate(now.getDate() - now.getDay() + 7);
      const endOfNextWeek = new Date(startOfNextWeek);
      endOfNextWeek.setDate(startOfNextWeek.getDate() + 6);
      return { start: startOfNextWeek, end: endOfNextWeek };
    }

    if (lowerQuery.includes('這個月') || lowerQuery.includes('本月')) {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { start: startOfMonth, end: endOfMonth };
    }

    if (lowerQuery.includes('下個月')) {
      const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const endOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0);
      return { start: startOfNextMonth, end: endOfNextMonth };
    }

    // 預設返回未來一個月
    if (lowerQuery.includes('最近') || lowerQuery.includes('即將')) {
      return {
        start: now,
        end: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      };
    }

    return {};
  }

  /**
   * 計算相關性分數
   */
  private async calculateRelevanceScores(
    concerts: Concert[], 
    query: string
  ): Promise<ConcertSearchResult[]> {
    const results: ConcertSearchResult[] = [];
    const lowerQuery = query.toLowerCase();

    for (const concert of concerts) {
      let score = 0;
      
      // 標題匹配 (最高權重)
      if (concert.conTitle?.toLowerCase().includes(lowerQuery)) {
        score += 10;
      }
      
      // 藝人名/組織名匹配
      if (concert.organization?.orgName?.toLowerCase().includes(lowerQuery)) {
        score += 8;
      }
      
      // 地點匹配
      if (concert.conLocation?.toLowerCase().includes(lowerQuery) || 
          concert.venue?.venueName?.toLowerCase().includes(lowerQuery)) {
        score += 6;
      }
      
      // 描述匹配
      if (concert.conIntroduction?.toLowerCase().includes(lowerQuery)) {
        score += 4;
      }
      
      // 標籤匹配
      if (concert.locationTag?.locationTagName?.toLowerCase().includes(lowerQuery) ||
          concert.musicTag?.musicTagName?.toLowerCase().includes(lowerQuery)) {
        score += 5;
      }

      // 基於人氣的獎勵分數
      score += Math.min(concert.visitCount / 100, 5);

      // 轉換為結果格式
      const result = await this.transformToSearchResult(concert, score);
      results.push(result);
    }

    return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * 轉換為搜索結果格式
   */
  private async transformToSearchResult(concert: Concert, score: number): Promise<ConcertSearchResult> {
    // 計算票價範圍
    if (concert.sessions && concert.sessions.length > 0) {
      const allPrices: number[] = [];
      concert.sessions.forEach(session => {
        if (session.ticketTypes) {
          session.ticketTypes.forEach(ticket => {
            if (ticket.ticketTypePrice) {
              allPrices.push(ticket.ticketTypePrice);
            }
          });
        }
      });
      
      if (allPrices.length > 0) {
        // ticketPriceRange is unused
      }
    }

    // 場地設施
    const facilities = [];
    if (concert.venue) {
      if (concert.venue.isAccessible) facilities.push('無障礙設施');
      if (concert.venue.hasParking) facilities.push('停車場');
      if (concert.venue.hasTransit) facilities.push('大眾運輸');
    }

    return {
      concertId: concert.concertId,
      title: concert.conTitle,
      artist: concert.organization?.orgName,
      introduction: concert.conIntroduction,
      location: concert.conLocation || '',
      address: concert.conAddress || '',
      venue: concert.venue ? {
        name: concert.venue.venueName,
        capacity: concert.venue.venueCapacity,
        facilities
      } : undefined,
      dateRange: {
        start: concert.eventStartDate || new Date(),
        end: concert.eventEndDate || new Date()
      },
      sessions: (concert.sessions || []).map(session => ({
        sessionId: session.sessionId,
        title: session.sessionTitle,
        date: session.sessionDate,
        startTime: session.sessionStart,
        endTime: session.sessionEnd,
        ticketPriceRange: session.ticketTypes?.length > 0 ? {
          min: Math.min(...session.ticketTypes.map(t => t.ticketTypePrice || 0)),
          max: Math.max(...session.ticketTypes.map(t => t.ticketTypePrice || 0))
        } : undefined
      })),
      tags: {
        location: concert.locationTag?.locationTagName,
        music: concert.musicTag?.musicTagName
      },
      imageUrl: concert.imgBanner,
      status: concert.conInfoStatus,
      relevanceScore: score
    };
  }

  /**
   * 格式化演唱會回覆
   */
  async formatConcertReply(results: ConcertSearchResult[], originalQuery: string): Promise<FormattedConcertReply> {
    console.log(`🎵 格式化演唱會回覆: 找到 ${results.length} 個結果`);
    
    if (results.length === 0) {
      console.log(`❌ 沒有找到演唱會結果，查詢: "${originalQuery}"`);
      return {
        message: `很抱歉，我沒有找到與「${originalQuery}」相關的演唱會。\n\n您可以嘗試：\n• 使用更具體的藝人名稱\n• 搜索特定地區（如：台北、高雄）\n• 查詢特定時間（如：這個月、下週）\n\n如需更多協助，請聯繫人工客服！`,
        concerts: [],
        summary: {
          totalFound: 0,
          upcomingCount: 0,
          locationSummary: [],
        }
      };
    }

    const now = new Date();
    const upcomingCount = results.filter(r => r.dateRange.start > now).length;
    const locationSummary = [...new Set(results.map(r => r.location).filter(Boolean))];
    
    let priceRange: { min: number; max: number } | undefined;
    const allPrices: number[] = [];
    results.forEach(result => {
      result.sessions.forEach(session => {
        if (session.ticketPriceRange) {
          allPrices.push(session.ticketPriceRange.min, session.ticketPriceRange.max);
        }
      });
    });
    
    if (allPrices.length > 0) {
      priceRange = {
        min: Math.min(...allPrices),
        max: Math.max(...allPrices)
      };
    }

    // 取得前端網址並清理路徑
    let frontendUrl = process.env.FRONTEND_URL || 'https://frontend-fz4o.onrender.com';
    // 移除可能的 /callback 路徑，確保乾淨的基礎URL
    frontendUrl = frontendUrl.replace('/callback', '');

    // 生成回覆訊息
    let message = `🎵 為您找到 ${results.length} 個與「${originalQuery}」相關的演唱會：\n\n`;
    
    results.slice(0, 3).forEach((concert, index) => {
      message += `**${index + 1}. ${concert.title}**\n`;
      if (concert.artist) message += `🎤 ${concert.artist}\n`;
      message += `📍 ${concert.location}`;
      if (concert.venue) message += ` - ${concert.venue.name}`;
      message += `\n📅 ${this.formatDateRange(concert.dateRange)}\n`;
      
      if (concert.sessions.length > 0) {
        const firstSession = concert.sessions[0];
        if (firstSession.ticketPriceRange) {
          message += `💰 票價：$${firstSession.ticketPriceRange.min.toLocaleString()} - $${firstSession.ticketPriceRange.max.toLocaleString()}\n`;
        }
      }
      
      // 加上詳細資訊連結
      message += `🔗 查看詳情：${frontendUrl}/concert/${concert.concertId}\n\n`;
    });

    if (results.length > 3) {
      message += `還有 ${results.length - 3} 場演唱會，`;
    }

    message += '如需更多資訊，歡迎使用網站右上方搜尋功能';

    return {
      message,
      concerts: results,
      summary: {
        totalFound: results.length,
        upcomingCount,
        locationSummary,
        priceRange
      }
    };
  }

  /**
   * 格式化日期範圍
   */
  private formatDateRange(dateRange: { start: Date; end: Date }): string {
    const startDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);
    
    const formatDate = (date: Date) => {
      return `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
    };

    if (startDate.toDateString() === endDate.toDateString()) {
      return formatDate(startDate);
    }
    
    return `${formatDate(startDate)} - ${formatDate(endDate)}`;
  }

  /**
   * 獲取熱門演唱會
   */
  async getPopularConcerts(limit: number = 5): Promise<ConcertSearchResult[]> {
    try {
      const concerts = await this.concertRepo.find({
        where: {
          conInfoStatus: 'published',
          cancelledAt: IsNull()
        },
        relations: ['venue', 'locationTag', 'musicTag', 'organization', 'sessions', 'sessions.ticketTypes'],
        order: {
          promotion: 'ASC',
          visitCount: 'DESC'
        },
        take: limit
      });

      const results = await Promise.all(
        concerts.map(concert => this.transformToSearchResult(concert, 5))
      );

      return results;
    } catch (error) {
      console.error('❌ 獲取熱門演唱會失敗:', error);
      return [];
    }
  }
}

// 創建單例實例
export const concertSearchService = new ConcertSearchService(); 