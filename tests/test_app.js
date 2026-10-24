// Tests for the static calculator. Same calculation cases the old API suite
// pinned down, minus the server cases that no longer exist: there is no
// login, no token and no database to refuse anyone.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compute, validateScenario, nameTaken, importScenarios,
  sortComparison, seedScenarios, withComputed } = require('../app.js');

const ROOT = path.join(__dirname, '..');
const byName = (list, name) => list.find((s) => s.name === name);
const seeded = () => seedScenarios().map(withComputed);

test('the October scenario matches the original calculator', () => {
  const s = byName(seeded(), 'October as it happened');
  assert.equal(s.failed_orders, 250);
  assert.equal(s.cost_per_failed, 145);
  assert.equal(s.monthly_loss, 36250);
  assert.equal(s.yearly_loss, 435000);
  assert.equal(s.saving_if_rate_drops_5pts, 7250);
});

test('the two other headline figures are unchanged', () => {
  assert.equal(byName(seeded(), 'If confirmation calls land').monthly_loss, 26100);
  assert.equal(byName(seeded(), 'Black Friday volume, same rate').monthly_loss, 94250);
});

test('the remaining seeds compute from their own inputs', () => {
  assert.equal(byName(seeded(), 'Launch month').monthly_loss, 15884.4);
  assert.equal(byName(seeded(), 'After address checks').monthly_loss, 11272.8);
  assert.equal(byName(seeded(), 'Steady month').monthly_loss, 45030);
  assert.equal(byName(seeded(), 'New courier trial').monthly_loss, 55890);
});

test('the five point saving is capped at the rate that exists', () => {
  const c = compute({ orders_per_month: 1000, failure_rate_pct: 3, shipping_one_way: 65, packaging_cost: 15 });
  assert.equal(c.saving_if_rate_drops_5pts, 4350);
  assert.equal(c.monthly_loss, 4350);
});

test('a zero rate loses nothing and saves nothing', () => {
  const c = compute({ orders_per_month: 1000, failure_rate_pct: 0, shipping_one_way: 65, packaging_cost: 15 });
  assert.equal(c.monthly_loss, 0);
  assert.equal(c.saving_if_rate_drops_5pts, 0);
});

test('validation refuses what the old API refused', () => {
  assert.match(validateScenario({ name: 'x', orders_per_month: 1, failure_rate_pct: 140, shipping_one_way: 1, packaging_cost: 1 }).error, /between 0 and 100/);
  assert.match(validateScenario({ name: 'x', orders_per_month: -5, failure_rate_pct: 10, shipping_one_way: 1, packaging_cost: 1 }).error, /negative/);
  assert.match(validateScenario({ name: '   ', orders_per_month: 1, failure_rate_pct: 10, shipping_one_way: 1, packaging_cost: 1 }).error, /name is required/);
  assert.match(validateScenario({ name: 'x', orders_per_month: 'abc', failure_rate_pct: 10, shipping_one_way: 1, packaging_cost: 1 }).error, /must be numbers/);
  const ok = validateScenario({ name: '  Padded name  ', orders_per_month: 10, failure_rate_pct: 10, shipping_one_way: 1, packaging_cost: 1 });
  assert.equal(ok.error, null);
  assert.equal(ok.value.name, 'Padded name');
});

test('a duplicate name is caught regardless of case', () => {
  const list = seedScenarios();
  assert.equal(nameTaken(list, 'october as it happened'), true);
  assert.equal(nameTaken(list, 'Something new'), false);
  const self = list[0];
  assert.equal(nameTaken(list, self.name, self.id), false);
});

test('import accepts the one good row and reports the rest by row number', () => {
  const csv = 'name,orders_per_month,failure_rate_pct,shipping_one_way,packaging_cost\n' +
    'Imported one,300,20,50,10\n' +
    'Imported one,300,20,50,10\n' +
    'October as it happened,100,10,50,10\n' +
    'Broken row,abc,20,50,10\n';
  const { imported, rejected } = importScenarios(seedScenarios(), csv);
  assert.equal(imported.length, 1);
  assert.equal(imported[0].name, 'Imported one');
  const reasons = rejected.map((r) => r.reason).join(' ');
  assert.match(reasons, /duplicate name inside the file/);
  assert.match(reasons, /already exists/);
  assert.equal(rejected.find((r) => r.name === 'Broken row').row, 5);
});

test('import with a wrong header is refused whole', () => {
  const { imported, rejected } = importScenarios(seedScenarios(), 'wrong,header\n1,2\n');
  assert.equal(imported.length, 0);
  assert.match(rejected[0].reason, /csv header must be/);
});

test('comparison sorts worst loss first', () => {
  const rows = sortComparison(seedScenarios());
  const losses = rows.map((s) => withComputed(s).monthly_loss);
  assert.deepEqual(losses, losses.slice().sort((a, b) => b - a));
  assert.equal(rows[0].name, 'Black Friday volume, same rate');
});

test('the static page still carries the money lab', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  assert.match(html, /id="monthly"/);
  assert.match(html, /style\.css/);
  assert.match(html, /app\.js/);
  assert.match(js, /localStorage/);
  assert.match(js, /svgCompare/);
  assert.match(js, /fontVariationSettings/);
});

test('no Python is left in the repo', () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
  const leftovers = walk(ROOT).filter((p) => p.endsWith('.py'));
  assert.deepEqual(leftovers, []);
  assert.equal(fs.existsSync(path.join(ROOT, 'backend')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'config.env.example')), false);
});
