import { config } from '../config/env';
import { logger } from '../config/logger';

const KICKOFF_BLUE = '#0057FF';

function buildMagicLinkEmail(magicLink: string, expiryMinutes: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your KickoffAI Login Link</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6fb;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

          <!-- Header -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background-color:${KICKOFF_BLUE};border-radius:12px;padding:10px 20px;">
                    <span style="color:#ffffff;font-size:15px;font-weight:700;letter-spacing:0.5px;">⚡ KickoffAI</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#ffffff;border-radius:16px;box-shadow:0 2px 12px rgba(0,0,0,0.07);overflow:hidden;">

              <!-- Blue accent bar -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:linear-gradient(135deg,${KICKOFF_BLUE} 0%,#3a7eff 100%);height:4px;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>

              <!-- Body -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:40px 40px 32px;">

                    <!-- AI icon -->
                    <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                      <tr>
                        <td style="background-color:#eef3ff;border-radius:12px;width:52px;height:52px;text-align:center;vertical-align:middle;">
                          <span style="font-size:26px;line-height:52px;">🤖</span>
                        </td>
                      </tr>
                    </table>

                    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0d0d0d;line-height:1.3;">
                      Your login link is ready
                    </h1>
                    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                      Click the button below to sign in to KickoffAI. No password needed.
                    </p>

                    <!-- CTA button -->
                    <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                      <tr>
                        <td style="background-color:${KICKOFF_BLUE};border-radius:10px;">
                          <a href="${magicLink}"
                             style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.2px;">
                            Sign in to KickoffAI →
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- Expiry notice -->
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                      <tr>
                        <td style="background-color:#f8f9ff;border:1px solid #e0e8ff;border-radius:8px;padding:12px 16px;">
                          <p style="margin:0;font-size:13px;color:#4b5563;line-height:1.5;">
                            ⏱ This link expires in <strong>${expiryMinutes} minutes</strong> and can only be used once.
                          </p>
                        </td>
                      </tr>
                    </table>

                    <!-- Fallback link -->
                    <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
                      Button not working? Copy and paste this link into your browser:<br />
                      <a href="${magicLink}" style="color:${KICKOFF_BLUE};word-break:break-all;">${magicLink}</a>
                    </p>

                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 0 0;text-align:center;">
              <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">
                If you didn't request this link, you can safely ignore this email.
              </p>
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                © ${new Date().getFullYear()} Kickoff Africa · Internal AI Platform
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendMagicLinkEmail(to: string, token: string): Promise<void> {
  const magicLink = `${config.appUrl}/auth/verify?token=${token}`;

  if (process.env.NODE_ENV !== 'production') {
    logger.info({ to, magicLink }, 'Magic link generated (dev)');
  }

  const html = buildMagicLinkEmail(magicLink, config.magicLinkExpiryMinutes);

  const response = await fetch(`${config.useSendBaseUrl}/v1/emails`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.useSendApiKey}`,
    },
    body: JSON.stringify({
      from: config.emailFrom,
      to,
      subject: 'Your KickoffAI Login Link',
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error({ status: response.status, body, to }, 'Failed to send magic link email');
    throw new Error(`Email delivery failed: ${response.status} ${body}`);
  }

  const { emailId } = await response.json() as { emailId: string };
  logger.info({ emailId, to }, 'Magic link email sent');
}
