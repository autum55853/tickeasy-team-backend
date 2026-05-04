import { format, toZonedTime } from 'date-fns-tz';
import { zhTW } from 'date-fns/locale';

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
