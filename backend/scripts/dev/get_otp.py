import os
import sys
from dotenv import load_dotenv
import psycopg

# Fix Windows console UTF-8 encoding
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

load_dotenv()

db_url = os.getenv("DATABASE_URL")
if not db_url:
    print("[ERROR] DATABASE_URL khong ton tai trong file .env")
    exit(1)

try:
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT email, otp_code, purpose, created_at, expires_at
                FROM public.email_otps
                ORDER BY created_at DESC
                LIMIT 5;
            """)
            rows = cur.fetchall()
            
            print("\n========================================================")
            print("         DANH SÁCH MÃ OTP GẦN NHẤT TRONG DATABASE       ")
            print("========================================================")
            for row in rows:
                email, code, purpose, created_at, expires_at = row
                print(f"📧 Email:      {email}")
                print(f"🔑 Mã OTP:     >>> {code} <<<")
                print(f"📌 Mục đích:   {purpose}")
                print(f"⏰ Tạo lúc:    {created_at.strftime('%H:%M:%S %d/%m/%Y')} (UTC)")
                print(f"⏳ Hết hạn:    {expires_at.strftime('%H:%M:%S %d/%m/%Y')} (UTC)")
                print("--------------------------------------------------------")
except Exception as e:
    print(f"[ERROR] Không thể kết nối database: {e}")
