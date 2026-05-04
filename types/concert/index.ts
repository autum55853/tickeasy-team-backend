// import { ConcertSession } from '../../models/concert-session.js';
import { ConInfoStatus } from '../../models/concert.js';
import { ApiResponse } from '../api.js';

/**
 * 建立活動時每一個票種的結構
 */
export interface TicketType {
  ticketTypeName: string;
  entranceType: string;
  ticketBenefits: string;
  ticketRefundPolicy: string;
  ticketTypePrice: number;
  totalQuantity: number;
  sellBeginDate: string; // yyyy/MM/dd HH:mm
  sellEndDate: string; // yyyy/MM/dd HH:mm
}

/**
 * 建立活動時每一個場次的結構
 */
export interface Session {
  sessionDate: string; // yyyy/MM/dd
  sessionStart: string; // HH:mm
  sessionEnd: string; // HH:mm
  sessionTitle: string;
  imgSeattable: string; // 只有一張
  ticketTypes: TicketType[]; // 每場次多張票
}

/**
 * 創建活動請求 Body 類型
 * 創建活動請求 Body 類型
 */
export interface CreateConcertRequest {
  organizationId: string;
  venueId: string;
  locationTagId: string;
  musicTagId: string;
  conTitle: string;
  conIntroduction?: string;
  conLocation: string;
  conAddress: string;
  eventStartDate?: string; // yyyy/MM/dd
  eventEndDate?: string; // yyyy/MM/dd
  ticketPurchaseMethod: string;
  precautions: string;
  refundPolicy: string;
  conInfoStatus: ConInfoStatus;
  imgBanner: string;
  sessions: Session[];
}
/**
 * 回傳用的單一場次資料結構
 */
export interface ConcertSessionResponse {
  sessionId: string;
  sessionTitle: string;
  sessionDate: string;
  sessionStart: string;
  sessionEnd: string;
  imgSeattable: string;
  ticketTypes: TicketTypeResponse[];
}

/**
 * 回傳用的票種資料結構（包含票種 ID 與剩餘數量）
 */
export interface TicketTypeResponse {
  ticketTypeId: string;
  ticketTypeName: string;
  entranceType: string;
  ticketBenefits: string;
  ticketRefundPolicy: string;
  ticketTypePrice: number;
  totalQuantity: number;
  remainingQuantity: number;
  sellBeginDate: string;
  sellEndDate: string;
}

/**
 * API 回應中的活動資料結構
 */
export interface ConcertData {
  concertId: string;
  organizationId: string;
  venueId: string;
  locationTagId: string;
  musicTagId: string;
  conTitle: string;
  conIntroduction?: string;
  conLocation: string;
  conAddress: string;
  eventStartDate?: string;
  eventEndDate?: string;
  imgBanner: string;
  ticketPurchaseMethod: string;
  precautions: string;
  refundPolicy: string;
  conInfoStatus: ConInfoStatus;
  reviewStatus: string;
  visitCount: number;
  promotion?: number;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;

  sessions: ConcertSessionResponse[];
}

/**
 * 獲取單一活動的回應類型
 */
export interface ConcertResponse
  extends ApiResponse<{
    concert: ConcertData;
  }> {}

/**
 * 獲取多個活動的回應類型（含分頁）
 */
export interface ConcertsResponse
  extends ApiResponse<{
    concerts: ConcertData[];
    pagination: {
      totalCount: number;
      totalPages: number;
      currentPage: number;
      limit: number;
    };
  }> {}

/**
 * 獲取組織音樂會列表的查詢參數
 */
export interface GetConcertsByOrganizationQuery {
  status?: 'draft' | 'published' | 'finished';
  limit?: string | number;
  page?: string | number;
  sort?: string; // 格式：field:direction,field2:direction (例：eventStartDate:DESC,createdAt:ASC)
}

/**
 * 允許排序的欄位清單
 */
export const VALID_SORT_FIELDS = [
  'eventStartDate',
  'eventEndDate',
  'createdAt',
  'updatedAt',
  'conTitle',
  'visitCount',
  'promotion'
] as const;

export type ValidSortField = typeof VALID_SORT_FIELDS[number];
