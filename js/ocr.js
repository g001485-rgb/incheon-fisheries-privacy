/* 사진에서 글자·숫자를 읽어오고(Tesseract.js), 양식의 칸에 맞게 나눠 담습니다.
 * 손글씨 인식은 완벽하지 않으므로 결과는 항상 초안으로 다룹니다. */

const OCR_LANG = 'kor+eng';
const OCR_PATHS = {
  workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/worker.min.js',
  corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0',
  langPath: 'https://tessdata.projectnaptha.com/4.0.0',
};

/* 사진을 너무 크게 보내면 느려서, 긴 변 기준 2000px 로 줄이고 대비를 올립니다. */
async function preprocess(dataUrl, maxSide = 2000) {
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(img.width * scale);
  cv.height = Math.round(img.height * scale);

  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0, cv.width, cv.height);

  const pix = ctx.getImageData(0, 0, cv.width, cv.height);
  const px = pix.data;
  for (let i = 0; i < px.length; i += 4) {
    const gray = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    // 가운데 밝기를 기준으로 대비를 세게 주어 글씨와 배경을 갈라 놓습니다.
    const v = Math.max(0, Math.min(255, (gray - 128) * 1.6 + 128));
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(pix, 0, 0);
  return cv.toDataURL('image/png');
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 열 수 없습니다.'));
    img.src = src;
  });
}

/* @param onProgress ({percent, message}) */
async function recognize(dataUrl, onProgress) {
  if (typeof Tesseract === 'undefined') {
    throw new Error('문자 인식 모듈을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.');
  }
  onProgress({ percent: 5, message: '사진 준비 중…' });
  const prepared = await preprocess(dataUrl);

  onProgress({ percent: 12, message: '인식 엔진 불러오는 중… (처음에는 시간이 걸립니다)' });
  const worker = await Tesseract.createWorker(OCR_LANG, 1, {
    ...OCR_PATHS,
    logger: (log) => {
      if (log.status === 'recognizing text') {
        onProgress({ percent: 20 + Math.round(log.progress * 78), message: '글자 읽는 중…' });
      }
    },
  });

  try {
    const { data } = await worker.recognize(prepared);
    onProgress({ percent: 100, message: '인식 완료' });
    return data.text || '';
  } finally {
    await worker.terminate();
  }
}

/* ---------- 인식된 원문을 양식 칸으로 나누기 ---------- */

// Ph8, T4, I8, Pv4, PL1, T½ 같은 먹이 코드
const FEED_TOKEN = /\b(Ph|PL|Pv|Pl|T|I|N|C)\s*(\d+(?:\/\d+)?|[½¼¾])/gi;

function feedTokens(line) {
  const found = [];
  let m;
  FEED_TOKEN.lastIndex = 0;
  while ((m = FEED_TOKEN.exec(line)) !== null) {
    found.push(normalizeCode(m[1]) + m[2]);
  }
  return found;
}

function normalizeCode(code) {
  const map = { ph: 'Ph', pl: 'PL', pv: 'Pv', t: 'T', i: 'I', n: 'N', c: 'C' };
  return map[code.toLowerCase()] || code;
}

/* 원문 텍스트에서 읽어낼 수 있는 항목만 골라 문서에 덮어씁니다.
 * 못 읽은 칸은 건드리지 않아 사용자가 이미 적어둔 내용이 지워지지 않습니다. */
