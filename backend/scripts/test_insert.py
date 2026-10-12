import sys
sys.path.insert(0, "backend")
from app.db.postgres import get_connection
from app.auth.password import hash_password
from app.auth.service import create_verification_token
from app.auth.email import send_verification_email

try:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            password_hash = hash_password("Password123!")
            cursor.execute(
                """
                INSERT INTO public.users (
                    full_name,
                    email,
                    phone,
                    password_hash,
                    status
                )
                VALUES (%s, %s, %s, %s, 'INACTIVE')
                RETURNING
                    user_id,
                    full_name,
                    email,
                    phone,
                    role,
                    status,
                    created_at,
                    updated_at
                """,
                ("Test Name", "test_random_1234@gmail.com", None, password_hash),
            )
            user = cursor.fetchone()
            print("User inserted successfully:", user)
            connection.rollback()
except Exception as e:
    import traceback
    traceback.print_exc()
