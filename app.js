// The whole calculator lives in this file. It runs in a browser and under
// node, so the tests can import the maths without opening a page.

const STORAGE_KEY = 'cod-leak-scenarios-v1';

// The seven demo scenarios, exactly as the old seed had them. Names, stores
// and numbers are invented on purpose, and the three headline figures are
// the ones the old suite pinned down.
function seedScenarios() {
  const now = new Date().toISOString();
  const rows = [
    ['Nile Linen Co.', 'October as it happened', 1000, 25, 65, 15],
    ['Nile Linen Co.', 'If confirmation calls land', 1000, 18, 65, 15],
    ['Nile Linen Co.', 'Black Friday volume, same rate', 2600, 25, 65, 15],
    ['Desert Rose Beauty', 'Launch month', 420, 31, 55, 12],
    ['Desert Rose Beauty', 'After address checks', 420, 22, 55, 12],
    ['Sahara Home Goods', 'Steady month', 1500, 19, 70, 18],
    ['Sahara Home Goods', 'New courier trial', 1500, 27, 60, 18],
  ];
  return rows.map((r, i) => ({
    id: i + 1,
    store: r[0], name: r[1],
    orders_per_month: r[2], failure_rate_pct: r[3],
    shipping_one_way: r[4], packaging_cost: r[5],
    createdAt: now, updatedAt: now,
  }));
}

function roundTo(value, places) {
  const f = Math.pow(10, places);
  return Math.round(value * f) / f;
}

// A failed parcel costs shipping twice, once out and once back, plus the
// packaging. The five point saving is capped at the rate that exists, so a
// store at 3 percent cannot save five points it never had.
function compute(s) {
  const orders = Number(s.orders_per_month);
  const rate = Number(s.failure_rate_pct);
  const perFailed = 2 * Number(s.shipping_one_way) + Number(s.packaging_cost);
  const failed = orders * rate / 100;
  const monthly = failed * perFailed;
  const saving = orders * Math.min(5, rate) / 100 * perFailed;
  return {
    failed_orders: roundTo(failed, 1),
    cost_per_failed: roundTo(perFailed, 2),
    monthly_loss: roundTo(monthly, 2),
    yearly_loss: roundTo(monthly * 12, 2),
    saving_if_rate_drops_5pts: roundTo(saving, 2),
  };
}

function withComputed(s) {
  return Object.assign({}, s, compute(s));
}

// Same checks the old API applied, minus the store lookup. Names are
// trimmed and capped, and a rate outside 0 to 100 is refused outright.
function validateScenario(data) {
  const name = String(data.name === undefined ? '' : data.name).trim().slice(0, 80);
  if (!name) return { value: null, error: 'scenario name is required' };
  const orders = Number(data.orders_per_month);
  const rate = Number(data.failure_rate_pct);
  const ship = Number(data.shipping_one_way);
  const pack = Number(data.packaging_cost);
  if ([orders, rate, ship, pack].some((n) => !Number.isFinite(n))) {
    return { value: null, error: 'orders, failure rate, shipping and packaging must be numbers' };
  }
  if (orders < 0 || ship < 0 || pack < 0) {
    return { value: null, error: 'orders and costs cannot be negative' };
  }
  if (rate < 0 || rate > 100) {
    return { value: null, error: 'failure rate must be between 0 and 100' };
  }
  const store = String(data.store === undefined ? '' : data.store).trim().slice(0, 80);
  return { value: { name, store, orders_per_month: orders, failure_rate_pct: rate,
    shipping_one_way: ship, packaging_cost: pack }, error: null };
}

// Names are unique across the whole list now that there are no separate
// stores. The check is case-insensitive, same as the old database behaved.
function nameTaken(scenarios, name, exceptId) {
  const key = name.toLowerCase();
  return scenarios.some((s) => s.name.toLowerCase() === key && s.id !== exceptId);
}

// A small CSV reader that copes with quoted fields, since a store name or
// scenario name might contain a comma one day.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

