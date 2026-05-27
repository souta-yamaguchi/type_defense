const ROMAJI_TABLE = {
  'あ': ['a'], 'い': ['i'], 'う': ['u'], 'え': ['e'], 'お': ['o'],
  'か': ['ka', 'ca'], 'き': ['ki'], 'く': ['ku', 'cu', 'qu'], 'け': ['ke'], 'こ': ['ko', 'co'],
  'さ': ['sa'], 'し': ['si', 'shi', 'ci'], 'す': ['su'], 'せ': ['se', 'ce'], 'そ': ['so'],
  'た': ['ta'], 'ち': ['ti', 'chi'], 'つ': ['tu', 'tsu'], 'て': ['te'], 'と': ['to'],
  'な': ['na'], 'に': ['ni'], 'ぬ': ['nu'], 'ね': ['ne'], 'の': ['no'],
  'は': ['ha'], 'ひ': ['hi'], 'ふ': ['hu', 'fu'], 'へ': ['he'], 'ほ': ['ho'],
  'ま': ['ma'], 'み': ['mi'], 'む': ['mu'], 'め': ['me'], 'も': ['mo'],
  'や': ['ya'], 'ゆ': ['yu'], 'よ': ['yo'],
  'ら': ['ra'], 'り': ['ri'], 'る': ['ru'], 'れ': ['re'], 'ろ': ['ro'],
  'わ': ['wa'], 'を': ['wo'], 'ん': ['nn', "n'", 'xn'],
  'が': ['ga'], 'ぎ': ['gi'], 'ぐ': ['gu'], 'げ': ['ge'], 'ご': ['go'],
  'ざ': ['za'], 'じ': ['zi', 'ji'], 'ず': ['zu'], 'ぜ': ['ze'], 'ぞ': ['zo'],
  'だ': ['da'], 'ぢ': ['di'], 'づ': ['du', 'dzu'], 'で': ['de'], 'ど': ['do'],
  'ば': ['ba'], 'び': ['bi'], 'ぶ': ['bu'], 'べ': ['be'], 'ぼ': ['bo'],
  'ぱ': ['pa'], 'ぴ': ['pi'], 'ぷ': ['pu'], 'ぺ': ['pe'], 'ぽ': ['po'],
  'きゃ': ['kya'], 'きゅ': ['kyu'], 'きょ': ['kyo'],
  'しゃ': ['sya', 'sha'], 'しゅ': ['syu', 'shu'], 'しょ': ['syo', 'sho'],
  'ちゃ': ['tya', 'cha', 'cya'], 'ちゅ': ['tyu', 'chu', 'cyu'], 'ちょ': ['tyo', 'cho', 'cyo'],
  'にゃ': ['nya'], 'にゅ': ['nyu'], 'にょ': ['nyo'],
  'ひゃ': ['hya'], 'ひゅ': ['hyu'], 'ひょ': ['hyo'],
  'みゃ': ['mya'], 'みゅ': ['myu'], 'みょ': ['myo'],
  'りゃ': ['rya'], 'りゅ': ['ryu'], 'りょ': ['ryo'],
  'ぎゃ': ['gya'], 'ぎゅ': ['gyu'], 'ぎょ': ['gyo'],
  'じゃ': ['ja', 'zya', 'jya'], 'じゅ': ['ju', 'zyu', 'jyu'], 'じょ': ['jo', 'zyo', 'jyo'],
  'びゃ': ['bya'], 'びゅ': ['byu'], 'びょ': ['byo'],
  'ぴゃ': ['pya'], 'ぴゅ': ['pyu'], 'ぴょ': ['pyo'],
  'てぃ': ['thi', 'texi'], 'でぃ': ['dhi', 'dexi'],
  'ちぇ': ['che', 'tye'], 'しぇ': ['she', 'sye'], 'じぇ': ['je', 'zye'],
  'ふぁ': ['fa'], 'ふぃ': ['fi'], 'ふぇ': ['fe'], 'ふぉ': ['fo'],
  'うぃ': ['wi'], 'うぇ': ['we'], 'うぉ': ['uxo'],
  'つぁ': ['tsa'],
  'ぁ': ['xa', 'la'], 'ぃ': ['xi', 'li'], 'ぅ': ['xu', 'lu'],
  'ぇ': ['xe', 'le'], 'ぉ': ['xo', 'lo'],
  'ゃ': ['xya', 'lya'], 'ゅ': ['xyu', 'lyu'], 'ょ': ['xyo', 'lyo'],
  'ー': ['-'],
  'っ': ['xtu', 'xtsu', 'ltu', 'ltsu'],
};

