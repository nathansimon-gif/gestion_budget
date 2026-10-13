'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/core.js');
globalThis.Core = Core;
const Store = require('../js/store.js');

const state = (over) => ({ ...Store.emptyState(), ...over });
let n = 0;
const id = () => `id${++n}`;

test('occurrences mensuelles : jour 31 ramené à la fin du mois', () => {
  const rec = { frequency: 'monthly', startDate: '2026-01-31', dayOfMonth: 31, active: true };
  assert.deepEqual(Core.occurrencesBetween(rec, '2026-01-01', '2026-04-30'), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
});

test('occurrences hebdomadaires et annuelles', () => {
  const w = { frequency: 'weekly', startDate: '2026-03-02', active: true };
  assert.deepEqual(Core.occurrencesBetween(w, '2026-03-10', '2026-03-31'), ['2026-03-16', '2026-03-23', '2026-03-30']);
  const y = { frequency: 'yearly', startDate: '2024-02-29', active: true };
  assert.deepEqual(Core.occurrencesBetween(y, '2025-01-01', '2028-12-31'), ['2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
});

test('occurrences respectent la date de fin et l\'état inactif', () => {
  const rec = { frequency: 'monthly', startDate: '2026-01-05', endDate: '2026-02-10', active: true };
  assert.deepEqual(Core.occurrencesBetween(rec, '2026-01-01', '2026-12-31'), ['2026-01-05', '2026-02-05']);
  assert.deepEqual(Core.occurrencesBetween({ ...rec, active: false }, '2026-01-01', '2026-12-31'), []);
});

test('materializeRecurring ne crée pas de doublons et ne recrée pas les suppressions', () => {
  const s = state({ recurring: [{ id: 'r', type: 'expense', amount: 700, categoryId: 'logement', label: 'Loyer', frequency: 'monthly', startDate: '2026-01-05', dayOfMonth: 5, active: true }], transactions: [] });
  assert.equal(Core.materializeRecurring(s, '2026-03-10', id), 3);
  assert.equal(Core.materializeRecurring(s, '2026-03-10', id), 0);
  s.transactions = s.transactions.filter((t) => t.date !== '2026-02-05');
  assert.equal(Core.materializeRecurring(s, '2026-03-20', id), 0);
  assert.equal(s.transactions.length, 2);
  assert.equal(Core.materializeRecurring(s, '2026-04-05', id), 1);
});

test('summarize distingue dépenses, épargne et reste', () => {
  const s = state();
  const cats = Core.categoryMap(s);
  const txs = [
    { type: 'income', amount: 2000, categoryId: 'salaire' },
    { type: 'expense', amount: 800, categoryId: 'logement' },
    { type: 'expense', amount: 200, categoryId: 'epargne' },
  ];
  const r = Core.summarize(txs, cats);
  assert.equal(r.income, 2000);
  assert.equal(r.expense, 800);
  assert.equal(r.saving, 200);
  assert.equal(r.remaining, 1000);
  assert.equal(r.savingsRate, 0.6);
});

test('budgetStatus et alertes selon le seuil', () => {
  const s = state();
  s.categories.find((c) => c.id === 'restaurants').budget = 100;
  s.categories.find((c) => c.id === 'courses').budget = 200;
  s.categories.find((c) => c.id === 'courses').alertAt = 50;
  s.transactions = [
    { id: 'a', type: 'expense', amount: 85, categoryId: 'restaurants', date: '2026-05-03', label: '' },
    { id: 'b', type: 'expense', amount: 90, categoryId: 'courses', date: '2026-05-04', label: '' },
    { id: 'c', type: 'income', amount: 3000, categoryId: 'salaire', date: '2026-05-01', label: '' },
  ];
  const st = Core.budgetStatus(s, '2026-05-10');
  assert.equal(st.find((b) => b.category.id === 'restaurants').level, 'warn');
  assert.equal(st.find((b) => b.category.id === 'courses').level, 'ok');
  s.transactions.push({ id: 'd', type: 'expense', amount: 20, categoryId: 'restaurants', date: '2026-05-06', label: '' });
  s.transactions.push({ id: 'e', type: 'expense', amount: 15, categoryId: 'courses', date: '2026-05-06', label: '' });
  const alerts = Core.computeAlerts(s, '2026-05-10');
  assert.ok(alerts.some((a) => a.level === 'over' && a.title.includes('Restaurants')));
  assert.ok(alerts.some((a) => a.level === 'warn' && a.title.includes('Courses')));
});

test('forecastMonth intègre les récurrents à venir', () => {
  const s = state({
    recurring: [
      { id: 'sal', type: 'income', amount: 2000, categoryId: 'salaire', label: 'Salaire', frequency: 'monthly', startDate: '2026-06-01', dayOfMonth: 1, active: true },
      { id: 'loy', type: 'expense', amount: 700, categoryId: 'logement', label: 'Loyer', frequency: 'monthly', startDate: '2026-06-20', dayOfMonth: 20, active: true },
    ],
  });
  Core.materializeRecurring(s, '2026-06-10', id);
  s.transactions.push({ id: 'x', type: 'expense', amount: 100, categoryId: 'courses', date: '2026-06-05', label: '' });
  const fc = Core.forecastMonth(s, '2026-06-10');
  assert.equal(fc.soFar.income, 2000);
  assert.equal(fc.upcomingRecurring.expense, 700);
  // 100 € en 10 jours => 10 €/jour sur 20 jours restants
  assert.equal(Math.round(fc.variableRemaining), 200);
  assert.equal(Math.round(fc.projectedRemaining), 2000 - 100 - 700 - 200);
});

test('forecastMonths : scénario et prévisions ponctuelles', () => {
  const s = state({
    recurring: [{ id: 'sal', type: 'income', amount: 2000, categoryId: 'salaire', label: 'Salaire', frequency: 'monthly', startDate: '2026-01-01', dayOfMonth: 1, active: true }],
    planned: [{ id: 'p', type: 'expense', amount: 500, label: 'Vacances', date: '2026-08-15', categoryId: 'voyages' }],
  });
  s.settings.currentSavings = 1000;
  for (const m of ['2026-03', '2026-04', '2026-05']) s.transactions.push({ id: id(), type: 'expense', amount: 600, categoryId: 'courses', date: `${m}-10`, label: '' });
  const f = Core.forecastMonths(s, '2026-06-15', 3, {});
  assert.equal(f.baseline.varExpense, 600);
  assert.deepEqual(f.months.map((m) => Math.round(m.net)), [1400, 900, 1400]);
  assert.equal(Math.round(f.months[2].cumulative), 1000 + 3700);
  const cut = Core.forecastMonths(s, '2026-06-15', 3, { cutVariablePct: 50 });
  assert.equal(Math.round(cut.months[0].net), 1700);
});

test('goalInfo calcule l\'effort mensuel', () => {
  const g = { target: 1200, saved: 200, deadline: '2026-12-01', createdAt: '2026-01-01' };
  const info = Core.goalInfo(g, '2026-08-01');
  assert.equal(info.monthsLeft, 4);
  assert.equal(info.monthly, 250);
  assert.equal(info.onTrack, false);
  assert.equal(Core.goalInfo({ ...g, saved: 1300 }, '2026-08-01').done, true);
});

test('simulateInvestment : intérêts composés', () => {
  const zero = Core.simulateInvestment({ initial: 1000, monthly: 100, years: 2, rate: 0 });
  assert.equal(Math.round(zero.final), 3400);
  const r = Core.simulateInvestment({ initial: 10000, monthly: 0, years: 10, rate: 5 });
  assert.equal(Math.round(r.final), Math.round(10000 * Math.pow(1.05, 10)));
});

test('les données de démo sont cohérentes', () => {
  const s = Store.demoState('2026-10-13');
  assert.ok(s.transactions.length > 100);
  assert.ok(s.transactions.every((t) => t.date <= '2026-10-13' && t.amount > 0));
  const insights = Core.savingsInsights(s, '2026-10-13');
  assert.ok(insights.length > 0);
  assert.ok(insights.rule);
});