// Import mirrors the old endpoint: a bad header refuses the whole file, and
// each bad row is reported with its row number instead of being merged in
// quietly. Row numbers count the header as row 1, as a spreadsheet would.
function importScenarios(existing, csvText) {
  const rows = parseCsv(csvText);
  if (!rows.length) return { imported: [], rejected: [{ row: 1, name: '', reason: 'csv header must be: name,orders_per_month,failure_rate_pct,shipping_one_way,packaging_cost' }] };
  const needed = ['name', 'orders_per_month', 'failure_rate_pct', 'shipping_one_way', 'packaging_cost'];
  const header = rows[0].map((h) => h.trim());
  if (needed.some((c) => !header.includes(c))) {
    return { imported: [], rejected: [{ row: 1, name: '', reason: 'csv header must be: ' + needed.join(',') }] };
  }
  const imported = [], rejected = [], seen = new Set();
  for (let i = 1; i < rows.length; i++) {
    const lineno = i + 1;
    const raw = rows[i];
    if (raw.length !== header.length) {
      rejected.push({ row: lineno, name: '', reason: 'wrong number of fields' });
      continue;
    }
    const obj = {};
    header.forEach((h, j) => { obj[h] = raw[j]; });
    const { value, error } = validateScenario(obj);
    if (error) {
      rejected.push({ row: lineno, name: String(obj.name || '').slice(0, 80), reason: error });
      continue;
    }
    const key = value.name.toLowerCase();
    if (seen.has(key)) {
      rejected.push({ row: lineno, name: value.name, reason: 'duplicate name inside the file' });
      continue;
    }
    if (nameTaken(existing, value.name)) {
      rejected.push({ row: lineno, name: value.name, reason: 'a scenario with that name already exists' });
      continue;
    }
    seen.add(key);
    imported.push(value);
  }
  return { imported, rejected };
}

// Worst loss first, so the comparison reads like a league table.
function sortComparison(rows) {
  return rows.slice().sort((a, b) => withComputed(b).monthly_loss - withComputed(a).monthly_loss);
}

// Everything below this line only runs in a browser. Node imports the
// functions above and never touches the page.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { compute, withComputed, validateScenario, nameTaken,
    parseCsv, importScenarios, sortComparison, seedScenarios, STORAGE_KEY };
}

