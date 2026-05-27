class RankingManager {
  static async fetch(difficulty, limit = 20) {
    try {
      const res = await fetch(`/api/ranking?difficulty=${difficulty}&limit=${limit}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.rankings || [];
    } catch {
      return [];
    }
  }

  static async submit(name, difficulty, score, wave, kills, accuracy) {
    try {
      const res = await fetch('/api/ranking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, difficulty, score, wave, kills, accuracy })
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

window.RankingManager = RankingManager;
