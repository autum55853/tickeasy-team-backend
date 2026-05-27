/**
 * 客服 SSE 廣播
 * 以 sessionId 為 key 維護一組訂閱者（HTTP Response），
 * 當人工客服訊息寫入後即時 push 給前端 EventSource。
 *
 * 注意：純 in-memory 實作；多實例部署時需改用 Redis pub/sub。
 */

import type { Response } from 'express';

export interface SseMessagePayload {
  messageId?: string;
  sessionId: string;
  senderType: 'user' | 'bot' | 'agent';
  senderId?: string | null;
  messageText: string;
  messageType?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string | Date;
}

const subscribers = new Map<string, Set<Response>>();
const HEARTBEAT_INTERVAL_MS = 25_000;

export function subscribe(sessionId: string, res: Response): () => void {
  let set = subscribers.get(sessionId);
  if (!set) {
    set = new Set();
    subscribers.set(sessionId, set);
  }
  set.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      // 忽略寫入錯誤，由 close handler 移除
    }
  }, HEARTBEAT_INTERVAL_MS);

  return () => {
    clearInterval(heartbeat);
    const current = subscribers.get(sessionId);
    if (!current) return;
    current.delete(res);
    if (current.size === 0) subscribers.delete(sessionId);
  };
}

export function publish(sessionId: string, payload: SseMessagePayload): void {
  const subs = subscribers.get(sessionId);
  if (!subs || subs.size === 0) return;

  const data = JSON.stringify(payload);
  for (const res of subs) {
    try {
      res.write(`data: ${data}\n\n`);
    } catch (err) {
      console.warn('[SSE] write 失敗，移除訂閱:', err);
      subs.delete(res);
    }
  }
}

export function subscriberCount(sessionId: string): number {
  return subscribers.get(sessionId)?.size ?? 0;
}

export default { subscribe, publish, subscriberCount };
