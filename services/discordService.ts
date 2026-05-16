import axios from 'axios';
import { subtle } from 'node:crypto';
import { Concert } from '../models/concert.js';

interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
  footer: { text: string };
  timestamp: string;
}

interface DiscordMessagePayload {
  content: string;
  embeds: DiscordEmbed[];
  components: object[];
}

export async function verifyDiscordSignature(
  rawBody: Buffer,
  signature: string,
  timestamp: string,
): Promise<boolean> {
  try {
    const publicKeyHex = process.env.DISCORD_PUBLIC_KEY;
    if (!publicKeyHex) {
      console.warn('[DiscordService] DISCORD_PUBLIC_KEY 未設定，跳過簽名驗證');
      return false;
    }
    const keyBytes = Buffer.from(publicKeyHex, 'hex');
    const key = await subtle.importKey('raw', keyBytes, 'Ed25519', false, ['verify']);
    const message = Buffer.concat([Buffer.from(timestamp), rawBody]);
    const sig = Buffer.from(signature, 'hex');
    return subtle.verify('Ed25519', key, sig, message);
  } catch (err) {
    console.error('[DiscordService] 簽名驗證失敗:', err);
    return false;
  }
}

function buildConcertEmbed(concert: Concert): DiscordEmbed {
  const intro = concert.conIntroduction
    ? concert.conIntroduction.substring(0, 200) + (concert.conIntroduction.length > 200 ? '...' : '')
    : '（未提供）';

  const formatDate = (d: Date | string | null | undefined): string => {
    if (!d) return '未提供';
    const date = d instanceof Date ? d : new Date(d);
    return isNaN(date.getTime()) ? '未提供' : date.toLocaleDateString('zh-TW');
  };

  return {
    title: `🎵 演唱會待審核：${concert.conTitle || '（未命名）'}`,
    description: intro,
    color: 0xf59e0b,
    fields: [
      { name: 'Concert ID', value: concert.concertId, inline: false },
      { name: '地點', value: concert.conLocation || '未提供', inline: true },
      { name: '活動開始', value: formatDate(concert.eventStartDate), inline: true },
      { name: '活動結束', value: formatDate(concert.eventEndDate), inline: true },
    ],
    footer: { text: 'Tickeasy 審核系統 — Gemini API 配額耗盡，請人工處理' },
    timestamp: new Date().toISOString(),
  };
}

export async function sendConcertReviewRequest(concert: Concert): Promise<void> {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_CHANNEL_ID;

  if (!botToken || !channelId) {
    console.warn('[DiscordService] DISCORD_BOT_TOKEN 或 DISCORD_CHANNEL_ID 未設定，無法傳送 Discord 通知');
    return;
  }

  const payload: DiscordMessagePayload = {
    content: '**Gemini API 配額耗盡**，以下演唱會需要人工審核：',
    embeds: [buildConcertEmbed(concert)],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 3,
            label: '✅ 批准發布',
            custom_id: `approve_${concert.concertId}`,
          },
          {
            type: 2,
            style: 4,
            label: '❌ 拒絕',
            custom_id: `reject_${concert.concertId}`,
          },
        ],
      },
    ],
  };

  await axios.post(
    `https://discord.com/api/v10/channels/${channelId}/messages`,
    payload,
    { headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' } },
  );
  console.log(`[DiscordService] 演唱會 ${concert.concertId} 審核請求已傳送至 Discord`);
}

export async function patchInteractionResponse(
  interactionToken: string,
  payload: { content: string; components: object[] },
): Promise<void> {
  const appId = process.env.DISCORD_APPLICATION_ID;
  if (!appId) {
    console.warn('[DiscordService] DISCORD_APPLICATION_ID 未設定，無法更新互動訊息');
    return;
  }
  await axios.patch(
    `https://discord.com/api/v10/webhooks/${appId}/${interactionToken}/messages/@original`,
    payload,
    { headers: { 'Content-Type': 'application/json' } },
  );
}

export default { verifyDiscordSignature, sendConcertReviewRequest, patchInteractionResponse };
