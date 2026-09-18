# Email Templates for Supabase Auth

Use these in the Supabase Dashboard under Authentication > Email Templates.

## Forgot password template

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reset your password</title>
  </head>
  <body style="margin:0;padding:0;background:#f5fff9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5fff9;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" max-width="640" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border:1px solid #d1fae5;border-radius:24px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 18px;background:linear-gradient(135deg,#10b981 0%,#22c55e 100%);">
                <div style="display:inline-block;background:rgba(255,255,255,0.18);padding:10px 14px;border-radius:12px;border:1px solid rgba(255,255,255,0.3);color:#ffffff;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;">
                  SecureChat Pro
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 32px 20px;">
                <h1 style="margin:0 0 12px;color:#0f172a;font-size:30px;line-height:1.25;">Reset your password</h1>
                <p style="margin:0 0 22px;color:#475569;font-size:16px;line-height:1.7;">
                  Hello, we received a request to reset the password for your SecureChat Pro account.
                </p>
                <p style="margin:0 0 28px;color:#475569;font-size:16px;line-height:1.7;">
                  Click the button below to choose a new password and get back to your secure conversations.
                </p>
                <div style="text-align:center;margin:0 0 28px;">
                  <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:linear-gradient(135deg,#10b981 0%,#22c55e 100%);color:#ffffff;text-decoration:none;padding:16px 28px;border-radius:12px;font-size:15px;font-weight:bold;box-shadow:0 12px 30px rgba(16,185,129,0.25);">
                    Reset Password
                  </a>
                </div>
                <p style="margin:0 0 12px;color:#64748b;font-size:13px;line-height:1.7;">
                  If the button above does not work, copy and paste this link into your browser:
                </p>
                <p style="margin:0;padding:12px 14px;border:1px solid #d1fae5;border-radius:10px;background:#f0fdf4;color:#065f46;font-size:12px;word-break:break-all;">
                  {{ .ConfirmationURL }}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px;">
                <div style="border-top:1px solid #dcfce7;padding-top:18px;color:#64748b;font-size:12px;line-height:1.7;">
                  If you did not request this, you can safely ignore this message. Your account will remain protected.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

## Confirm email template

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Confirm your email</title>
  </head>
  <body style="margin:0;padding:0;background:#f5fff9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5fff9;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" max-width="640" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border:1px solid #d1fae5;border-radius:24px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 18px;background:linear-gradient(135deg,#10b981 0%,#22c55e 100%);">
                <div style="display:inline-block;background:rgba(255,255,255,0.18);padding:10px 14px;border-radius:12px;border:1px solid rgba(255,255,255,0.3);color:#ffffff;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;">
                  Welcome to SecureChat Pro
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 32px 20px;">
                <h1 style="margin:0 0 12px;color:#0f172a;font-size:30px;line-height:1.25;">Confirm your email address</h1>
                <p style="margin:0 0 22px;color:#475569;font-size:16px;line-height:1.7;">
                  Thanks for joining SecureChat Pro. To complete your registration and secure your account, please confirm your email address.
                </p>
                <div style="text-align:center;margin:0 0 28px;">
                  <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:linear-gradient(135deg,#10b981 0%,#22c55e 100%);color:#ffffff;text-decoration:none;padding:16px 28px;border-radius:12px;font-size:15px;font-weight:bold;box-shadow:0 12px 30px rgba(16,185,129,0.25);">
                    Confirm Email
                  </a>
                </div>
                <p style="margin:0 0 12px;color:#64748b;font-size:13px;line-height:1.7;">
                  If the button above does not work, copy and paste this link into your browser:
                </p>
                <p style="margin:0;padding:12px 14px;border:1px solid #d1fae5;border-radius:10px;background:#f0fdf4;color:#065f46;font-size:12px;word-break:break-all;">
                  {{ .ConfirmationURL }}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px;">
                <div style="border-top:1px solid #dcfce7;padding-top:18px;color:#64748b;font-size:12px;line-height:1.7;">
                  You are almost ready to start messaging securely.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

The templates use the existing SecureChat Pro branding and the green-and-white app theme.
