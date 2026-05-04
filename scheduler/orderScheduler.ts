import schedule from 'node-schedule';
import { AppDataSource } from '../config/database.js';
import { Order } from '../models/order.js';
import { TicketType as TicketTypeEntity } from '../models/ticket-type.js';
import { LessThan } from 'typeorm';

/**
 * 每天定時檢查：所有場次結束 → 將演唱會設為 finished
 */
export async function scheduleOrderExpiredJobs() {
  //測試用
  //   schedule.scheduleJob('* * * * *', async () => {
  //     console.log('每秒執行一次');
  schedule.scheduleJob('*/1 * * * *', async () => {
    // 秒 分 時 日 月 星期
    // console.log('每分鐘 執行一次');

  const orderRepo = AppDataSource.getRepository(Order);
  const ticketTypeRepo = AppDataSource.getRepository(TicketTypeEntity);

  const now = new Date();

  // 1. 找出所有逾期且仍為 held 的訂單
  const expiredOrders = await orderRepo.find({
    where: {
      orderStatus: 'held',
      lockExpireTime: LessThan(now),
    },
    select: ['orderId', 'ticketTypeId'],
  });

  if (expiredOrders.length === 0) {
    // 沒有逾期訂單，心裡輕鬆一下
    // console.log(`[${now.toISOString()}] 暫無逾期訂單`);
    return;
  }

  // 2. 批次回補票種庫存
  const qtyMap = expiredOrders.reduce<Record<string, number>>((acc, o) => {
    acc[o.ticketTypeId] = (acc[o.ticketTypeId] || 0) + 1;
    return acc;
  }, {});
  
  // 針對每個票種，呼叫 increment
  for (const [typeId, count] of Object.entries(qtyMap)) {
    const r = await ticketTypeRepo.increment(
      { ticketTypeId: typeId },
      'remainingQuantity',
      count
    );
    console.log(`票種 ${typeId} 還庫存 ${count} 張，影響：${r.affected} 筆`);
  }
  // 3. 批次把訂單標成 expired
  await orderRepo
    .createQueryBuilder()
    .update(Order)
    .set({ orderStatus: 'expired', updatedAt: now })
    .where('orderStatus = :status', { status: 'held' })
    .andWhere('lockExpireTime < :now', { now })
    .execute();

  console.log(
    `[${now.toISOString()}] 已處理 ${expiredOrders.length} 筆逾期訂單，並歸還庫存。` 
  );
 });

  console.log('變更訂單狀態排程處理完畢');
}
