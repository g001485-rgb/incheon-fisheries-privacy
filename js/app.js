/* 화면 조립 · 입력 반영 · 미리보기 · PDF 저장 */

const STORE_KEY = 'shellfish-worklog:v1';
const $ = (sel) => document.querySelector(sel);

let doc = loadSaved() || emptyDoc();
let imageDataUrl = null;

/* ---------------- 입력 폼 ---------------- */

function buildRoomInputs() {
  const wrap = $('#rooms');
  wrap.innerHTML = '';

  ROOMS.forEach(({ key, label, sub }) => {
    const room = doc.feeding[key];
    const box = document.createElement('div');
    box.className = 'room';
    box.innerHTML = `<h3>${label} <span>${sub}</span></h3>`;

    const table = document.createElement('div');
    table.className = 'room-rows';
    table.innerHTML = `
      <div class="room-head">
        <span>사육품종</span><span>수조번호</span><span>먹이 종류, 수량</span><span></span>
      </div>`;

    room.rows.forEach((row, i) => {
      const line = document.createElement('div');
      line.className = 'room-row';
      line.innerHTML = `
        <input type="text" data-room="${key}" data-idx="${i}" data-f="species" placeholder="예: 참담치 小">
        <input type="text" data-room="${key}" data-idx="${i}" data-f="tank" placeholder="예: 11, 12">
        <input type="text" data-room="${key}" data-idx="${i}" data-f="feed" placeholder="예: Ph4, I2">
        <button type="button" class="btn btn-ghost btn-xs" data-del="${key}:${i}" title="이 줄 지우기">✕</button>`;
      line.querySelectorAll('input').forEach((inp) => { inp.value = row[inp.dataset.f] || ''; });
      table.appendChild(line);
    });

    box.appendChild(table);

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn btn-ghost btn-xs';
    addBtn.textContent = '＋ 줄 추가';
    addBtn.dataset.addRow = key;
    box.appendChild(addBtn);

    const common = document.createElement('label');
    common.className = 'fld';
    common.innerHTML = `공통 먹이 (여러 줄을 묶어 표시)
      <textarea rows="3" data-common="${key}"
        placeholder="예: · 단지 : Ph4, I2, PL1"></textarea>`;
    common.querySelector('textarea').value = room.common || '';
    box.appendChild(common);

    wrap.appendChild(box);
  });
}

function buildNoteInputs() {
  const wrap = $('#notes');
  wrap.innerHTML = '';
  doc.notes.forEach((note, i) => {
    const line = document.createElement('div');
    line.className = 'note-row';
    line.innerHTML = `
      <input type="text" data-note="${i}" placeholder="예: 참담치 수조 오전 9시 측정 후 환수">
      <button type="button" class="btn btn-ghost btn-xs" data-delnote="${i}" title="지우기">✕</button>`;
    line.querySelector('input').value = note || '';
    wrap.appendChild(line);
  });
}

function fillTopInputs() {
  $('#y').value = doc.date.y || '';
  $('#m').value = doc.date.m || '';
  $('#d').value = doc.date.d || '';
  $('#w').value = doc.date.w || '';
  $('#inoDanji').value = doc.inoculation.danji || '';
  $('#inoAcryl').value = doc.inoculation.acryl || '';
  $('#inoLarge').value = doc.inoculation.large || '';
}

function rebuildForm() {
  fillTopInputs();
  buildRoomInputs();
  buildNoteInputs();
  render();
}

/* ---------------- 입력 → 데이터 ---------------- */

document.addEventListener('input', (e) => {
  const t = e.target;

  if (['y', 'm', 'd'].includes(t.id)) {
    doc.date[t.id] = t.value ? Number(t.value) : '';
    const auto = weekdayOf(doc.date.y, doc.date.m, doc.date.d);
    if (auto) { doc.date.w = auto; $('#w').value = auto; }
  } else if (t.id === 'w') {
    doc.date.w = t.value.trim();
  } else if (t.id === 'inoDanji') { doc.inoculation.danji = t.value; }
  else if (t.id === 'inoAcryl') { doc.inoculation.acryl = t.value; }
  else if (t.id === 'inoLarge') { doc.inoculation.large = t.value; }
  else if (t.dataset.room) {
    doc.feeding[t.dataset.room].rows[Number(t.dataset.idx)][t.dataset.f] = t.value;
  } else if (t.dataset.common) {
    doc.feeding[t.dataset.common].common = t.value;
  } else if (t.dataset.note) {
    doc.notes[Number(t.dataset.note)] = t.value;
  } else { return; }

  save();
  render();
});