if (typeof document !== 'undefined') {
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Names come from the owner, so they are escaped before they reach the
  // page. A scenario name must never become markup.
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* a broken save falls back to the seed below */ }
    const seed = seedScenarios();
    save(seed);
    return seed;
  }
  function save(list) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (e) { /* private mode */ }
  }
  function touch(list) {
    list.forEach((s) => { if (!s.updatedAt) s.updatedAt = s.createdAt || new Date().toISOString(); });
  }

  let scenarios = load();
  let editingId = null;
  let lastComparison = [];

  function sliderValues() {
    return {
      orders_per_month: +$('orders').value || 0,
      failure_rate_pct: +$('rate').value || 0,
      shipping_one_way: +$('ship').value || 0,
      packaging_cost: +$('pack').value || 0,
    };
  }

  // The figure is typeset, not just printed: its digits tween and its
  // weight swells with the loss. Weight is a data channel, not decoration.
  let shownMonthly = 0, tweenId = null;
  function typesetMonthly(target) {
    const el = $('monthly');
    const paint = (v) => {
      el.innerHTML = fmt(v) + '<small> EGP</small>';
      const w = Math.round(300 + Math.min(1, v / 60000) * 600);
      el.style.fontVariationSettings = '"wght" ' + w;
      el.classList.toggle('over', v > (+$('thresh').value || 0));
    };
    if (reduced) { shownMonthly = target; paint(target); return; }
    cancelAnimationFrame(tweenId);
    const from = shownMonthly, t0 = performance.now(), dur = 260;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      shownMonthly = from + (target - from) * eased;
      paint(shownMonthly);
      if (t < 1) tweenId = requestAnimationFrame(step);
    };
    tweenId = requestAnimationFrame(step);
  }

  function calc() {
    const v = compute(sliderValues());
    const s = sliderValues();
    $('ordersOut').textContent = fmt(s.orders_per_month);
    $('rateOut').textContent = (Math.round(s.failure_rate_pct * 10) / 10) + '%';
    $('shipOut').textContent = fmt(s.shipping_one_way);
    $('packOut').textContent = fmt(s.packaging_cost);
    $('threshOut').textContent = fmt(+$('thresh').value || 0);
    typesetMonthly(v.monthly_loss);
    $('failedCount').textContent = fmt(v.failed_orders);
    $('perFail').textContent = fmt(v.cost_per_failed) + ' EGP';
    $('yearly').textContent = fmt(v.yearly_loss) + ' EGP';
    $('saving').textContent = fmt(v.saving_if_rate_drops_5pts) + ' EGP / month';
  }
  ['orders', 'rate', 'ship', 'pack', 'thresh'].forEach((id) => $(id).addEventListener('input', calc));

  function renderScenarios() {
    const needle = ($('search').value || '').trim().toLowerCase();
    const list = scenarios.filter((s) => !needle || s.name.toLowerCase().includes(needle));
    $('scenarioList').innerHTML = list.length ? list.map((s) => {
      const c = withComputed(s);
      return '<div class="spec"><input type="checkbox" class="cmp" value="' + s.id + '" aria-label="Compare ' + esc(s.name) + '">' +
        '<div><span class="name">' + esc(s.name) + '</span><div class="meta">' +
        (s.store ? esc(s.store) + ' · ' : '') + fmt(s.orders_per_month) + ' orders · ' +
        s.failure_rate_pct + '% fail · ship ' + fmt(s.shipping_one_way) + ' · pack ' + fmt(s.packaging_cost) + '</div></div>' +
        '<div class="loss">' + fmt(c.monthly_loss) + '<small>EGP lost / month</small></div>' +
        '<div><button class="btn small plain" data-edit="' + s.id + '">Edit</button>' +
        '<button class="btn small plain" data-del="' + s.id + '">Delete</button></div></div>';
    }).join('') : '<p class="muted">No scenarios saved yet.</p>';
    $('scenarioList').querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => editScenario(+b.dataset.edit)));
    $('scenarioList').querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', () => deleteScenario(+b.dataset.del)));
  }

  function renderHistory() {
    touch(scenarios);
    const rows = scenarios.slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 20);
    $('historyList').innerHTML = rows.map((s) =>
      '<div class="rowline"><span>' + (s.store ? esc(s.store) + ': ' : '') + esc(s.name) +
      '</span><b>' + fmt(withComputed(s).monthly_loss) + ' EGP / month</b></div>').join('') || '<p class="muted">Nothing yet.</p>';
  }

  function renderAll() { renderScenarios(); renderHistory(); }

  function resetForm() {
    editingId = null;
    $('scenarioName').value = '';
    $('cancelEdit').style.display = 'none';
  }

  function saveScenario() {
    const { value, error } = validateScenario(Object.assign(sliderValues(), {
      name: $('scenarioName').value, store: $('storeLabel').value,
    }));
    if (error) { $('saveErr').textContent = error; return; }
    if (nameTaken(scenarios, value.name, editingId)) {
      $('saveErr').textContent = 'a scenario with that name already exists';
      return;
    }
    const now = new Date().toISOString();
    if (editingId) {
      const s = scenarios.find((x) => x.id === editingId);
      Object.assign(s, value, { updatedAt: now });
    } else {
      const nextId = scenarios.reduce((m, s) => Math.max(m, s.id), 0) + 1;
      scenarios.push(Object.assign({ id: nextId, createdAt: now, updatedAt: now }, value));
    }
    save(scenarios);
    $('saveErr').textContent = '';
    resetForm();
    renderAll();
  }

  function editScenario(id) {
    const s = scenarios.find((x) => x.id === id);
    if (!s) return;
    editingId = id;
    $('orders').value = s.orders_per_month; $('rate').value = s.failure_rate_pct;
    $('ship').value = s.shipping_one_way; $('pack').value = s.packaging_cost;
    $('scenarioName').value = s.name; $('storeLabel').value = s.store || '';
    $('cancelEdit').style.display = 'inline-block';
    calc();
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }

  function deleteScenario(id) {
    if (!window.confirm('Delete this scenario?')) return;
    scenarios = scenarios.filter((s) => s.id !== id);
    save(scenarios);
    renderAll();
  }

  function svgCompare(rows) {
    const top = Math.max.apply(null, rows.map((r) => withComputed(r).monthly_loss).concat([1]));
    const rowH = 38, width = 680, height = 24 + rowH * rows.length;
    const parts = ['<svg width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" xmlns="http://www.w3.org/2000/svg" role="img" style="max-width:100%">'];
    rows.forEach((r, i) => {
      const c = withComputed(r);
      const y = 8 + i * rowH, w = Math.round(330 * c.monthly_loss / top);
      parts.push('<text x="0" y="' + (y + 17) + '" font-size="14" font-weight="700" fill="#101010">' + esc(r.name) + '</text>');
      parts.push('<rect x="210" y="' + y + '" width="' + w + '" height="20" fill="#101010"></rect>');
      parts.push('<text x="' + (218 + w) + '" y="' + (y + 16) + '" font-size="13" fill="#101010">' + fmt(c.monthly_loss) + ' / month</text>');
    });
    parts.push('</svg>');
    return parts.join('');
  }

  function compareSelected() {
    const ids = Array.prototype.slice.call(document.querySelectorAll('.cmp:checked')).map((x) => +x.value);
    if (!ids.length) { $('compareOut').innerHTML = '<p class="err">Tick at least one scenario first.</p>'; return; }
    lastComparison = sortComparison(scenarios.filter((s) => ids.indexOf(s.id) !== -1));
    const rows = lastComparison.map(withComputed);
    $('compareOut').innerHTML = '<h3 style="font-family:var(--disp)">Comparison</h3>' + svgCompare(lastComparison) +
      '<table><tr><th>Scenario</th><th>Failed orders</th><th>Cost per failed</th><th>Monthly loss</th><th>Yearly loss</th><th>Saving if rate drops 5 pts</th></tr>' +
      rows.map((s) => '<tr><td>' + esc(s.name) + '</td><td>' + fmt(s.failed_orders) + '</td><td>' +
        fmt(s.cost_per_failed) + '</td><td>' + fmt(s.monthly_loss) + '</td><td>' +
        fmt(s.yearly_loss) + '</td><td>' + fmt(s.saving_if_rate_drops_5pts) + '</td></tr>').join('') + '</table>';
  }

  function importCsv() {
    const file = $('csvFile').files[0];
    if (!file) { $('importOut').innerHTML = '<p class="err">Pick a CSV file first.</p>'; return; }
    file.text().then((text) => {
      const { imported, rejected } = importScenarios(scenarios, text);
      const now = new Date().toISOString();
      imported.forEach((v) => {
        const nextId = scenarios.reduce((m, s) => Math.max(m, s.id), 0) + 1;
        scenarios.push(Object.assign({ id: nextId, createdAt: now, updatedAt: now }, v));
      });
      save(scenarios);
      $('importOut').innerHTML = '<p>Imported ' + imported.length + '. Rejected ' + rejected.length + '.</p>' +
        (rejected.length ? '<ul>' + rejected.map((x) => '<li>Row ' + x.row + ': ' + esc(x.name || '(no name)') + ': ' + esc(x.reason) + '</li>').join('') + '</ul>' : '');
      renderAll();
    });
  }

  function downloadBackup() {
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), scenarios }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cod-leak-backup.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function printReport() {
    const rows = lastComparison.length ? lastComparison : scenarios;
    const computed = rows.map(withComputed);
    $('printView').innerHTML = '<h1>COD leak report</h1><p>Scenarios and what failed delivery costs each month.</p>' +
      (rows.length ? svgCompare(rows) : '<p>No scenarios.</p>') +
      '<table><tr><th>Scenario</th><th>Monthly loss</th><th>Yearly loss</th></tr>' +
      computed.map((s) => '<tr><td>' + esc(s.name) + '</td><td>' + fmt(s.monthly_loss) + '</td><td>' + fmt(s.yearly_loss) + '</td></tr>').join('') + '</table>';
    window.print();
  }

  $('saveBtn').addEventListener('click', saveScenario);
  $('cancelEdit').addEventListener('click', resetForm);
  $('search').addEventListener('input', renderScenarios);
  $('compareBtn').addEventListener('click', compareSelected);
  $('backupBtn').addEventListener('click', downloadBackup);
  $('printBtn').addEventListener('click', printReport);
  $('importBtn').addEventListener('click', importCsv);
  $('csvFile').addEventListener('change', (e) => {
    $('csvName').textContent = e.target.files[0] ? e.target.files[0].name : 'No file chosen';
  });

  calc();
  renderAll();
}
