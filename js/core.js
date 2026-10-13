/*
 * Pécule — logique métier pure (aucun accès au DOM).
 * Ce fichier est chargé par le navigateur (window.Core) et par Node pour les tests.
 */
(function (root) {
  'use strict';

  // ---------- Dates (toujours en chaînes locales 'YYYY-MM-DD') ----------

  const pad = (n) => String(n).padStart(2, '0');

  function toISO(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function parseISO(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function todayISO() {
    return toISO(new Date());
  }

  function addDays(iso, n) {
    const d = parseISO(iso);
    d.setDate(d.getDate() + n);
    return toISO(d);
  }

  function daysInMonth(y, m) {
    // m : 0-11
    return new Date(y, m + 1, 0).getDate();
  }

  function addMonths(iso, n) {
    const d = parseISO(iso);
    const day = d.getDate();
    const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
    target.setDate(Math.min(day, daysInMonth(target.getFullYear(), target.getMonth())));
    return toISO(target);
  }

  function monthKey(iso) {
    return iso.slice(0, 7);
  }

  function startOfMonth(iso) {
    return iso.slice(0, 8) + '01';
  }

  function endOfMonth(iso) {
    const d = parseISO(iso);
    return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  }

  function startOfWeek(iso) {
    // Semaine du lundi au dimanche
    const d = parseISO(iso);
    const dow = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dow);
    return toISO(d);
  }

  function diffDays(a, b) {
    // Nombre de jours de a à b (b - a)
    return Math.round((parseISO(b) - parseISO(a)) / 86400000);
  }

  function monthsBetween(a, b) {
    const da = parseISO(a);
    const db = parseISO(b);
    return (db.getFullYear() - da.getFullYear()) * 12 + (db.getMonth() - da.getMonth());
  }

  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

  function monthLabel(iso, short) {
    const d = parseISO(iso);
    return short ? MONTHS_SHORT[d.getMonth()] : `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }

  /**
   * Plage de dates pour une période donnée.
   * kind : 'week' | 'month' | 'year' ; offset : décalage (0 = période courante).
   */
  function periodRange(kind, refISO, offset) {
    offset = offset || 0;
    let start, end, label;
    if (kind === 'week') {
      start = addDays(startOfWeek(refISO), offset * 7);
      end = addDays(start, 6);
      const s = parseISO(start);
      const e = parseISO(end);
      label = `Semaine du ${s.getDate()} ${MONTHS_SHORT[s.getMonth()]} au ${e.getDate()} ${MONTHS_SHORT[e.getMonth()]}`;
    } else if (kind === 'year') {
      const y = parseISO(refISO).getFullYear() + offset;
      start = `${y}-01-01`;
      end = `${y}-12-31`;
      label = `Année ${y}`;
    } else {
      start = startOfMonth(addMonths(startOfMonth(refISO), offset));
      end = endOfMonth(start);
      label = monthLabel(start);
      label = label.charAt(0).toUpperCase() + label.slice(1);
    }
    return { start, end, label, days: diffDays(start, end) + 1 };
  }

  // ---------- Récurrences ----------

  /** Dates d'occurrence d'une opération récurrente entre start et end (inclus). */
  function occurrencesBetween(rec, start, end) {
    const out = [];
    if (!rec.active && rec.active !== undefined) return out;
    const from = rec.startDate > start ? rec.startDate : start;
    const to = rec.endDate && rec.endDate < end ? rec.endDate : end;
    if (from > to) return out;

    if (rec.frequency === 'weekly') {
      let d = rec.startDate;
      const skip = Math.max(0, Math.floor(diffDays(d, from) / 7));
      d = addDays(d, skip * 7);
      while (d <= to) {
        if (d >= from) out.push(d);
        d = addDays(d, 7);
      }
    } else if (rec.frequency === 'yearly') {
      const sd = parseISO(rec.startDate);
      for (let y = parseISO(from).getFullYear(); y <= parseISO(to).getFullYear(); y++) {
        const day = Math.min(sd.getDate(), daysInMonth(y, sd.getMonth()));
        const iso = toISO(new Date(y, sd.getMonth(), day));
        if (iso >= from && iso <= to) out.push(iso);
      }
    } else {
      // mensuel
      const dom = rec.dayOfMonth || parseISO(rec.startDate).getDate();
      let cursor = startOfMonth(from);
      while (cursor <= to) {
        const c = parseISO(cursor);
        const day = Math.min(dom, daysInMonth(c.getFullYear(), c.getMonth()));
        const iso = toISO(new Date(c.getFullYear(), c.getMonth(), day));
        if (iso >= from && iso <= to) out.push(iso);
        cursor = addMonths(cursor, 1);
      }
    }
    return out;
  }

  /**
   * Crée les transactions des opérations récurrentes échues jusqu'à aujourd'hui.
   * Retourne le nombre de transactions créées. Mute state.
   */
  function materializeRecurring(state, today, makeId) {
    let created = 0;
    for (const rec of state.recurring) {
      if (rec.active === false) continue;
      const from = rec.generatedUntil ? addDays(rec.generatedUntil, 1) : rec.startDate;
      if (from > today) continue;
      for (const date of occurrencesBetween(rec, from, today)) {
        const exists = state.transactions.some((t) => t.recurringId === rec.id && t.date === date);
        if (!exists) {
          state.transactions.push({
            id: makeId(),
            type: rec.type,
            amount: rec.amount,
            categoryId: rec.categoryId,
            label: rec.label,
            date,
            recurringId: rec.id,
          });
          created++;
        }
      }
      rec.generatedUntil = today;
    }
    return created;
  }

  // ---------- Agrégats ----------

  function inRange(txs, start, end) {
    return txs.filter((t) => t.date >= start && t.date <= end);
  }

  function categoryMap(state) {
    const m = {};
    for (const c of state.categories) m[c.id] = c;
    return m;
  }

  function isSavingTx(t, cats) {
    const c = cats[t.categoryId];
    return t.type === 'expense' && c && c.group === 'epargne';
  }

  /** Synthèse d'une liste de transactions. */
  function summarize(txs, cats) {
    let income = 0, expense = 0, saving = 0;
    for (const t of txs) {
      if (t.type === 'income') income += t.amount;
      else if (isSavingTx(t, cats)) saving += t.amount;
      else expense += t.amount;
    }
    const remaining = income - expense - saving;
    const savingsRate = income > 0 ? (income - expense) / income : 0;
    return { income, expense, saving, remaining, savingsRate };
  }

  /** Total par catégorie (dépenses ou revenus), trié décroissant. */
  function byCategory(txs, type, cats) {
    const totals = {};
    for (const t of txs) {
      if (t.type !== type) continue;
      totals[t.categoryId] = (totals[t.categoryId] || 0) + t.amount;
    }
    return Object.keys(totals)
      .map((id) => ({ category: cats[id] || { id, name: 'Sans catégorie', color: '#94a3b8', icon: '❔' }, total: totals[id] }))
      .sort((a, b) => b.total - a.total);
  }

  /** Série mensuelle des n derniers mois (mois de refISO inclus). */
  function monthlySeries(state, n, refISO) {
    const cats = categoryMap(state);
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const start = startOfMonth(addMonths(startOfMonth(refISO), -i));
      const end = endOfMonth(start);
      const s = summarize(inRange(state.transactions, start, end), cats);
      out.push({ key: monthKey(start), label: monthLabel(start, true), start, end, ...s });
    }
    return out;
  }

  /**
   * Moyenne mensuelle des dépenses / revenus "variables" (hors récurrents et hors épargne)
   * sur les n mois complets précédant refISO. Retourne aussi le détail par catégorie.
   */
  function variableAverages(state, refISO, n) {
    n = n || 3;
    const cats = categoryMap(state);
    const end = addDays(startOfMonth(refISO), -1);
    const start = startOfMonth(addMonths(startOfMonth(refISO), -n));
    const txs = inRange(state.transactions, start, end).filter((t) => !t.recurringId && !t.goalId);
    // On ne compte que les mois où il y a eu de l'activité pour ne pas diluer la moyenne
    const months = new Set(inRange(state.transactions, start, end).map((t) => monthKey(t.date)));
    const count = months.size;
    let expense = 0, income = 0;
    const perCat = {};
    for (const t of txs) {
      if (t.type === 'income') income += t.amount;
      else if (!isSavingTx(t, cats)) {
        expense += t.amount;
        perCat[t.categoryId] = (perCat[t.categoryId] || 0) + t.amount;
      }
    }
    if (count === 0) return { months: 0, expense: 0, income: 0, perCat: {} };
    for (const k in perCat) perCat[k] /= count;
    return { months: count, expense: expense / count, income: income / count, perCat };
  }

  // ---------- Budgets & alertes ----------

  /** État des budgets par catégorie pour le mois contenant refISO. */
  function budgetStatus(state, refISO) {
    const cats = categoryMap(state);
    const start = startOfMonth(refISO);
    const end = endOfMonth(refISO);
    const txs = inRange(state.transactions, start, end);
    const defaultThreshold = state.settings.alertThreshold || 80;
    const out = [];
    for (const c of state.categories) {
      if (c.type !== 'expense' || !c.budget) continue;
      const spent = txs.filter((t) => t.type === 'expense' && t.categoryId === c.id).reduce((a, t) => a + t.amount, 0);
      const threshold = c.alertAt || defaultThreshold;
      const pct = spent / c.budget * 100;
      const level = pct >= 100 ? 'over' : pct >= threshold ? 'warn' : 'ok';
      out.push({ category: c, spent, budget: c.budget, pct, threshold, level, left: c.budget - spent });
    }
    // Plafond global de dépenses (hors épargne)
    if (state.settings.monthlyLimit) {
      const s = summarize(txs, cats);
      const pct = s.expense / state.settings.monthlyLimit * 100;
      out.global = {
        spent: s.expense,
        budget: state.settings.monthlyLimit,
        pct,
        threshold: defaultThreshold,
        level: pct >= 100 ? 'over' : pct >= defaultThreshold ? 'warn' : 'ok',
        left: state.settings.monthlyLimit - s.expense,
      };
    }
    return out;
  }

  /** Liste des alertes actives (budgets dépassés / proches, objectifs en retard, solde prévu négatif). */
  function computeAlerts(state, today) {
    const alerts = [];
    const status = budgetStatus(state, today);
    if (status.global && status.global.level !== 'ok') {
      alerts.push({
        level: status.global.level,
        icon: '🧾',
        title: status.global.level === 'over' ? 'Plafond mensuel dépassé' : 'Plafond mensuel bientôt atteint',
        text: `${Math.round(status.global.pct)} % du plafond de dépenses du mois utilisé.`,
        key: `global-${monthKey(today)}-${status.global.level}`,
      });
    }
    for (const b of status) {
      if (b.level === 'ok') continue;
      alerts.push({
        level: b.level,
        icon: b.category.icon,
        title: b.level === 'over' ? `${b.category.name} : budget dépassé` : `${b.category.name} : seuil de ${b.threshold} % atteint`,
        text: `${Math.round(b.pct)} % du budget utilisé ce mois-ci.`,
        key: `${b.category.id}-${monthKey(today)}-${b.level}`,
      });
    }
    for (const g of state.goals) {
      const info = goalInfo(g, today);
      if (info.done || !g.deadline) continue;
      if (info.monthsLeft <= 0) {
        alerts.push({ level: 'over', icon: g.icon, title: `Objectif « ${g.name} » : échéance passée`, text: `Il manque encore ${info.missing.toFixed(0)} €.`, key: `goal-${g.id}-late` });
      } else if (!info.onTrack) {
        alerts.push({ level: 'warn', icon: g.icon, title: `Objectif « ${g.name} » en retard`, text: `Prévoyez ${info.monthly.toFixed(0)} € / mois pour tenir l'échéance.`, key: `goal-${g.id}-behind-${monthKey(today)}` });
      }
    }
    const fc = forecastMonth(state, today);
    if (fc.projectedRemaining < 0) {
      alerts.push({ level: 'over', icon: '📉', title: 'Fin de mois dans le rouge', text: `Au rythme actuel, il vous manquerait ${Math.abs(fc.projectedRemaining).toFixed(0)} € en fin de mois.`, key: `fc-${monthKey(today)}` });
    }
    return alerts;
  }

  // ---------- Objectifs d'épargne ----------

  function goalInfo(goal, today) {
    const missing = Math.max(0, goal.target - goal.saved);
    const progress = goal.target > 0 ? Math.min(1, goal.saved / goal.target) : 0;
    const done = missing <= 0;
    let monthsLeft = null, monthly = null, onTrack = true;
    if (goal.deadline) {
      monthsLeft = monthsBetween(today, goal.deadline) + (parseISO(goal.deadline).getDate() >= parseISO(today).getDate() ? 0 : -1);
      monthsLeft = Math.max(0, monthsLeft);
      monthly = monthsLeft > 0 ? missing / monthsLeft : missing;
      // En avance / en retard : comparaison à une progression linéaire depuis la création
      if (goal.createdAt && goal.createdAt < goal.deadline) {
        const total = diffDays(goal.createdAt, goal.deadline);
        const elapsed = Math.min(total, Math.max(0, diffDays(goal.createdAt, today)));
        const expected = goal.target * (elapsed / total);
        onTrack = goal.saved >= expected * 0.9;
      }
    }
    return { missing, progress, done, monthsLeft, monthly, onTrack };
  }

  // ---------- Prévisions ----------

  function recurringTotalsBetween(state, start, end) {
    let income = 0, expense = 0, saving = 0;
    const cats = categoryMap(state);
    for (const rec of state.recurring) {
      if (rec.active === false) continue;
      const n = occurrencesBetween(rec, start, end).length;
      if (!n) continue;
      if (rec.type === 'income') income += rec.amount * n;
      else if (cats[rec.categoryId] && cats[rec.categoryId].group === 'epargne') saving += rec.amount * n;
      else expense += rec.amount * n;
    }
    return { income, expense, saving };
  }

  function plannedBetween(state, start, end) {
    let income = 0, expense = 0;
    const items = [];
    for (const p of state.planned || []) {
      if (p.date < start || p.date > end) continue;
      if (p.type === 'income') income += p.amount; else expense += p.amount;
      items.push(p);
    }
    return { income, expense, items };
  }

  /** Projection de la fin du mois en cours selon le rythme de dépenses. */
  function forecastMonth(state, today) {
    const cats = categoryMap(state);
    const start = startOfMonth(today);
    const end = endOfMonth(today);
    const elapsedDays = diffDays(start, today) + 1;
    const totalDays = diffDays(start, end) + 1;
    const remainingDays = totalDays - elapsedDays;

    const soFarTx = inRange(state.transactions, start, today);
    const soFar = summarize(soFarTx, cats);

    const tomorrow = addDays(today, 1);
    const rec = tomorrow <= end ? recurringTotalsBetween(state, tomorrow, end) : { income: 0, expense: 0, saving: 0 };
    const planned = tomorrow <= end ? plannedBetween(state, tomorrow, end) : { income: 0, expense: 0, items: [] };

    // Rythme des dépenses variables : moyenne historique si dispo, sinon rythme du mois
    const variableSoFar = soFarTx.filter((t) => t.type === 'expense' && !t.recurringId && !isSavingTx(t, cats)).reduce((a, t) => a + t.amount, 0);
    const hist = variableAverages(state, today, 3);
    const currentPace = variableSoFar / elapsedDays;
    const histPace = hist.months > 0 ? hist.expense / 30.4 : null;
    // Pondération : plus le mois avance, plus on fait confiance au rythme réel
    const w = elapsedDays / totalDays;
    const pace = histPace === null ? currentPace : (histPace * (1 - w) + currentPace * w);
    const variableRemaining = pace * remainingDays;

    const projectedIncome = soFar.income + rec.income + planned.income;
    const projectedExpense = soFar.expense + rec.expense + planned.expense + variableRemaining;
    const projectedSaving = soFar.saving + rec.saving;
    return {
      start, end, elapsedDays, totalDays, remainingDays,
      soFar,
      upcomingRecurring: rec,
      planned,
      dailyPace: pace,
      variableRemaining,
      projectedIncome,
      projectedExpense,
      projectedSaving,
      projectedRemaining: projectedIncome - projectedExpense - projectedSaving,
      // Ce qu'on peut encore dépenser par jour pour finir à 0 (hors récurrents à venir)
      dailyAllowance: remainingDays > 0 ? Math.max(0, (projectedIncome - soFar.expense - rec.expense - planned.expense - projectedSaving) / remainingDays) : 0,
    };
  }

  /**
   * Projection sur n mois (à partir du mois suivant celui de today).
   * scenario : { cutVariablePct, incomeChangePct, extraSaving }
   */
  function forecastMonths(state, today, n, scenario) {
    scenario = scenario || {};
    const cut = (scenario.cutVariablePct || 0) / 100;
    const inc = (scenario.incomeChangePct || 0) / 100;
    const hist = variableAverages(state, today, 3);
    const varExpense = hist.expense * (1 - cut);
    const varIncome = hist.income;
    let cumulative = state.settings.currentSavings || 0;
    const out = [];
    for (let i = 1; i <= n; i++) {
      const start = startOfMonth(addMonths(startOfMonth(today), i));
      const end = endOfMonth(start);
      const rec = recurringTotalsBetween(state, start, end);
      const planned = plannedBetween(state, start, end);
      const income = (rec.income + varIncome) * (1 + inc) + planned.income;
      const expense = rec.expense + varExpense + planned.expense;
      const net = income - expense; // ce qui reste, épargnable
      cumulative += net;
      out.push({ key: monthKey(start), label: monthLabel(start, true), start, income, expense, net, cumulative, planned: planned.items });
    }
    return { months: out, baseline: { varExpense, varIncome, histMonths: hist.months } };
  }

  // ---------- Pistes d'économies ----------

  function savingsInsights(state, today) {
    const cats = categoryMap(state);
    const insights = [];
    const hist = variableAverages(state, today, 3);
    const series = monthlySeries(state, 3, addMonths(startOfMonth(today), -1));
    const avgIncome = series.reduce((a, m) => a + m.income, 0) / Math.max(1, series.filter((m) => m.income > 0).length);

    // 1. Règle 50/30/20 sur les 3 derniers mois
    const start = series[0].start;
    const end = series[series.length - 1].end;
    const txs = inRange(state.transactions, start, end);
    const groups = { besoin: 0, envie: 0, epargne: 0 };
    for (const t of txs) {
      if (t.type !== 'expense') continue;
      const g = (cats[t.categoryId] && cats[t.categoryId].group) || 'envie';
      groups[g] += t.amount;
    }
    const monthsCount = Math.max(1, new Set(txs.map((t) => monthKey(t.date))).size);
    for (const k in groups) groups[k] /= monthsCount;
    if (avgIncome > 0) {
      const split = {
        besoin: groups.besoin / avgIncome,
        envie: groups.envie / avgIncome,
        epargne: (avgIncome - groups.besoin - groups.envie) / avgIncome,
      };
      insights.rule = { split, groups, income: avgIncome };
      if (split.envie > 0.3) {
        const saving = (split.envie - 0.3) * avgIncome;
        insights.push({ icon: '⚖️', level: 'warn', title: 'Vos envies dépassent 30 % de vos revenus', text: `Les dépenses « plaisir » représentent ${Math.round(split.envie * 100)} % de vos revenus. Les ramener à 30 % libérerait environ ${fmt(saving)} par mois.`, monthly: saving });
      }
      if (split.besoin > 0.5) {
        insights.push({ icon: '🏠', level: 'info', title: 'Charges fixes élevées', text: `Vos besoins essentiels pèsent ${Math.round(split.besoin * 100)} % de vos revenus (cible : 50 %). Renégocier assurances, énergie ou forfait téléphone peut faire une vraie différence sur l'année.`, monthly: 0 });
      }
      if (split.epargne >= 0.2) {
        insights.push({ icon: '🌱', level: 'good', title: 'Belle capacité d\'épargne', text: `Vous mettez de côté environ ${Math.round(split.epargne * 100)} % de vos revenus. Pensez à faire travailler cet argent (voir l'onglet Placements).`, monthly: 0 });
      }
    }

    // 2. Catégories en hausse ce mois-ci vs moyenne
    const cur = byCategory(inRange(state.transactions, startOfMonth(today), today).filter((t) => !t.recurringId), 'expense', cats);
    const progress = (diffDays(startOfMonth(today), today) + 1) / (diffDays(startOfMonth(today), endOfMonth(today)) + 1);
    for (const row of cur) {
      if (row.category.group === 'epargne') continue;
      const avg = hist.perCat[row.category.id];
      if (!avg || avg < 20) continue;
      const projected = row.total / Math.max(progress, 0.25);
      if (projected > avg * 1.25) {
        insights.push({ icon: row.category.icon, level: 'warn', title: `${row.category.name} en hausse`, text: `Vous avez déjà dépensé ${fmt(row.total)} ce mois-ci, contre ${fmt(avg)} en moyenne par mois. À ce rythme vous finiriez autour de ${fmt(projected)}.`, monthly: projected - avg });
      }
    }

    // 3. Abonnements récurrents
    const subs = state.recurring.filter((r) => r.active !== false && r.type === 'expense' && cats[r.categoryId] && cats[r.categoryId].id === 'abonnements');
    if (subs.length) {
      const monthly = subs.reduce((a, r) => a + monthlyEquivalent(r), 0);
      insights.push({ icon: '📺', level: 'info', title: `${subs.length} abonnement${subs.length > 1 ? 's' : ''} actif${subs.length > 1 ? 's' : ''}`, text: `Soit ${fmt(monthly)} par mois et ${fmt(monthly * 12)} par an. Faites le tri dans ceux que vous n'utilisez plus vraiment : ${subs.map((s) => s.label).join(', ')}.`, monthly: 0 });
    }

    // 4. Petites dépenses fréquentes (« effet latte »)
    const small = inRange(state.transactions, start, end).filter((t) => t.type === 'expense' && !t.recurringId && t.amount < 15 && !isSavingTx(t, cats));
    if (small.length >= 8) {
      const total = small.reduce((a, t) => a + t.amount, 0) / monthsCount;
      insights.push({ icon: '☕', level: 'info', title: 'L\'effet des petites dépenses', text: `${Math.round(small.length / monthsCount)} achats de moins de 15 € par mois, soit ${fmt(total)} / mois (${fmt(total * 12)} / an). En supprimer la moitié = ${fmt(total * 6)} d'économies annuelles.`, monthly: total / 2 });
    }

    // 5. Simulation : -10 % sur les 3 plus grosses catégories variables
    const top = Object.keys(hist.perCat)
      .map((id) => ({ cat: cats[id], avg: hist.perCat[id] }))
      .filter((x) => x.cat && x.cat.group === 'envie')
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 3);
    if (top.length) {
      const gain = top.reduce((a, x) => a + x.avg * 0.1, 0);
      insights.push({ icon: '✂️', level: 'info', title: 'Le pouvoir des 10 %', text: `Réduire de 10 % ${top.map((x) => x.cat.name.toLowerCase()).join(', ')} vous ferait économiser ${fmt(gain)} par mois, soit ${fmt(gain * 12)} par an.`, monthly: gain });
    }

    // 6. Épargne de précaution
    const essentials = groups.besoin || 0;
    if (essentials > 0) {
      const target = essentials * 3;
      const have = state.settings.currentSavings || 0;
      insights.precaution = { min: essentials * 3, max: essentials * 6, have };
      if (have < target) {
        insights.push({ icon: '🛟', level: 'warn', title: 'Constituez votre épargne de précaution', text: `Avec ${fmt(essentials)} de dépenses essentielles par mois, visez un matelas de ${fmt(essentials * 3)} à ${fmt(essentials * 6)} sur un livret disponible avant d'investir. Vous en êtes à ${fmt(have)}.`, monthly: 0 });
      }
    }
    return insights;
  }

  function monthlyEquivalent(rec) {
    if (rec.frequency === 'weekly') return rec.amount * 52 / 12;
    if (rec.frequency === 'yearly') return rec.amount / 12;
    return rec.amount;
  }

  // ---------- Placements ----------

  /** Simulation d'intérêts composés avec versements mensuels. rate : taux annuel en %. */
  function simulateInvestment({ initial, monthly, years, rate, fees }) {
    const net = (rate - (fees || 0)) / 100;
    const r = Math.pow(1 + net, 1 / 12) - 1;
    let value = initial;
    let contributed = initial;
    const points = [{ year: 0, value, contributed }];
    for (let m = 1; m <= years * 12; m++) {
      value = value * (1 + r) + monthly;
      contributed += monthly;
      if (m % 12 === 0) points.push({ year: m / 12, value, contributed });
    }
    return { points, final: value, contributed, gains: value - contributed };
  }

  // ---------- Formatage ----------

  const moneyFmt = typeof Intl !== 'undefined' ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) : null;
  function fmt(n) {
    return moneyFmt ? moneyFmt.format(Math.round(n)) : `${Math.round(n)} €`;
  }

  const Core = {
    toISO, parseISO, todayISO, addDays, addMonths, daysInMonth, monthKey, startOfMonth, endOfMonth,
    startOfWeek, diffDays, monthsBetween, monthLabel, periodRange, MONTHS,
    occurrencesBetween, materializeRecurring, monthlyEquivalent,
    inRange, categoryMap, summarize, byCategory, monthlySeries, variableAverages, isSavingTx,
    budgetStatus, computeAlerts, goalInfo,
    forecastMonth, forecastMonths, recurringTotalsBetween,
    savingsInsights, simulateInvestment,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  else root.Core = Core;
})(typeof window !== 'undefined' ? window : globalThis);
