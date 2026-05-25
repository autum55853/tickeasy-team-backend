import { Request, Response } from 'express';
import { verifyDiscordSignature, patchInteractionResponse } from '../services/discordService.js';
import concertReviewService from '../services/concertReviewService.js';
import { ReviewStatus } from '../models/concert.js';
import { AppDataSource } from '../config/database.js';
import { SupportSession, SessionStatus } from '../models/support-session.js';
import { SupportMessage, SenderType, MessageType } from '../models/support-message.js';

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

    // 客服 fallback：開啟 Modal 讓管理員輸入回覆
    if (customId.startsWith('support_reply_')) {
      const sessionId = customId.replace('support_reply_', '');
      res.json({
        type: 9, // MODAL
        data: {
          title: '回覆用戶問題',
          custom_id: `support_modal_${sessionId}`,
          components: [
            {
              type: 1,
              components: [
                {
                  type: 4,
                  custom_id: 'reply_text',
                  label: '回覆內容',
                  style: 2,
                  min_length: 1,
                  max_length: 1000,
                  required: true,
                },
              ],
            },
          ],
        },
      });
      return;
    }

    // 演唱會審核：approve / reject
    const [action, concertId] = customId.split('_', 2) as [string, string];

    if (!concertId || (action !== 'approve' && action !== 'reject')) {
      res.status(400).json({ error: 'invalid custom_id format' });
      return;
    }

    const reviewStatus = action === 'approve' ? ReviewStatus.APPROVED : ReviewStatus.REJECTED;
    const discordUserId: string = interaction.member?.user?.id ?? interaction.user?.id ?? 'system:discord';
    const note = `Discord 管理員審核：${action === 'approve' ? '批准發布' : '拒絕'}（user: ${discordUserId}）`;

    // 立即回應 Discord（type 6 = DEFERRED_UPDATE_MESSAGE），避免超過 3 秒 deadline
    res.json({ type: 6 });

    const interactionToken: string = interaction.token;

    // 異步處理審核，完成後 PATCH 更新 Discord 訊息
    concertReviewService.submitManualReview(
      concertId,
      `discord:${discordUserId}`,
      reviewStatus,
      note,
      'manual_system',
    ).then(async () => {
      const resultText = action === 'approve'
        ? '✅ 演唱會已批准發布'
        : '❌ 演唱會已拒絕';
      await patchInteractionResponse(interactionToken, {
        content: `${resultText}（Concert ID: \`${concertId}\`）`,
        components: [],
      });
    }).catch(async (err: any) => {
      console.error('[DiscordController] 處理審核按鈕失敗:', err);
      await patchInteractionResponse(interactionToken, {
        content: `❗ 審核處理失敗：${err.message || '未知錯誤'}`,
        components: [],
      });
    });
    return;
  }

  // MODAL_SUBMIT（管理員提交回覆 Modal）
  if (interaction.type === 5) {
    const customId: string = interaction.data?.custom_id ?? '';

    if (customId.startsWith('support_modal_')) {
      const sessionId = customId.replace('support_modal_', '');
      const replyText: string = interaction.data?.components?.[0]?.components?.[0]?.value ?? '';
      const discordUserId: string = interaction.member?.user?.id ?? interaction.user?.id ?? 'unknown';
      const discordUsername: string =
        interaction.member?.user?.username ?? interaction.user?.username ?? '管理員';

      if (!replyText.trim()) {
        res.json({ type: 4, data: { content: '❗ 回覆內容不可為空', flags: 64 } });
        return;
      }

      // 立即回應 Discord（type 4 = CHANNEL_MESSAGE_WITH_SOURCE, flags 64 = ephemeral）
      res.json({ type: 4, data: { content: '✅ 已回覆用戶', flags: 64 } });

      const interactionToken: string = interaction.token;

      (async () => {
        const sessionRepo = AppDataSource.getRepository(SupportSession);
        const messageRepo = AppDataSource.getRepository(SupportMessage);

        const session = await sessionRepo.findOne({ where: { supportSessionId: sessionId } });
        if (!session) {
          console.warn(`[DiscordController] support session 不存在: ${sessionId}`);
          return;
        }

        const msg = new SupportMessage();
        msg.sessionId = sessionId;
        msg.senderType = SenderType.AGENT;
        msg.senderId = null as unknown as string;
        msg.messageText = replyText;
        msg.messageType = MessageType.TEXT;
        msg.metadata = { discordUserId, discordUsername };
        await messageRepo.save(msg);

        session.status = SessionStatus.ACTIVE;
        await sessionRepo.save(session);

        await patchInteractionResponse(interactionToken, {
          content: `✅ 已由 **${discordUsername}** 回覆`,
          components: [],
        });
      })().catch(err => console.error('[DiscordController] support modal 處理失敗:', err));
      return;
    }

    res.status(400).json({ error: 'unknown modal custom_id' });
    return;
  }

  // 其他 interaction type，回 204
  res.status(204).send();
}