const VOWELS_AND_NY = new Set(['a', 'i', 'u', 'e', 'o', 'n', 'y']);

function katakanaToHiragana(str) {
  return str.replace(/[ァ-ヶ]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  ).replace(/ー/g, 'ー');
}

function segmentWord(word) {
  const segments = [];
  let i = 0;
  while (i < word.length) {
    if (i + 1 < word.length) {
      const two = word[i] + word[i + 1];
      if (ROMAJI_TABLE[two]) {
        segments.push(two);
        i += 2;
        continue;
      }
    }
    segments.push(word[i]);
    i++;
  }
  return segments;
}

function getPatternsForSegment(seg, nextSeg, prevSeg) {
  if (seg === 'っ' && nextSeg) {
    const nextPatterns = ROMAJI_TABLE[nextSeg] || [];
    const doublePatterns = [];
    for (const np of nextPatterns) {
      const consonant = np[0];
      if (consonant && !('aiueo'.includes(consonant))) {
        doublePatterns.push(consonant);
      }
    }
    const standalone = ROMAJI_TABLE['っ'] || [];
    return [...new Set([...doublePatterns, ...standalone])];
  }

  if (seg === 'ん') {
    const base = ['nn', "n'", 'xn'];
    if (!nextSeg) {
      return ['n', ...base];
    }
    const nextPatterns = ROMAJI_TABLE[nextSeg] || [];
    const nextStarts = new Set(nextPatterns.map(p => p[0]));
    let needsDouble = false;
    for (const c of nextStarts) {
      if (VOWELS_AND_NY.has(c)) {
        needsDouble = true;
        break;
      }
    }
    if (needsDouble) {
      return base;
    }
    return ['n', ...base];
  }

  return ROMAJI_TABLE[seg] || [seg];
}

class RomajiEngine {
  constructor(word) {
    this.word = katakanaToHiragana(word);
    this.segments = segmentWord(this.word);
    this.segIndex = 0;
    this.buffer = '';
    this.confirmed = '';
    this.correctCount = 0;
    this.missCount = 0;
    this._buildPatterns();
  }

  _buildPatterns() {
    this.allPatterns = [];
    for (let i = 0; i < this.segments.length; i++) {
      const patterns = getPatternsForSegment(
        this.segments[i],
        i + 1 < this.segments.length ? this.segments[i + 1] : null,
        i > 0 ? this.segments[i - 1] : null
      );
      this.allPatterns.push(patterns);
    }
  }

  get currentPatterns() {
    if (this.segIndex >= this.allPatterns.length) return [];
    return this.allPatterns[this.segIndex];
  }

  get displayRomaji() {
    let result = this.confirmed;
    for (let i = this.segIndex; i < this.allPatterns.length; i++) {
      result += this.allPatterns[i][0];
    }
    return result;
  }

  get isComplete() {
    return this.segIndex >= this.segments.length;
  }

  get accuracy() {
    const total = this.correctCount + this.missCount;
    return total === 0 ? 1 : this.correctCount / total;
  }

  processKey(key) {
    if (this.isComplete) return { result: 'complete' };

    const testBuffer = this.buffer + key;
    const patterns = this.currentPatterns;

    for (const p of patterns) {
      if (p === testBuffer) {
        this.correctCount++;
        this.confirmed += testBuffer;
        this.buffer = '';
        this.segIndex++;

        if (this.segIndex < this.segments.length && this.segments[this.segIndex - 1] === 'ん') {
          if (testBuffer === 'n') {
            // nothing extra needed
          }
        }

        if (this.segIndex < this.segments.length &&
            this.segments[this.segIndex] !== 'っ' &&
            this._isPreviousSokuon()) {
          // handled in pattern generation
        }

        return { result: this.isComplete ? 'word_complete' : 'segment_complete' };
      }
    }

    for (const p of patterns) {
      if (p.startsWith(testBuffer)) {
        this.correctCount++;
        this.buffer = testBuffer;
        return { result: 'continue' };
      }
    }

    if (this.segments[this.segIndex] === 'ん' && this.buffer === 'n') {
      const nextPatterns = this.segIndex + 1 < this.allPatterns.length
        ? this.allPatterns[this.segIndex + 1] : [];
      for (const np of nextPatterns) {
        if (np.startsWith(key)) {
          this.confirmed += 'n';
          this.buffer = '';
          this.segIndex++;
          return this.processKey(key);
        }
      }
    }

    this.missCount++;
    return { result: 'miss' };
  }

  _isPreviousSokuon() {
    return this.segIndex > 0 && this.segments[this.segIndex - 1] === 'っ';
  }
}

window.RomajiEngine = RomajiEngine;
