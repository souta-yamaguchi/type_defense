let currentGame = null;
let wordsData = null;
let lastResult = null;

async function loadWords() {
  const res = await fetch('/api/words');
  wordsData = await res.json();
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function startGame(difficulty) {
  showScreen('game-screen');
  const canvas = document.getElementById('gameCanvas');
  canvas.width = 1000;
  canvas.height = 600;
  if (currentGame) currentGame.destroy();
  currentGame = new Game(canvas, difficulty, wordsData, onGameEnd);
}

function onGameEnd(result) {
  lastResult = result;
  currentGame = null;
  showResult(result);
}

function showResult(r) {
  showScreen('result-screen');
  const c = document.getElementById('result-content');

  const accPct = (r.accuracy * 100).toFixed(1);
  const medalColors = { easy: '#4ade80', normal: '#60a5fa', hard: '#f97316' };
  const diffNames = { easy: 'EASY', normal: 'NORMAL', hard: 'HARD' };

  c.innerHTML = `
    <div class="result-header" style="color: ${r.victory ? '#fbbf24' : '#ef4444'}">
      ${r.victory ? 'VICTORY!' : 'GAME OVER'}
    </div>
    <div class="result-difficulty" style="color: ${medalColors[r.difficulty]}">
      ${diffNames[r.difficulty]} MODE
    </div>
    <div class="result-score">${r.score.toLocaleString()} pts</div>
    <div class="result-stats">
      <div class="stat-row"><span>到達Wave</span><span>${r.wave} / ${r.totalWaves}</span></div>
      <div class="stat-row"><span>撃破数</span><span>${r.kills} 体</span></div>
      <div class="stat-row"><span>最大コンボ</span><span>${r.combo}</span></div>
      <div class="stat-row"><span>正確率</span><span>${accPct}%</span></div>
      <div class="stat-row"><span>城壁HP</span><span>${r.wallHp} / ${r.victory ? r.wallHp : 0}</span></div>
    </div>
    <div class="result-ranking-form" id="ranking-form">
      <input type="text" id="player-name" maxlength="12" placeholder="名前を入力（12文字以内）" />
      <button onclick="submitRanking()">ランキング登録</button>
    </div>
    <div id="ranking-msg"></div>
    <div class="result-buttons">
      <button onclick="startGame('${r.difficulty}')">もう一度</button>
      <button onclick="showScreen('title-screen')">タイトルへ</button>
      <button onclick="showRanking('${r.difficulty}')">ランキング</button>
    </div>
  `;

  const saved = localStorage.getItem('td_player_name');
  if (saved) document.getElementById('player-name').value = saved;
}

async function submitRanking() {
  const name = document.getElementById('player-name').value.trim();
  if (!name) {
    document.getElementById('ranking-msg').textContent = '名前を入力してください';
    return;
  }
  localStorage.setItem('td_player_name', name);
  const r = lastResult;
  const ok = await RankingManager.submit(name, r.difficulty, r.score, r.wave, r.kills, r.accuracy);
  document.getElementById('ranking-msg').textContent = ok ? '登録しました！' : '登録に失敗しました';
  document.getElementById('ranking-form').style.display = 'none';
}

async function showRanking(difficulty = 'normal') {
  showScreen('ranking-screen');
  const tabs = document.getElementById('ranking-tabs');
  const body = document.getElementById('ranking-body');

  tabs.innerHTML = ['easy', 'normal', 'hard'].map(d =>
    `<button class="rank-tab ${d === difficulty ? 'active' : ''}" onclick="showRanking('${d}')">${d.toUpperCase()}</button>`
  ).join('');

  body.innerHTML = '<div class="loading">読み込み中...</div>';
  const rankings = await RankingManager.fetch(difficulty);

  if (rankings.length === 0) {
    body.innerHTML = '<div class="no-data">まだランキングデータがありません</div>';
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];
  body.innerHTML = `
    <table class="rank-table">
      <thead>
        <tr><th>#</th><th>名前</th><th>スコア</th><th>Wave</th><th>撃破</th><th>正確率</th><th>日付</th></tr>
      </thead>
      <tbody>
        ${rankings.map((r, i) => `
          <tr class="${i < 3 ? 'top-' + (i + 1) : ''}">
            <td>${i < 3 ? medals[i] : i + 1}</td>
            <td>${escapeHtml(r.name)}</td>
            <td>${r.score.toLocaleString()}</td>
            <td>${r.wave}</td>
            <td>${r.kills}</td>
            <td>${(r.accuracy * 100).toFixed(1)}%</td>
            <td>${formatDate(r.date)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadWords();
  showScreen('title-screen');

  document.querySelectorAll('[data-difficulty]').forEach(btn => {
    btn.addEventListener('click', () => startGame(btn.dataset.difficulty));
  });

  document.getElementById('btn-ranking').addEventListener('click', () => showRanking());
  document.getElementById('btn-back-title').addEventListener('click', () => showScreen('title-screen'));
});