document.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;

  if (b.dataset.addRow) {
    doc.feeding[b.dataset.addRow].rows.push(emptyRow());
    save(); rebuildForm();
  } else if (b.dataset.del) {
    const [key, idx] = b.dataset.del.split(':');
    const rows = doc.feeding[key].rows;
    if (rows.length > 1) rows.splice(Number(idx), 1);
    else rows[0] = emptyRow();
    save(); rebuildForm();
  } else if (b.dataset.delnote !== undefined) {
    doc.notes.splice(Number(b.dataset.delnote), 1);
    if (!doc.notes.length) doc.notes.push('');
    save(); rebuildForm();
  }
});

$('#addNote').addEventListener('click', () => {
  doc.notes.push('');
  save(); rebuildForm();
  const inputs = $('#notes').querySelectorAll('input');
  inputs[inputs.length - 1].focus();
});

/* ---------------- 미리보기(양식) 그리기 ---------------- */

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const multiline = (s) => esc(s).replace(/\n/g, '<br>');

function roomBlock({ key, label, sub }) {
  const room = doc.feeding[key];
  const rows = room.rows;
  const hasCommon = room.common.trim().length > 0;

  return rows.map((row, i) => {
    const cells = [];
    if (i === 0) {
      cells.push(`<td class="s-room" rowspan="${rows.length}">
        <strong>${esc(label)}</strong><br>${esc(sub)}</td>`);
    }
    cells.push(`<td class="s-species">${esc(row.species)}</td>`);
    cells.push(`<td class="s-tank">${esc(row.tank)}</td>`);

    if (hasCommon) {
      if (i === 0) {
        cells.push(`<td class="s-feed s-common" rowspan="${rows.length}">${multiline(room.common)}</td>`);
      }
    } else {
      cells.push(`<td class="s-feed">${esc(row.feed)}</td>`);
    }
    return `<tr>${cells.join('')}</tr>`;
  }).join('');
}

function render() {
  const { y, m, d, w } = doc.date;
  const notes = doc.notes.filter((n) => n.trim());
  const half = Math.ceil(notes.length / 2) || 1;

  $('#sheet').innerHTML = `
    <h1 class="s-title">${esc(doc.title)}</h1>
    <p class="s-date">
      ${esc(y || '20  ')} 년 ${esc(m || '  ')} 월 ${esc(d || '  ')} 일 ( ${esc(w || '  ')} )
    </p>

    <table class="s-table">
      <colgroup><col class="c-label"><col class="c-key"><col></colgroup>
      <tr>
        <td class="s-label" rowspan="3">식물<br>플랑크톤<br>접종</td>
        <td class="s-key">단 지<br><span>(10ℓ)</span></td>
        <td class="s-val">${esc(doc.inoculation.danji)}</td>
      </tr>
      <tr>
        <td class="s-key">아크릴<br><span>(500ℓ)</span></td>
        <td class="s-val">${esc(doc.inoculation.acryl)}</td>
      </tr>
      <tr>
        <td class="s-key">대 형<br><span>(14톤)</span></td>
        <td class="s-val">${esc(doc.inoculation.large)}</td>
      </tr>
    </table>

    <table class="s-table s-feeding">
      <colgroup>
        <col class="c-label"><col class="c-room"><col class="c-species">
        <col class="c-tank"><col>
      </colgroup>
      <tr>
        <td class="s-label s-vertical" rowspan="${totalFeedRows() + 1}">먹이 공급</td>
        <th>구 분</th><th>사육품종</th><th>수조번호</th><th>먹이 종류, 수량</th>
      </tr>
      ${ROOMS.map(roomBlock).join('')}
    </table>

    <table class="s-table s-notes">
      <colgroup><col class="c-label"><col><col></colgroup>
      <tr>
        <td class="s-label">기타<br>주의사항</td>
        <td class="s-note-col">${noteList(notes.slice(0, half))}</td>
        <td class="s-note-col">${noteList(notes.slice(half))}</td>
      </tr>
    </table>`;
}

function totalFeedRows() {
  return ROOMS.reduce((sum, r) => sum + doc.feeding[r.key].rows.length, 0);
}

function noteList(items) {
  if (!items.length) return '&nbsp;';
  return `<ul>${items.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`;
}

/* ---------------- 사진 & 인식 ---------------- */

const drop = $('#drop');
const fileInput = $('#file');

drop.addEventListener('click', () => fileInput.click());
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  if (e.dataTransfer.files[0]) useFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) useFile(fileInput.files[0]);
});

function useFile(file) {
  if (!file.type.startsWith('image/')) {
    alert('이미지 파일만 올릴 수 있습니다.');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => setImage(reader.result);
  reader.readAsDataURL(file);
}

function setImage(dataUrl) {
  imageDataUrl = dataUrl;
  $('#thumb').src = dataUrl;
  $('#thumbWrap').hidden = false;
  $('#runOcr').disabled = typeof Tesseract === 'undefined';
}

$('#clearImg').addEventListener('click', () => {
  imageDataUrl = null;
  fileInput.value = '';
  $('#thumbWrap').hidden = true;
  $('#runOcr').disabled = true;
});

$('#loadSample').addEventListener('click', async () => {
  try {
    const res = await fetch('sample/sample-worksheet.jpg');
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result);
    reader.readAsDataURL(blob);
  } catch {
    alert('예시 사진을 불러오지 못했습니다. sample/sample-worksheet.jpg 파일을 확인해 주세요.');
  }
});

