import { format, toZonedTime } from 'date-fns-tz';
import { zhTW } from 'date-fns/locale';

/** 回傳台灣時間（UTC+8）的 Date 物件，用於寫入 timestamp 欄位 */
export function getTaiwanTime(): Date {
  return new Date(Date.now() + 8 * 60 * 60 * 1000);
}

/**
 * 將 ISO 時間轉換為台灣格式：2025.08.14 (四) 16:00
 */
export function formatDateTimeTW(isoDate: string | Date): string {
  const timeZone = 'Asia/Taipei';
  const date = typeof isoDate === 'string' ? new Date(isoDate) : isoDate;
  const zonedDate = toZonedTime(date, timeZone);

  return format(zonedDate, 'yyyy.MM.dd (eee) HH:mm:ss', {
    locale: zhTW,
    timeZone,
  });
}
