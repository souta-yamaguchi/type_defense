import json
import os
from pathlib import Path

from flask import Flask, jsonify, render_template, request

import db

ROOT = Path(__file__).resolve().parent
WORDS_PATH = ROOT / "data" / "words.json"

app = Flask(__name__,
            template_folder=str(ROOT / "templates"),
            static_folder=str(ROOT / "static"))

with WORDS_PATH.open("r", encoding="utf-8") as f:
    WORDS = json.load(f)

print(f"[startup] 辞書ロード完了: easy={len(WORDS.get('easy', []))} / normal={len(WORDS.get('normal', []))} / hard={len(WORDS.get('hard', []))}")

db.init_db()
print("[startup] DB初期化完了")


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/words")
def api_words():
    return jsonify(WORDS)


@app.route("/api/ranking", methods=["GET"])
def api_ranking_get():
    difficulty = request.args.get("difficulty", "normal")
    limit = min(int(request.args.get("limit", 20)), 100)
    if difficulty not in ("easy", "normal", "hard"):
        return jsonify({"error": "invalid difficulty"}), 400
    rankings = db.get_rankings(difficulty, limit)
    return jsonify({"rankings": rankings})


@app.route("/api/ranking", methods=["POST"])
def api_ranking_post():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()[:20]
    difficulty = str(data.get("difficulty", ""))
    score = data.get("score", 0)
    wave = data.get("wave", 0)
    kills = data.get("kills", 0)
    accuracy = data.get("accuracy", 0)

    if not name:
        return jsonify({"error": "name required"}), 400
    if difficulty not in ("easy", "normal", "hard"):
        return jsonify({"error": "invalid difficulty"}), 400
    if not isinstance(score, (int, float)) or score < 0 or score > 999999:
        return jsonify({"error": "invalid score"}), 400

    db.add_ranking(name, difficulty, int(score), int(wave), int(kills), float(accuracy))
    return jsonify({"ok": True})


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
