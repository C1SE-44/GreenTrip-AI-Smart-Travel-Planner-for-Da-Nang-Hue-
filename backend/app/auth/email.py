import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import get_settings

logger = logging.getLogger(__name__)


def build_verification_html(full_name: str, verification_link: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kích hoạt tài khoản GreenTrip AI</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f6f8f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #2d3748;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f6f8f6; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 580px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 32px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 700; letter-spacing: -0.5px;">🌿 GreenTrip AI</h1>
              <p style="margin: 6px 0 0 0; color: #ecfdf5; font-size: 14px;">Smart Travel Planner for Da Nang & Hue</p>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 36px 32px;">
              <h2 style="margin: 0 0 16px 0; color: #1e293b; font-size: 20px; font-weight: 600;">Xin chào {full_name},</h2>
              <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #475569;">
                Cảm ơn bạn đã đăng ký tài khoản tại <strong>GreenTrip AI</strong> — nền tảng đồng hành lên lịch trình du lịch xanh thông minh khám phá Đà Nẵng và Huế.
              </p>
              <p style="margin: 0 0 28px 0; font-size: 15px; line-height: 1.6; color: #475569;">
                Vui lòng nhấn vào nút bên dưới để xác nhận địa chỉ email và kích hoạt tài khoản của bạn:
              </p>
              <!-- Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 28px;">
                <tr>
                  <td align="center">
                    <a href="{verification_link}" target="_blank" style="display: inline-block; background-color: #059669; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 10px; font-weight: 600; font-size: 15px; box-shadow: 0 2px 8px rgba(5, 150, 105, 0.35);">
                      Kích hoạt tài khoản ngay 🚀
                    </a>
                  </td>
                </tr>
              </table>
              <div style="background-color: #f8fafc; border-left: 4px solid #10b981; padding: 14px 16px; border-radius: 6px; margin-bottom: 24px;">
                <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.5;">
                  ⏱️ <strong>Lưu ý:</strong> Liên kết này chỉ có hiệu lực trong vòng <strong>24 giờ</strong>. Nếu bạn không thực hiện đăng ký tài khoản tại GreenTrip, vui lòng bỏ qua email này.
                </p>
              </div>
              <p style="margin: 0 0 8px 0; font-size: 13px; color: #94a3b8;">
                Nếu không thể nhấn vào nút trên, hãy copy và dán liên kết sau vào trình duyệt của bạn:
              </p>
              <p style="margin: 0; font-size: 12px; color: #0284c7; word-break: break-all;">
                <a href="{verification_link}" style="color: #0284c7;">{verification_link}</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f1f5f9; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 12px; color: #64748b;">
                GreenTrip AI — Đồng hành vì những chuyến đi xanh và bền vững.
              </p>
              <p style="margin: 4px 0 0 0; font-size: 11px; color: #94a3b8;">
                Đà Nẵng & Huế, Việt Nam
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def send_verification_email(email: str, full_name: str, token: str) -> bool:
    """Send an account verification email or simulate it if SMTP is unconfigured."""
    settings = get_settings()
    verification_link = f"{settings.FRONTEND_URL}/verify-email?token={token}"

    if not settings.smtp_configured:
        logger.info(
            "[EMAIL SIMULATION] Verification link for %s: %s",
            email,
            verification_link,
        )
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "🌿 Kích hoạt tài khoản GreenTrip AI của bạn"
        msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
        msg["To"] = email

        plain_text = (
            f"Xin chào {full_name},\n\n"
            f"Vui lòng kích hoạt tài khoản GreenTrip AI của bạn bằng liên kết sau:\n"
            f"{verification_link}\n\n"
            f"Liên kết có hiệu lực trong vòng 24 giờ.\n"
        )
        html_text = build_verification_html(full_name, verification_link)

        msg.attach(MIMEText(plain_text, "plain", "utf-8"))
        msg.attach(MIMEText(html_text, "html", "utf-8"))

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD.replace(" ", ""))
            server.send_message(msg)

        logger.info("Verification email successfully sent to %s via SMTP", email)
        return True
    except Exception as exc:
        logger.error("Failed to send verification email to %s: %s", email, exc)
        return False


