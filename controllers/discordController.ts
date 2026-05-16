import { Request, Response } from 'express';
import { verifyDiscordSignature } from '../services/discordService.js';
import concertReviewService from '../services/concertReviewService.js';
import { ReviewStatus } from '../models/concert.js';

export async function handleDiscordInteraction(req: Request, res: Response): Promise<void> {
  const signature = req.headers['x-signature-ed25519'] as string;
  const timestamp = req.headers['x-signature-timestamp'] as string;

  if (!signature || !timestamp) {
    res.status(401).json({ error: 'missing signature headers' });
    return;
  }

  // req.body 是 Buffer（express.raw() 提供）
  const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
  const isValid = await verifyDiscordSignature(rawBody, signature, timestamp);

  if (!isValid) {
    res.status(401).json({ error: 'invalid request signature' });
    return;
  }

  const interaction = JSON.parse(rawBody.toString('utf-8'));

  // PING（Discord 驗證 Interaction URL）
  if (interaction.type === 1) {
    res.json({ type: 1 });
    return;
  }

  // MESSAGE_COMPONENT（按鈕點擊）
  if (interaction.type === 3) {
    const customId: string = interaction.data?.custom_id ?? '';
    const [action, concertId] = customId.split('_', 2) as [string, string];

    if (!concertId || (action !== 'approve' && action !== 'reject')) {
      res.status(400).json({ error: 'invalid custom_id format' });
      return;
    }

    const reviewStatus = action === 'approve' ? ReviewStatus.APPROVED : ReviewStatus.REJECTED;
    const discordUserId: string = interaction.member?.user?.id ?? interaction.user?.id ?? 'system:discord';
    const note = `Discord 管理員審核：${action === 'approve' ? '批准發布' : '拒絕'}（user: ${discordUserId}）`;

    try {
      await concertReviewService.submitManualReview(
        concertId,
        `discord:${discordUserId}`,
        reviewStatus,
        note,
        'manual_system',
      );

      const resultText = action === 'approve'
        ? '✅ 演唱會已批准發布'
        : '❌ 演唱會已拒絕';

      // type 7 = UPDATE_MESSAGE，移除按鈕
      res.json({
        type: 7,
        data: {
          content: `${resultText}（Concert ID: \`${concertId}\`）`,
          components: [],
        },
      });
    } catch (err: any) {
      console.error('[DiscordController] 處理審核按鈕失敗:', err);
      res.json({
        type: 4,
        data: {
          content: `❗ 審核處理失敗：${err.message || '未知錯誤'}`,
          flags: 64, // EPHEMERAL
        },
      });
    }
    return;
  }

  // 其他 interaction type，回 204
  res.status(204).send();
}