$('#runOcr').addEventListener('click', async () => {
  if (!imageDataUrl) return;
  const btn = $('#runOcr');
  btn.disabled = true;
  $('#ocrStatus').hidden = false;
  setProgress(0, '시작하는 중…');

  try {
    const text = await recognize(imageDataUrl, ({ percent, message }) => setProgress(percent, message));
    $('#ocrRaw').value = text;
    $('#ocrRawWrap').hidden = false;
    applyText(text);
  } catch (err) {
    setProgress(0, `인식 실패: ${err.message} 아래 칸에 직접 입력해 주세요.`);
  } finally {
    btn.disabled = false;
  }
});

$('#reparse').addEventListener('click', () => applyText($('#ocrRaw').value));

function applyText(text) {
  const { doc: next, filled } = parseText(text, doc);
  doc = next;
  save();
  rebuildForm();
  setProgress(100, filled.length
    ? `채운 항목: ${filled.join(', ')} — 내용을 확인하고 고쳐 주세요.`
    : '알아볼 수 있는 항목이 없었습니다. 아래 칸에 직접 입력해 주세요.');
}

function setProgress(percent, message) {
  $('#ocrBar').style.width = `${percent}%`;
  $('#ocrMsg').textContent = message;
}

/* ---------------- 저장 ---------------- */

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(doc)); } catch { /* 저장 불가여도 사용은 가능 */ }
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? normalize(JSON.parse(raw)) : null;
  } catch { return null; }
}

function fileStamp() {
  const { y, m, d } = doc.date;
  if (!y || !m || !d) return '작업일지';
  return `작업일지_${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

$('#makePdf').addEventListener('click', async () => {
  const btn = $('#makePdf');
  const sheet = $('#sheet');
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'PDF 만드는 중…';

  // 화면에서는 축소해 보여주므로, 캡처할 때만 원래 크기로 되돌립니다.
  const zoom = sheet.style.transform;
  sheet.style.transform = 'none';

  try {
    const canvas = await html2canvas(sheet, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    const pageW = 210;
    const pageH = 297;
    let w = pageW;
    let h = (canvas.height / canvas.width) * pageW;
    if (h > pageH) { h = pageH; w = (canvas.width / canvas.height) * pageH; }

    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', (pageW - w) / 2, (pageH - h) / 2, w, h);
    pdf.save(`${fileStamp()}.pdf`);
  } catch (err) {
    alert(`PDF를 만들지 못했습니다: ${err.message}`);
  } finally {
    sheet.style.transform = zoom;
    btn.disabled = false;
    btn.textContent = label;
  }
});

$('#printBtn').addEventListener('click', () => window.print());

$('#exportJson').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${fileStamp()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$('#importJson').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      doc = normalize(JSON.parse(reader.result));
      save(); rebuildForm();
    } catch {
      alert('불러올 수 없는 파일입니다.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

$('#resetAll').addEventListener('click', () => {
  if (!confirm('입력한 내용을 모두 지울까요?')) return;
  doc = emptyDoc();
  save(); rebuildForm();
});

/* 좁은 화면에서 A4 미리보기를 줄여서 보여줍니다. */
function fitPreview() {
  const sheet = $('#sheet');
  const box = sheet.parentElement;
  const scale = Math.min(1, (box.clientWidth - 24) / sheet.offsetWidth);
  sheet.style.transform = `scale(${scale})`;
  box.style.height = `${sheet.offsetHeight * scale + 24}px`;
}

window.addEventListener('resize', fitPreview);
new MutationObserver(fitPreview).observe($('#sheet'), { childList: true, subtree: true });

/* 인식 모듈을 못 받아왔으면 직접 입력만 가능하다고 알려 줍니다. */
window.addEventListener('load', () => {
  if (typeof Tesseract !== 'undefined') return;
  const btn = $('#runOcr');
  btn.disabled = true;
  btn.title = '문자 인식 모듈을 불러오지 못했습니다.';
  $('#ocrStatus').hidden = false;
  setProgress(0, '인터넷에 연결되지 않아 글자 인식은 쓸 수 없습니다. 아래 칸에 직접 입력하면 PDF는 그대로 만들 수 있습니다.');
});

/* 저장된 내용이 없으면 예시로 시작해 사용법을 바로 보여줍니다. */
if (!loadSaved()) doc = sampleDoc();
rebuildForm();
fitPreview();
