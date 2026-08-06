import nodemailer from 'nodemailer';
import { config } from '../config/env';

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass,
  },
});

export async function sendMagicLinkEmail(to: string, token: string): Promise<void> {
  const magicLink = `${config.appUrl}/auth/verify?token=${token}`;

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[DEV] Magic link for ${to}: ${magicLink}`);
  }

  await transporter.sendMail({
    from: config.smtp.from,
    to,
    subject: 'Your KickoffAI Login Link',
    html: `
      <p>Hello,</p>
      <p>Click the link below to log in to KickoffAI:</p>
      <p><a href="${magicLink}">${magicLink}</a></p>
      <p>This link expires in ${config.magicLinkExpiryMinutes} minutes and can only be used once.</p>
      <p>If you did not request this link, you can safely ignore this email.</p>
    `,
  });
}