function parseText(text, base) {
  const doc = normalize(JSON.parse(JSON.stringify(base)));
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const filled = [];

  // 날짜: 2026 년 9 월 12 일 ( 토 )
  const dateHit = text.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*[(（]?\s*([월화수목금토일])?/);
  if (dateHit) {
    doc.date.y = Number(dateHit[1]);
    doc.date.m = Number(dateHit[2]);
    doc.date.d = Number(dateHit[3]);
    doc.date.w = dateHit[4] || weekdayOf(doc.date.y, doc.date.m, doc.date.d);
    filled.push('작업일');
  }

  // 접종: '단지' / '아크릴' / '대형' 이 적힌 줄(또는 바로 다음 줄)의 먹이 코드
  const inoTargets = [
    { key: 'danji', words: ['단지', '단 지'], label: '단지 접종' },
    { key: 'acryl', words: ['아크릴', '아크린'], label: '아크릴 접종' },
    { key: 'large', words: ['대형', '대 형'], label: '대형 접종' },
  ];
  const usedLines = new Set(); // 접종 칸에 쓴 줄은 아래에서 다시 쓰지 않습니다.
  lines.forEach((line, i) => {
    inoTargets.forEach((t) => {
      if (doc.inoculation[t.key]) return;
      if (!t.words.some((w) => line.includes(w))) return;
      const here = feedTokens(line);
      const codes = here.length ? here : feedTokens(lines[i + 1] || '');
      if (!codes.length) return;
      doc.inoculation[t.key] = codes.join(', ');
      usedLines.add(i);
      if (!here.length) usedLines.add(i + 1);
      filled.push(t.label);
    });
  });

  // 치패 사육실: '품종 + 크기(小/中/大) + 수조번호' 형태의 줄
  const sizeLine = /(참담치|가리비|바지락|굴|전복|[가-힣]{2,4})\s*([小中大]+|소소|소|중|대)\s*[:\-]?\s*([\d\s,·]+)/;
  const rows = [];
  lines.forEach((line) => {
    const hit = line.match(sizeLine);
    if (!hit) return;
    const tank = hit[3].replace(/[·\s]+/g, ' ').replace(/\s*,\s*/g, ', ').trim();
    if (!/\d/.test(tank)) return;
    rows.push({ species: `${hit[1]} ${hit[2]}`, tank, feed: '' });
  });
  if (rows.length) {
    doc.feeding.chipae.rows = rows.concat(
      Array.from({ length: Math.max(0, 4 - rows.length) }, emptyRow)
    );
    filled.push('치패 사육실');
  }

  // 치패 공통 먹이: 접종 칸에 쓰지 않은 줄 가운데 '단지/아크릴/대형수조 : 코드' 형태
  const commonLines = lines
    .map((line, i) => ({ line, i }))
    .filter(({ line, i }) => !usedLines.has(i)
      && /(단지|아크릴|대형\s*수조)/.test(line)
      && feedTokens(line).length)
    .map(({ line }) => {
      const head = line.match(/(단지|아크릴|대형\s*수조)/)[1].replace(/\s+/g, '');
      return `· ${head} : ${feedTokens(line).join(', ')}`;
    });
  if (commonLines.length >= 2) {
    doc.feeding.chipae.common = [...new Set(commonLines)].join('\n');
    filled.push('치패 먹이');
  }

  // 기타 주의사항
  const notes = parseNotes(lines);
  if (notes.length) {
    doc.notes = notes;
    filled.push('기타 주의사항');
  }

  return { doc, filled };
}

/* 주의사항 칸은 '·' 로 항목이 나뉘고, 이어지는 줄에는 표시가 없습니다.
 * 표시가 없는 줄은 앞 항목이 이어진 것으로 보고 붙입니다.
 * 원본이 좌우 두 칸으로 나뉘어 있어 인식 순서가 섞일 수 있으므로,
 * 여기서 만든 내용은 특히 눈으로 확인해야 합니다. */
const BULLET = /[·ㆍ•*]/;
const LABEL = /기타|주의\s*사항/;
const LABEL_ALL = /기타|주의\s*사항/g;

function parseNotes(lines) {
  const start = lines.findIndex((l) => LABEL.test(l));
  const region = start >= 0
    ? lines.slice(start)
    : lines.filter((l) => BULLET.test(l) || /(환수|청소|측정|담수)/.test(l));

  const notes = [];
  region.forEach((line) => {
    const cleaned = line.replace(LABEL_ALL, '').trim();
    if (!cleaned) return;

    if (!BULLET.test(cleaned)) {
      // 표시 없는 줄 → 앞 항목에 이어 붙이기
      if (notes.length) notes[notes.length - 1] += ` ${cleaned.replace(/^[-－–—]\s*/, '－ ')}`;
      else if (cleaned.length > 2) notes.push(cleaned);
      return;
    }
    cleaned.split(BULLET)
      .map((part) => part.trim())
      .filter((part) => part.length > 2)
      .forEach((part) => notes.push(part));
  });

  return [...new Set(notes)].slice(0, 8);
}
