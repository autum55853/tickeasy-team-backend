import schedule from 'node-schedule';
import { AppDataSource } from '../config/database.js';
import { ConcertSession } from '../models/concert-session.js';
import { Concert } from '../models/concert.js';
import { IsNull } from 'typeorm';
// import { MoreThan } from 'typeorm';
// import { LessThan } from 'typeorm';

/**
 * 每天定時檢查：所有場次結束 → 將演唱會設為 finished
 */
export async function scheduleConcertFinishJobs() {
  //測試用
  //   schedule.scheduleJob('* * * * *', async () => {
  //     console.log('每秒執行一次');
  schedule.scheduleJob('10 0 * * *', async () => {
    // 秒 分 時 日 月 星期
    console.log('每天 00:10 執行一次');

    const concertRepo = AppDataSource.getRepository(Concert);
    const sessionRepo = AppDataSource.getRepository(ConcertSession);

    // 撈出所有 still published 的演唱會
    const concerts = await concertRepo.find({
      where: { conInfoStatus: 'published', cancelledAt: IsNull() },
    });

    for (const concert of concerts) {
      const sessions = await sessionRepo.find({
        where: { concertId: concert.concertId },
      });

      // 判斷所有 session 是否都結束
      const allEnded = sessions.every((session) => {
        const endTime = new Date(
          `${session.sessionDate}T${session.sessionEnd}`
        );
        return endTime < new Date();
      });

      if (allEnded) {
        concert.conInfoStatus = 'finished';
        await concertRepo.save(concert);
        console.log(
          `演唱會 ${concert.concertId} 所有場次已結束 → 設為 finished`
        );
      }
    }
  });

  console.log('本次排程處理完畢');
}
