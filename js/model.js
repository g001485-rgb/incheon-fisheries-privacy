/* 작업일지 데이터 모델
 * 원본 양식(조개류생산동 작업내용)의 칸 구성을 그대로 옮긴 구조입니다. */

const ROOMS = [
  { key: 'mopae',   label: '모패',  sub: '관리실', rows: 4 },
  { key: 'chipae',  label: '치패',  sub: '사육실', rows: 4 },
  { key: 'yusaeng', label: '유생',  sub: '사육실', rows: 2 },
];

function emptyRow() {
  return { species: '', tank: '', feed: '' };
}

function emptyRoom(rowCount) {
  return {
    rows: Array.from({ length: rowCount }, emptyRow),
    // 여러 줄을 묶어 한 칸에 적는 공통 먹이 메모(원본의 중괄호 부분)
    common: '',
  };
}

function emptyDoc() {
  const today = new Date();
  return {
    title: '조개류생산동 작업내용',
    date: {
      y: today.getFullYear(),
      m: today.getMonth() + 1,
      d: today.getDate(),
      w: weekdayOf(today.getFullYear(), today.getMonth() + 1, today.getDate()),
    },
    inoculation: { danji: '', acryl: '', large: '' },
    feeding: {
      mopae: emptyRoom(4),
      chipae: emptyRoom(4),
      yusaeng: emptyRoom(2),
    },
    notes: ['', ''],
  };
}

/* 예시 사진(2026-09-12)에서 읽어낸 내용 */
function sampleDoc() {
  const doc = emptyDoc();
  doc.date = { y: 2026, m: 9, d: 12, w: '토' };
  doc.inoculation = {
    danji: 'Ph8, T4, I8, Pv4',
    acryl: 'Ph2, I1, Pv1',
    large: 'T1',
  };
  doc.feeding.chipae.rows = [
    { species: '참담치 小',   tank: '11, 12', feed: '' },
    { species: '참담치 中',   tank: '13, 14', feed: '' },
    { species: '참담치 大',   tank: '15',     feed: '' },
    { species: '참담치 小小', tank: '16',     feed: '' },
  ];
  doc.feeding.chipae.common =
    '· 단지 : Ph4, I2, PL1\n· 아크릴 : I1, Ph2, PL1\n· 대형수조 : T½';
  doc.notes = [
    '환수량 줄이기 － 250 or 290',
    '참담치 수조 오전 9시 사육환경 측정 후 환수',
    '참담치 치패 수조 담수 청소 － 월, 목',
  ];
  return doc;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function weekdayOf(y, m, d) {
  if (!y || !m || !d) return '';
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== Number(y) || dt.getMonth() !== Number(m) - 1) return '';
  return WEEKDAYS[dt.getDay()];
}

/* 저장된 데이터가 예전 구조여도 깨지지 않게 형태를 맞춥니다. */
function normalize(raw) {
  const base = emptyDoc();
  if (!raw || typeof raw !== 'object') return base;

  base.title = raw.title || base.title;
  if (raw.date) Object.assign(base.date, raw.date);
  if (raw.inoculation) Object.assign(base.inoculation, raw.inoculation);

  ROOMS.forEach(({ key, rows }) => {
    const src = raw.feeding && raw.feeding[key];
    if (!src) return;
    base.feeding[key].common = src.common || '';
    const srcRows = Array.isArray(src.rows) ? src.rows : [];
    base.feeding[key].rows = Array.from({ length: Math.max(rows, srcRows.length) },
      (_, i) => Object.assign(emptyRow(), srcRows[i] || {}));
  });

  if (Array.isArray(raw.notes)) base.notes = raw.notes.slice();
  return base;
}
