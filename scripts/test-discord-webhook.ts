import 'dotenv/config';
import { sendConcertReviewRequest } from '../services/discordService.js';

async function main() {
  const fakeConcert = {
    concertId: 'feb969d9-6012-4db1-9d3b-88bdee5e23a2',
    conTitle: 'Claude 音樂節 2025（Discord 測試）',
    conIntroduction: '驗證 Discord 人工審核按鈕流程，點擊按鈕後資料庫狀態應更新。',
    conLocation: '台北小巨蛋',
    eventStartDate: new Date('2026-06-01'),
    eventEndDate: new Date('2026-06-01'),
  } as any;

  await sendConcertReviewRequest(fakeConcert);
  console.log('已傳送至 Discord，請至頻道點擊 Approve/Reject 按鈕');
}

main().catch(console.error);