def build_otp_html(full_name: str, otp_code: str) -> str:
    """Generate HTML body for 2FA OTP verification email."""
    return f"""<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mã xác thực 2 bước (OTP) - GreenTrip AI</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f6f8f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #2d3748;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f6f8f6; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 580px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 32px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 700; letter-spacing: -0.5px;">🌿 GreenTrip AI</h1>
              <p style="margin: 6px 0 0 0; color: #ecfdf5; font-size: 14px;">Xác thực 2 bước (Two-Factor Authentication)</p>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 36px 32px;">
              <h2 style="margin: 0 0 16px 0; color: #1e293b; font-size: 20px; font-weight: 600;">Xin chào {full_name},</h2>
              <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #475569;">
                Bạn vừa yêu cầu đăng nhập vào tài khoản GreenTrip AI thông qua Google. Để bảo vệ tài khoản, vui lòng sử dụng mã xác thực OTP 6 chữ số dưới đây:
              </p>
              <!-- OTP Box -->
              <div style="background-color: #f0fdf4; border: 2px dashed #059669; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 13px; color: #047857; text-transform: uppercase; font-weight: 600; letter-spacing: 1px;">Mã OTP của bạn</p>
                <div style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 38px; font-weight: 800; color: #065f46; letter-spacing: 8px;">
                  {otp_code}
                </div>
              </div>
              <div style="background-color: #f8fafc; border-left: 4px solid #f59e0b; padding: 14px 16px; border-radius: 6px; margin-bottom: 24px;">
                <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.5;">
                  ⏱️ <strong>Lưu ý:</strong> Mã này có hiệu lực trong <strong>5 phút</strong>. Tuyệt đối không chia sẻ mã này với bất kỳ ai để đảm bảo an toàn cho tài khoản.
                </p>
              </div>
              <p style="margin: 0; font-size: 13px; color: #94a3b8; line-height: 1.5;">
                Nếu bạn không thực hiện đăng nhập này, vui lòng bỏ qua email hoặc đổi mật khẩu tài khoản Google của bạn ngay lập tức.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f1f5f9; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 12px; color: #64748b;">
                GreenTrip AI — Đồng hành vì những chuyến đi xanh và bền vững.
              </p>
              <p style="margin: 4px 0 0 0; font-size: 11px; color: #94a3b8;">
                Đà Nẵng & Huế, Việt Nam
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def send_otp_email(email: str, full_name: str, otp_code: str) -> bool:
    """Send a 2FA OTP code via email or simulate if unconfigured."""
    settings = get_settings()

    if not settings.smtp_configured:
        logger.info(
            "[EMAIL SIMULATION] 2FA OTP code for %s: %s",
            email,
            otp_code,
        )
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"🔐 {otp_code} là mã xác thực GreenTrip AI của bạn"
        msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
        msg["To"] = email

        plain_text = (
            f"Xin chào {full_name},\n\n"
            f"Mã xác thực OTP 2 bước của bạn là: {otp_code}\n\n"
            f"Mã có hiệu lực trong vòng 5 phút. Vui lòng không chia sẻ mã này cho bất kỳ ai.\n"
        )
        html_text = build_otp_html(full_name, otp_code)

        msg.attach(MIMEText(plain_text, "plain", "utf-8"))
        msg.attach(MIMEText(html_text, "html", "utf-8"))

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD.replace(" ", ""))
            server.send_message(msg)

        logger.info("2FA OTP email successfully sent to %s via SMTP", email)
        return True
    except Exception as exc:
        logger.error("Failed to send 2FA OTP email to %s: %s", email, exc)
        return False

