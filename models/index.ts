import 'reflect-metadata';

/**
 * 模型索引文件
 * 用於集中導入/導出所有模型
 */

// 導入所有核心模型
export * from './user.js';
export * from './organization.js';
export * from './location-tag.js';
export * from './music-tag.js';
export * from './venue.js';
export * from './concert.js';
export * from './concert-review.js';
export * from './concert-session.js';
export * from './ticket-type.js';
export * from './order.js';
export * from './ticket.js';
export * from './payment.js';

// 導入客服系統模型
export * from './support-session.js';
export * from './support-message.js';
export * from './support-knowledge-base.js';
export * from './support-schedule.js';

console.log('模型已初始化'); 