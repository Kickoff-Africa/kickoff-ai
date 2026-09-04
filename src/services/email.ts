import { config } from '../config/env';
import { logger } from '../config/logger';

const BRAND_BLUE = '#002369';
// The logo mark's gradient (#0066F6 to #B0D0FC) is a near-match for
// BRAND_BLUE, so on a brand-blue badge the mark nearly disappears — verified
// by rendering both and comparing. A dark neutral gives every part of the
// logo (the blue gradient mark and the pale wordmark) real contrast.
const LOGO_BADGE_BG = '#0B0F19';

// Scout AI wordmark, rasterized from the brand SVG (light-on-dark variant)
// for reliable rendering across email clients — inline SVG support in email
// is inconsistent (notably absent in desktop Outlook), so every image in
// these templates is a base64 PNG rather than a mix of SVG and raster.
const LOGO_DATA_URI = 'data:image/png;base64,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';
const KEY_ICON_DATA_URI = 'data:image/png;base64,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';
const SHIELD_ICON_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJwAAACcCAYAAACKuMJNAAAACXBIWXMAAC4jAAAuIwF4pT92AAALiklEQVR4nO2dCaxeRRXHT2XRKkIUFY0LRgUTZXFHE2PdJVKgLnfma18V17pF65oGSWwNCtVopBqEBqyyiqBW1GoisQRtbDWlRCpokShFoVrr0tfSxUff38zc19Cm3/ObmTt35s6555dM0hT63XPmnDvnznLOEAmCIAiCIAiCIAiCIAiCIHSFxXgYDfA60lhBGhun2gr7d+a/CUIUNE4kjSWk8SfSwNCmcB8pLKMKJ0uvC/6M4WhSeDtp3EQak9M62vC2njQW0hwcK10vTI8JixVeTgrLSWGnp5MNG/V2k8b1pHAmzcLh0vWCe8hs7nwScntNs5DZtK2XkNsHYodMCblCtpApIbfn5A2ZEnJ7tjB7NWns6oDjNG27rC6ysNzBkKnwOVK4N5EjrKEK77XN/DlNyL3X6mh0FXoRMv9KCkuHGrzC00hjUcJvxPUyy+U4y/RduO26fEJnZ5nNR5DUI7CShWU+IbMpEnI7CveQxF2/YigxZDZlTEIu7w5vM2Q2pZJZbjtISPn/SP9EYi5OyLQwewyVSoVjsiwsG1sV3WkK15DCvmQd1sWQWdJOisI+a7PiXtYKR5LG2pY7qF97jYuT7hWvtTYsBoUPttgZ5YfMEkKusWExaKyOrDzfkNndkLuaikHhbgmZhYdchbupGBT+XPTCbOmMRVjnNDZk7HDdXZgtnSpwYZmhw030apbZrZA70T+HK0ohZihu9mGnEDMUN/uwU4gZipt92CnEDMXNPuwUYobiZh92CjFDcbMPO4WYobjZh51CzFDc7MNOIWYobvZhpxAzFDf7sFOIGYqbfdgplJEKjyeFz5PGb0jh96SxkjRmN/pNdvZhp1AmFF5AGlum6b+vE2FG4O8ysw87hTJQ4dmksXVEH74v6LfZ2YedQokZw1NIY3Nrp3LZ2YedQgmZg2NJ446R/be/hZyMZmcfdgolosJRpLDO2dnE4aYQhwtxtiNJ4WdeziYhVRwu+Pi3xne8nE0mDQcgI5wfGpd4O5vGVbIsIg7nj8b5Ac52U6NSDOwGBHYKtcQAHwoIo+toPh7V6Lns7MNOoRbQmBdQWWojVXhs42ezsw87hSIzsPmhez1HNlM75KlRns/OPuwUiojCSwOKSm+1W13xZGBmH3YKRULhJNL4p+fItt1u4seVg5l92CkUgXl4Binc7+lsu0nhFdFlYWcfdgpFONOm8QfPMPogKbylFXnY2YedQo1LZ23wdLZJ0nh3azKxsw87hQKpMJM0bvF0NpDGJ1uVi5192CkUQIXDSOF73s6mcGHrsrGzDzuFfMEM0vhGwMh2RfD+aK/tw04hTzS+FDCy3ZjsEjZ29sml0Fw8zracKJwbMLKtpnPwiIQyisOFgxk2meTAyunmzzbBJEF4OpD67gTfIs7r6Sw8Oqmc7BzOpYCxwj1RnmXS5aZ/zopk9YPNmplZO/MLo5vsGl1qXBJ0jA2LwS0JZGuE58x2+hBv2+kGeDVp7PF0tr/QPBxPOVD4h4OMG6kYTJb4aIUeiPCclY4Gbs/pBngRaYx7htFtVOE5lIv6tuhRL8Q6KgaFmx06fbKxE9SlD5DN6VySlQ815E4a4LSocvjJfJijnD+nYlD4sZNSTU+uuo2k7Tida7LywW0vabw+yvPD5T7a0eFupGJwzUCajyc0ek5d5AXJnc43Wbk24D7S0JSbMTzJUeZrqRhcV9nN+bDmpzC2JHW6kGTlLl0HOcApjjJfRsVQXzU5WqkBzmr8rAovJI1/J3G6kGTlun2GusIAb3J8QT5LxVDhXY4O97Eozxvg+d4naev2beftJOOcCtcFPONi6hIKn3CU+x1UDBqvdFTqq9Ge2bbTKSwLCKPXdO7iOo2LHWWPf9K45SsTXYyyKupz23K6HMnKbaHwUyf5KzyZCquVsSfLrcOxnS5XsnLebcfdnRuZR+J6hr/CEzvrdDmTldtggOMcX5g7qTg0vuuo3JxWnt/U6XInK+edod5AxeE+G/pCazLU+5whSyar7F6vn7P9jSo8izgcDFX4KBVHhZc5GuuXrcoRPtLlTVZuA421TvpUeAkVx+l4uOOphN00G48s1unaSlaOjZnEuB2h2tXJ2bUTGmucjGa+LdqmHadrL1k5NgO81VGnW6hYFL7oqOTVSeQJ/6Yb1iaLWo3XuNZRrwuoWMxRHDcl/2NDcArijXTtJivH/7zZ7qjXa6hYFuAIZ+MqvDGZXE2dLkWyckwGOMNRt23JUhVbQ+NbjspekVSu0PCqcHnybLCmmL51028FFY/CmY7K7ml8ILPtkS5lsnIsTJ6uy2qBaWYkLB6/74dFyeVzd7q0ycrpE7PHi9RvKGa7yG0EuccmeaRmdHhNn6wcL2FmM78j5aMwMx/376Szs8hY4WS7aX2oPD+keXgMlYjGmz0+F15FfLDlGIYZc1hbk01M832m8Aa75KGx0IbbktH4lWOf31HcRGgkPufKUi6RcEU5T9ZM+wCxo852cp083F7eAcDO1ae7zXmyYHJVWaLwNY+3Ln8OZ6lUmOsRTS4itszFCaQx4dgRm+xOhUABqYx3OTrcROfP8DXGrNS7v33n5ha3ODTO8+jf5cQekw1kzly5dcqeqFf+cGeujSBufVvvPnT3OHxUNL7i8RbezG/K3hImNdG9X79MvcHs7/nUVKswP7fInafCOR4Tsh3J962zo7HEo4O29Wf4D0489zmEsJh6R72p715QUOEXxZ3USMEsHG4Tkdz78S4+m/S+VJjlWfX7/NwiF1upSts2WfaJ3hgoXOnxdu4jhdfmFrljRYMe9Oi/b+YWuSsHBF2qau9vW2y5074zZku++hRj3Gordwr2TX2bR8eZdpvdm+0rFY7y2CvdP7qN5Ra7W2hc5dmBP8lyWDM3i21hxB949tV1ucXu6lvrd2tyrxYvpzCb7X7R4I98T4M0xdTn8L/R5cPUFzQWejrbniJqnhTWqZP1RW7MUXind626AT6SW+xSjqPf4DnK7WP9UVxhvrez2Rpvsgft2sEzA+5CMIVlBsQNbRNh3M4QPtTWd7bka2cxN6bUFSV9OnqvrRLEBY2KFP7r2Qebbd8JAQzwXFvoxnek01jA5PTHhKfu46Rwam7Ry6a+E9Xv4tt6zzB9Fn/cbPnJgE8KyXaL9rb7VxM3H87LyvpwxgyPmnoHv2AK78ktPS8qvD/gra9vgynhOE6Fmc4lMfq4LJQFs67kbxDjdBs6fYBzzF4p+esg3TQ+lVt83mh8PNDp7iOFF1PXUDg14KLf/e3TucXvBz6pcAe3B6iCoq5QQXnfByHOlglTDyNkIlGPdsuT1RQexgIcQQpLg75J62+2Ai/u4EB9lY/fZv9D7VbSeGZymefheOcLOg5t5iomKYHRgdpz44Ej3fakBtQ4mxT+FSjrThrg9GSyCiOuWVL4e+CoYcLaJa3uPdZn/S4NlK++x2uA08QHunfG/9Zgo5p7RE0WWTsvg2txGQxpt5PG06PLJUSrQff9BsY1H+TLokwo6jsqlgRsy+GAtkpO65Zx5v/CBkY2bWOjNTvzb81vNHF8jQukKGN5Rfl2NDC62Qxf5lW93Py/5t80G9V2WNmFAjGlvhR+22i0U7jfnktzq6m7ueGz7iSFk5L0jdDq6WH3IojTt5VD92PrQjIrI/z+ZVZWgVFeQLMQa9ouu0NgJif16Y5FEX5zB+t8jF6jcWJArsSwtrlx+NS2rbVVKwX25a3Om9omQqa215706GPlgN5iPs5963PEaAq/k+TkvlIXRVwakKwS0ibss3KeUhE6wgCnRPq2m25U29DJw59CRsz3VH2EPezkyfA2bn9TvtWEEfkF10cY1X5k1+gEwQlzHbe5fsnf0TbxuMpbSE994mOhY/a/WQBeIpMCoTmmNu50m/J15aYraYDjpKuFuFR43tS+7MapI0yX278TBEEQBEEQBEEQBEEQBEGg7vA//jaxo5eSHq8AAAAASUVORK5CYII=';

