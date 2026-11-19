import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import get_settings
from app.db.neo4j import verify_neo4j_connection


def main() -> None:
    settings = get_settings()
    if not settings.neo4j_configured:
        print("Neo4j integration is prepared, but live verification requires the user's Aura credentials.")
        return

    try:
        result = verify_neo4j_connection()
        if result.get("status") == "connected":
            print("Neo4j Aura connection: OK")
            print(f"Database: {result.get('database')}")
            print(f"Host: {result.get('uri')}")
        else:
            print("Neo4j integration is prepared, but live verification requires the user's Aura credentials.")
    except Exception as exc:
        print("Neo4j integration is prepared, but live verification requires the user's Aura credentials.")
        print(f"Connection attempt failed: {type(exc).__name__}")


if __name__ == "__main__":
    main()
