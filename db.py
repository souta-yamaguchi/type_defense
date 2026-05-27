import os
from contextlib import contextmanager

DATABASE_URL = os.environ.get("DATABASE_URL")

if DATABASE_URL:
    import psycopg2

    @contextmanager
    def get_conn():
        conn = psycopg2.connect(DATABASE_URL)
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def init_db():
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute("""
                CREATE TABLE IF NOT EXISTS rankings (
                    id SERIAL PRIMARY KEY,
                    player_name VARCHAR(20) NOT NULL,
                    difficulty VARCHAR(10) NOT NULL,
                    score INTEGER NOT NULL,
                    wave INTEGER NOT NULL,
                    kills INTEGER NOT NULL,
                    accuracy REAL NOT NULL,
                    played_at TIMESTAMP DEFAULT NOW()
                )
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_rankings_diff_score
                ON rankings (difficulty, score DESC)
            """)

    def get_rankings(difficulty, limit=20):
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT player_name, score, wave, kills, accuracy, played_at "
                "FROM rankings WHERE difficulty = %s ORDER BY score DESC LIMIT %s",
                (difficulty, limit),
            )
            return [
                {
                    "name": r[0],
                    "score": r[1],
                    "wave": r[2],
                    "kills": r[3],
                    "accuracy": r[4],
                    "date": r[5].isoformat() if r[5] else None,
                }
                for r in cur.fetchall()
            ]

    def add_ranking(player_name, difficulty, score, wave, kills, accuracy):
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO rankings (player_name, difficulty, score, wave, kills, accuracy) "
                "VALUES (%s, %s, %s, %s, %s, %s)",
                (player_name, difficulty, score, wave, kills, accuracy),
            )

else:
    _memory_rankings = []

    def init_db():
        pass

    def get_rankings(difficulty, limit=20):
        filtered = [r for r in _memory_rankings if r["difficulty"] == difficulty]
        filtered.sort(key=lambda r: r["score"], reverse=True)
        return filtered[:limit]

    def add_ranking(player_name, difficulty, score, wave, kills, accuracy):
        from datetime import datetime
        _memory_rankings.append({
            "name": player_name,
            "difficulty": difficulty,
            "score": score,
            "wave": wave,
            "kills": kills,
            "accuracy": accuracy,
            "date": datetime.now().isoformat(),
        })