function buildMagicLinkEmail(magicLink: string, expiryMinutes: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Scout AI Login Link</title>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

          <!-- Header -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background-color:${LOGO_BADGE_BG};border-radius:12px;padding:12px 22px;">
                    <img src="${LOGO_DATA_URI}" width="141" height="18" alt="Scout AI" style="display:block;border:0;" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#ffffff;border-radius:16px;border:1px solid #ebebeb;overflow:hidden;">

              <!-- Blue accent bar -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:linear-gradient(135deg,${BRAND_BLUE} 0%,#3a7eff 100%);height:4px;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>

              <!-- Body -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:40px 40px 32px;">

                    <!-- Key icon -->
                    <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                      <tr>
                        <td style="background-color:#eef3ff;border-radius:12px;width:52px;height:52px;text-align:center;vertical-align:middle;">
                          <img src="${KEY_ICON_DATA_URI}" width="28" height="28" alt="" style="display:block;margin:12px;border:0;" />
                        </td>
                      </tr>
                    </table>

                    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0d0d0d;line-height:1.3;">
                      Your login link is ready
                    </h1>
                    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                      Click the button below to sign in to Scout AI. No password needed.
                    </p>

                    <!-- CTA button -->
                    <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                      <tr>
                        <td style="background-color:${BRAND_BLUE};border-radius:10px;">
                          <a href="${magicLink}"
                             style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.2px;">
                            Sign in to Scout AI →
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- Expiry notice -->
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                      <tr>
                        <td style="background-color:#f8f9ff;border:1px solid #e0e8ff;border-radius:8px;padding:12px 16px;">
                          <p style="margin:0;font-size:13px;color:#4b5563;line-height:1.5;">
                            This link expires in <strong>${expiryMinutes} minutes</strong> and can only be used once.
                          </p>
                        </td>
                      </tr>
                    </table>

                    <!-- Fallback link -->
                    <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
                      Button not working? Copy and paste this link into your browser:<br />
                      <a href="${magicLink}" style="color:${BRAND_BLUE};word-break:break-all;">${magicLink}</a>
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

function buildOTPEmail(code: string, expiryMinutes: number): string {
  const digits = code.split('');
  const digitBoxes = digits.map(d =>
    `<td style="width:44px;height:56px;text-align:center;vertical-align:middle;background-color:#f0f4ff;border:1px solid #dce6ff;border-radius:8px;font-size:28px;font-weight:700;color:${BRAND_BLUE};font-family:monospace;">${d}</td><td style="width:6px;"></td>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Scout AI Admin Code</title>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

          <!-- Header -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background-color:${LOGO_BADGE_BG};border-radius:12px;padding:12px 22px;">
                    <img src="${LOGO_DATA_URI}" width="141" height="18" alt="Scout AI" style="display:block;border:0;" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#ffffff;border-radius:16px;border:1px solid #ebebeb;overflow:hidden;">

              <!-- Blue accent bar -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:linear-gradient(135deg,${BRAND_BLUE} 0%,#3a7eff 100%);height:4px;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>

              <!-- Body -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:40px 40px 32px;">

                    <!-- Shield icon -->
                    <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                      <tr>
                        <td style="background-color:#eef3ff;border-radius:12px;width:52px;height:52px;text-align:center;vertical-align:middle;">
                          <img src="${SHIELD_ICON_DATA_URI}" width="28" height="28" alt="" style="display:block;margin:12px;border:0;" />
                        </td>
                      </tr>
                    </table>

                    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0d0d0d;line-height:1.3;">
                      Admin login code
                    </h1>
                    <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.6;">
                      Enter this code in the Scout AI admin login screen.
                    </p>

                    <!-- OTP digits -->
                    <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                      <tr>
                        ${digitBoxes}
                      </tr>
                    </table>

                    <!-- Expiry notice -->
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                      <tr>
                        <td style="background-color:#f8f9ff;border:1px solid #e0e8ff;border-radius:8px;padding:12px 16px;">
                          <p style="margin:0;font-size:13px;color:#4b5563;line-height:1.5;">
                            This code expires in <strong>${expiryMinutes} minutes</strong> and can only be used once.
                          </p>
                        </td>
                      </tr>
                    </table>

                    <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
                      If you did not request this code, please ignore this email and ensure your account is secure.
                    </p>

                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 0 0;text-align:center;">
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

export async function sendOTPEmail(to: string, code: string): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    logger.info({ to, code }, 'Admin OTP generated (dev)');
  }

  const html = buildOTPEmail(code, config.magicLinkExpiryMinutes);

  const response = await fetch(`${config.useSendBaseUrl}/v1/emails`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.useSendApiKey}`,
    },
    body: JSON.stringify({
      from: config.emailFrom,
      to,
      subject: 'Your Scout AI Admin Login Code',
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error({ status: response.status, body, to }, 'Failed to send OTP email');
    throw new Error(`Email delivery failed: ${response.status} ${body}`);
  }

  const { emailId } = await response.json() as { emailId: string };
  logger.info({ emailId, to }, 'Admin OTP email sent');
}

export async function sendMagicLinkEmail(to: string, token: string): Promise<void> {
  const magicLink = `${config.frontendUrl}/sign-in/verify?token=${token}`;

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
      subject: 'Your Scout AI Login Link',
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
