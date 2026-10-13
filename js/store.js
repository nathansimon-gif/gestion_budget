/* Pécule — persistance (localStorage), catégories par défaut, données de démonstration. */
(function (root) {
  'use strict';
  const Core = root.Core || (typeof require !== 'undefined' ? require('./core.js') : null);
  const KEY = 'pecule.v1';

  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  // group : besoin (essentiel) | envie (plaisir) | epargne
  const DEFAULT_CATEGORIES = [
    { id: 'salaire', name: 'Salaire', type: 'income', icon: '💼', color: '#10b981' },
    { id: 'primes', name: 'Primes & bonus', type: 'income', icon: '🎁', color: '#34d399' },
    { id: 'extra', name: 'Revenus annexes', type: 'income', icon: '💻', color: '#06b6d4' },
    { id: 'aides', name: 'Aides & allocations', type: 'income', icon: '🏛️', color: '#22d3ee' },
    { id: 'autres-revenus', name: 'Autres revenus', type: 'income', icon: '➕', color: '#a3e635' },

    { id: 'logement', name: 'Logement', type: 'expense', group: 'besoin', icon: '🏠', color: '#6366f1' },
    { id: 'courses', name: 'Courses', type: 'expense', group: 'besoin', icon: '🛒', color: '#f59e0b' },
    { id: 'transport', name: 'Transport', type: 'expense', group: 'besoin', icon: '🚗', color: '#0ea5e9' },
    { id: 'factures', name: 'Factures & énergie', type: 'expense', group: 'besoin', icon: '⚡', color: '#eab308' },
    { id: 'sante', name: 'Santé', type: 'expense', group: 'besoin', icon: '💊', color: '#14b8a6' },
    { id: 'assurances', name: 'Assurances', type: 'expense', group: 'besoin', icon: '🛡️', color: '#64748b' },
    { id: 'restaurants', name: 'Restaurants', type: 'expense', group: 'envie', icon: '🍽️', color: '#ef4444' },
    { id: 'sorties', name: 'Sorties & loisirs', type: 'expense', group: 'envie', icon: '🎉', color: '#ec4899' },
    { id: 'shopping', name: 'Shopping', type: 'expense', group: 'envie', icon: '🛍️', color: '#a855f7' },
    { id: 'abonnements', name: 'Abonnements', type: 'expense', group: 'envie', icon: '📺', color: '#f97316' },
    { id: 'voyages', name: 'Voyages', type: 'expense', group: 'envie', icon: '✈️', color: '#3b82f6' },
    { id: 'cadeaux', name: 'Cadeaux', type: 'expense', group: 'envie', icon: '🎀', color: '#f472b6' },
    { id: 'divers', name: 'Divers', type: 'expense', group: 'envie', icon: '📦', color: '#94a3b8' },
    { id: 'epargne', name: 'Épargne', type: 'expense', group: 'epargne', icon: '🐷', color: '#22c55e' },
  ];

  function emptyState() {
    return {
      version: 1,
      settings: {
        name: '',
        theme: 'auto',
        alertThreshold: 80,
        monthlyLimit: 0,
        currentSavings: 0,
        rates: null, // taux personnalisés des placements
      },
      categories: DEFAULT_CATEGORIES.map((c) => ({ ...c, budget: 0 })),
      transactions: [],
      recurring: [],
      goals: [],
      planned: [],
      dismissedAlerts: [],
    };
  }

  function migrate(s) {
    const base = emptyState();
    const out = { ...base, ...s, settings: { ...base.settings, ...(s.settings || {}) } };
    for (const k of ['categories', 'transactions', 'recurring', 'goals', 'planned', 'dismissedAlerts']) {
      if (!Array.isArray(out[k])) out[k] = base[k];
    }
    return out;
  }

  function load() {
    try {
      const raw = root.localStorage && root.localStorage.getItem(KEY);
      if (raw) return migrate(JSON.parse(raw));
    } catch (e) {
      console.warn('Lecture des données impossible', e);
    }
    return null;
  }

  function save(state) {
    try {
      root.localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.warn('Sauvegarde impossible', e);
      return false;
    }
  }

  function clear() {
    try { root.localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  }

  // ---------- Données de démonstration ----------

  function seededRandom(seed) {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
  }

  function demoState(today) {
    const rnd = seededRandom(42);
    const between = (a, b) => Math.round((a + rnd() * (b - a)) * 100) / 100;
    const s = emptyState();
    s.settings.name = 'Alex';
    s.settings.currentSavings = 3200;
    s.settings.monthlyLimit = 1900;

    const budgets = { courses: 350, restaurants: 120, sorties: 100, shopping: 150, transport: 100, divers: 60 };
    for (const c of s.categories) if (budgets[c.id]) c.budget = budgets[c.id];

    const start = Core.startOfMonth(Core.addMonths(today, -4));
    const rec = (type, label, amount, categoryId, day, frequency) => ({
      id: uid(), type, label, amount, categoryId, dayOfMonth: day, frequency: frequency || 'monthly',
      startDate: Core.addDays(start, day - 1), active: true,
    });
    s.recurring = [
      rec('income', 'Salaire', 2450, 'salaire', 1),
      rec('expense', 'Loyer', 780, 'logement', 5),
      rec('expense', 'Électricité', 62, 'factures', 10),
      rec('expense', 'Box internet', 29.99, 'factures', 12),
      rec('expense', 'Forfait mobile', 14.99, 'factures', 14),
      rec('expense', 'Assurance habitation', 18.5, 'assurances', 8),
      rec('expense', 'Mutuelle', 42, 'sante', 3),
      rec('expense', 'Pass transport', 86.4, 'transport', 2),
      rec('expense', 'Netflix', 13.49, 'abonnements', 15),
      rec('expense', 'Spotify', 11.12, 'abonnements', 20),
      rec('expense', 'Salle de sport', 34.99, 'abonnements', 6),
      rec('expense', 'Virement épargne', 150, 'epargne', 2),
    ];
    Core.materializeRecurring(s, today, uid);

    const add = (date, type, categoryId, label, amount) => s.transactions.push({ id: uid(), type, categoryId, label, amount, date });
    for (let d = start; d <= today; d = Core.addDays(d, 1)) {
      const dow = Core.parseISO(d).getDay();
      if (dow === 6) add(d, 'expense', 'courses', 'Supermarché', between(55, 95));
      if (dow === 3 && rnd() < 0.6) add(d, 'expense', 'courses', 'Boulangerie / primeur', between(8, 22));
      if ((dow === 5 || dow === 6) && rnd() < 0.55) add(d, 'expense', 'restaurants', rnd() < 0.5 ? 'Restaurant' : 'Pizzeria', between(18, 48));
      if (dow >= 1 && dow <= 5 && rnd() < 0.25) add(d, 'expense', 'restaurants', 'Déjeuner', between(9, 14));
      if (rnd() < 0.18) add(d, 'expense', 'divers', 'Café', between(2.5, 5));
      if (dow === 6 && rnd() < 0.4) add(d, 'expense', 'sorties', rnd() < 0.5 ? 'Cinéma' : 'Concert / bar', between(12, 45));
      if (rnd() < 0.06) add(d, 'expense', 'shopping', rnd() < 0.5 ? 'Vêtements' : 'Achat en ligne', between(20, 90));
      if (rnd() < 0.03) add(d, 'expense', 'sante', 'Pharmacie', between(6, 25));
      if (rnd() < 0.04) add(d, 'expense', 'transport', 'Carburant / VTC', between(15, 45));
    }
    add(Core.addDays(start, 40), 'income', 'extra', 'Vente Leboncoin', 120);
    add(Core.addDays(start, 70), 'expense', 'cadeaux', 'Anniversaire Sam', 45);
    add(Core.addDays(start, 85), 'income', 'primes', 'Prime trimestrielle', 300);

    s.goals = [
      { id: uid(), name: 'Voyage au Japon', icon: '🗾', color: '#ef4444', target: 3500, saved: 900, deadline: Core.addMonths(today, 10), createdAt: Core.addMonths(today, -3) },
      { id: uid(), name: 'Fonds d\'urgence', icon: '🛟', color: '#10b981', target: 6000, saved: 3200, deadline: Core.addMonths(today, 14), createdAt: Core.addMonths(today, -8) },
      { id: uid(), name: 'Nouveau vélo', icon: '🚲', color: '#0ea5e9', target: 800, saved: 150, deadline: Core.addMonths(today, 4), createdAt: Core.addMonths(today, -1) },
    ];
    s.planned = [
      { id: uid(), type: 'expense', label: 'Vacances', amount: 1200, date: Core.addMonths(today, 3), categoryId: 'voyages' },
      { id: uid(), type: 'income', label: 'Prime annuelle', amount: 1500, date: Core.addMonths(today, 2), categoryId: 'primes' },
      { id: uid(), type: 'expense', label: 'Révision voiture', amount: 350, date: Core.addMonths(today, 5), categoryId: 'transport' },
    ];
    return s;
  }

  const Store = { KEY, uid, load, save, clear, emptyState, demoState, migrate, DEFAULT_CATEGORIES };
  if (typeof module !== 'undefined' && module.exports) module.exports = Store;
  else root.Store = Store;
})(typeof window !== 'undefined' ? window : globalThis);
