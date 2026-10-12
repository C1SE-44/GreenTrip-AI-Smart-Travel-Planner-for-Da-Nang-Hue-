import sys
sys.path.insert(0, "backend")
from app.db.postgres import get_connection

with get_connection() as conn:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'users'
            ORDER BY ordinal_position;
        """)
        print("Columns in public.users:")
        for r in cur.fetchall():
            print(r)
        
        cur.execute("SELECT user_id, full_name, email, role, status FROM public.users;")
        print("Existing rows in public.users:")
        for r in cur.fetchall():
            print(r)

