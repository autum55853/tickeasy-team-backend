import nodemailer from 'nodemailer';

export const getTransporter = async () => {
  const { EMAILER_USER, GOOGLE_GMAIL_CLIENT_ID, GOOGLE_GMAIL_CLIENT_SECRET, EMAILER_OAUTH_REFRESH_TOKEN } = process.env;

  if (!EMAILER_USER || !GOOGLE_GMAIL_CLIENT_ID || !GOOGLE_GMAIL_CLIENT_SECRET || !EMAILER_OAUTH_REFRESH_TOKEN) {
    throw new Error('Email 服務未啟用');
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: EMAILER_USER,
        clientId: GOOGLE_GMAIL_CLIENT_ID,
        clientSecret: GOOGLE_GMAIL_CLIENT_SECRET,
        refreshToken: EMAILER_OAUTH_REFRESH_TOKEN,
      }
    });

    // 驗證連接
    await transporter.verify();
    console.log('郵件服務連接成功');

    return transporter;
  } catch (error) {
    console.error('郵件服務連接失敗:', error);
    throw new Error('郵件服務連接失敗');
  }
};

export const sendVerificationEmail = async (email: string, code: string) => {
  try {
    const transporter = await getTransporter();

    const info = await transporter.sendMail({
      from: process.env.EMAILER_USER,
      to: email,
      subject: 'Tickeasy 電子郵件驗證',
      html: `
        <h1>電子郵件驗證</h1>
        <p>您的驗證碼是：<strong>${code}</strong></p>
        <p>此驗證碼將在 10 分鐘後過期。</p>
        <p>如果這不是您的操作，請忽略此郵件。</p>
      `
    });

    console.log('驗證郵件發送成功:', info.messageId);
    return info;
  } catch (error) {
    console.error('驗證郵件發送失敗:', error);
    throw new Error('驗證郵件發送失敗');
  }
};

export const sendPasswordResetEmail = async (email: string, code: string) => {
  try {
    const transporter = await getTransporter();

    const info = await transporter.sendMail({
      from: process.env.EMAILER_USER,
      to: email,
      subject: '密碼重置',
      html: `
        <h1>密碼重置</h1>
        <p>您的密碼重置驗證碼是：<strong>${code}</strong></p>
        <p>此驗證碼將在 10 分鐘後過期。</p>
        <p>如果這不是您的操作，請立即更改您的密碼。</p>
      `
    });

    console.log('密碼重置郵件發送成功:', info.messageId);
    return info;
  } catch (error) {
    console.error('密碼重置郵件發送失敗:', error);
    throw new Error('密碼重置郵件發送失敗');
  }
}; 