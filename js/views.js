/* Pécule — rendu des différentes pages. */
(function (root) {
  'use strict';
  const { Core, Store, UI, Charts, App } = root;
  const { esc, money, signed, pct, fmtDate, parseAmount } = UI;

  const C_INCOME = 'var(--income)';
  const C_EXPENSE = 'var(--expense)';
  const C_SAVING = 'var(--saving)';
  const C_ACCENT = 'var(--accent)';

  // ---------- Briques communes ----------

  function periodBar() {
    const { period, offset } = App.ui;
    const range = Core.periodRange(period, App.today(), offset);
    return `<div class="period-bar">
      <div class="segmented small">
        ${[['week', 'Semaine'], ['month', 'Mois'], ['year', 'Année']].map(([v, l]) => `<label><input type="radio" name="period" value="${v}" data-change="period" ${period === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}
      </div>
      <div class="period-nav">
        <button class="icon-btn" data-action="period-prev" aria-label="Période précédente">‹</button>
        <span class="period-label">${esc(range.label)}</span>
        <button class="icon-btn" data-action="period-next" aria-label="Période suivante" ${offset >= 0 ? 'disabled' : ''}>›</button>
        ${offset !== 0 ? '<button class="btn small ghost" data-action="period-now">Aujourd\'hui</button>' : ''}
      </div>
    </div>`;
  }
  App.actions['period'] = (el) => { App.ui.period = el.value; App.ui.offset = 0; App.render(); };
  App.actions['period-prev'] = () => { App.ui.offset--; App.render(); };
  App.actions['period-next'] = () => { if (App.ui.offset < 0) App.ui.offset++; App.render(); };
  App.actions['period-now'] = () => { App.ui.offset = 0; App.render(); };

  function progress(value, max, level, color) {
    const p = max > 0 ? Math.min(100, (value / max) * 100) : 0;
    return `<div class="progress ${level || ''}"><span style="width:${p}%;${color ? `background:${color}` : ''}"></span></div>`;
  }

  function catBadge(c) {
    return `<span class="cat-badge" style="--c:${c ? c.color : '#94a3b8'}">${c ? c.icon : '❔'}</span>`;
  }

  function txRow(t, cats) {
    const c = cats[t.categoryId];
    return `<li class="tx-row" data-action="edit-tx" data-id="${t.id}" tabindex="0">
      ${catBadge(c)}
      <div class="tx-main"><b>${esc(t.label)}</b><small>${esc(c ? c.name : 'Sans catégorie')}${t.recurringId ? ' · <span title="Opération récurrente">🔁</span>' : ''}${t.goalId ? ' · 🎯' : ''}</small></div>
      <span class="amount ${t.type}">${t.type === 'income' ? '+' : '−'}${money(t.amount, true)}</span>
    </li>`;
  }
  App.actions['edit-tx'] = (el) => {
    const t = App.S.transactions.find((x) => x.id === el.dataset.id);
    if (t) App.transactionForm(t);
  };

  function empty(icon, text, cta) {
    return `<div class="empty"><div class="empty-icon">${icon}</div><p>${text}</p>${cta || ''}</div>`;
  }

  function kpi(label, value, sub, kind, icon) {
    return `<div class="card kpi ${kind || ''}"><div class="kpi-head"><span class="kpi-icon">${icon}</span><span>${label}</span></div><div class="kpi-value">${value}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`;
  }

  function budgetFactor(period) {
    return period === 'week' ? 7 / 30.44 : period === 'year' ? 12 : 1;
  }

  // ---------- Tableau de bord ----------

  App.views.tableau = {
    title: 'Tableau de bord',
    render() {
      const S = App.S, cats = App.cats(), today = App.today();
      const range = Core.periodRange(App.ui.period, today, App.ui.offset);
      const txs = Core.inRange(S.transactions, range.start, range.end);
      const sum = Core.summarize(txs, cats);
      const hour = new Date().getHours();
      const hello = `${hour < 18 ? 'Bonjour' : 'Bonsoir'}${S.settings.name ? ` ${esc(S.settings.name)}` : ''} 👋`;

      if (!S.transactions.length && !S.recurring.length) {
        return `<section class="hero card"><h2>${hello}</h2><p>Commencez par ajouter vos revenus et vos dépenses. Les charges fixes (loyer, salaire, abonnements) peuvent être enregistrées une seule fois en « récurrent ».</p>
          <div class="row-btns"><button class="btn primary" data-action="add-tx" data-type="income">+ Ajouter un revenu</button><button class="btn" data-action="add-tx" data-type="expense">+ Ajouter une dépense</button><button class="btn ghost" data-action="load-demo">Voir un exemple</button></div></section>`;
      }

      const alerts = App.activeAlerts();
      const alertStrip = alerts.length ? `<div class="alert-strip">${alerts.slice(0, 2).map((a) => `<div class="alert ${a.level}"><span class="alert-icon">${a.icon}</span><div><b>${esc(a.title)}</b><p>${esc(a.text)}</p></div></div>`).join('')}
        ${alerts.length > 2 ? `<button class="btn small ghost" data-action="alerts">Voir les ${alerts.length} alertes</button>` : ''}</div>` : '';

      // Prévision de fin de mois (mois en cours uniquement)
      let forecast = '';
      if (App.ui.period === 'month' && App.ui.offset === 0) {
        const fc = Core.forecastMonth(S, today);
        const pctMonth = fc.elapsedDays / fc.totalDays * 100;
        forecast = `<div class="card forecast-card ${fc.projectedRemaining < 0 ? 'negative' : ''}">
          <div class="fc-left">
            <h3>Fin de mois prévue</h3>
            <div class="big ${fc.projectedRemaining < 0 ? 'neg' : 'pos'}">${signed(fc.projectedRemaining)}</div>
            <p class="muted">${fc.projectedRemaining >= 0 ? 'C\'est ce que vous pourriez épargner ce mois-ci au rythme actuel.' : 'Au rythme actuel, le mois risque de finir dans le rouge.'}</p>
          </div>
          <div class="fc-right">
            <div class="fc-stat"><span>Vous pouvez encore dépenser</span><b>${money(fc.dailyAllowance)} / jour</b></div>
            <div class="fc-stat"><span>Charges fixes à venir</span><b>${money(fc.upcomingRecurring.expense + fc.upcomingRecurring.saving)}</b></div>
            <div class="fc-stat"><span>Jours restants</span><b>${fc.remainingDays}</b></div>
            ${progress(pctMonth, 100, '', C_ACCENT)}
            <a href="#/previsions" class="link">Détail des prévisions →</a>
          </div>
        </div>`;
      }

      const byCat = Core.byCategory(txs.filter((t) => !Core.isSavingTx(t, cats)), 'expense', cats);
      const donutItems = byCat.slice(0, 7).map((r) => ({ label: r.category.name, value: r.total, color: r.category.color }));
      const rest = byCat.slice(7).reduce((a, r) => a + r.total, 0);
      if (rest > 0) donutItems.push({ label: 'Autres', value: rest, color: '#94a3b8' });

      const refEnd = range.end > today ? today : range.end;
      const series = Core.monthlySeries(S, 6, refEnd);

      const factor = budgetFactor(App.ui.period);
      const budgets = S.categories.filter((c) => c.type === 'expense' && c.budget).map((c) => {
        const spent = txs.filter((t) => t.type === 'expense' && t.categoryId === c.id).reduce((a, t) => a + t.amount, 0);
        const b = c.budget * factor;
        const p = spent / b * 100;
        const th = c.alertAt || S.settings.alertThreshold;
        return { c, spent, b, p, level: p >= 100 ? 'over' : p >= th ? 'warn' : 'ok' };
      }).sort((a, b) => b.p - a.p);

      const recent = [...txs].sort((a, b) => b.date.localeCompare(a.date) || 0).slice(0, 6);

      return `
        <div class="page-head"><div><h2>${hello}</h2><p class="muted">${fmtDate(today, true)}</p></div>${periodBar()}</div>
        ${alertStrip}
        <div class="kpis">
          ${kpi('Revenus', money(sum.income), `${txs.filter((t) => t.type === 'income').length} entrée(s)`, 'income', '↗')}
          ${kpi('Dépenses', money(sum.expense), sum.income ? `${pct(sum.expense / sum.income * 100)} des revenus` : '', 'expense', '↘')}
          ${kpi('Mis de côté', money(sum.saving), 'virements vers l\'épargne', 'saving', '🐷')}
          ${kpi('Reste disponible', `<span class="${sum.remaining < 0 ? 'neg' : ''}">${signed(sum.remaining)}</span>`, sum.income ? `Taux d'épargne : <b>${pct(Math.max(0, sum.savingsRate * 100))}</b>` : '', 'remaining', '💶')}
        </div>
        ${forecast}
        <div class="grid-2">
          <div class="card">
            <div class="card-head"><h3>Où va votre argent</h3><a class="link" href="#/operations">Opérations →</a></div>
            ${byCat.length ? `<div class="donut-wrap">${Charts.donut(donutItems, { subtitle: 'dépensés' })}
              <ul class="cat-list">${donutItems.map((i) => `<li><i style="background:${i.color}"></i><span>${esc(i.label)}</span><b>${money(i.value)}</b><small>${pct(i.value / sum.expense * 100)}</small></li>`).join('')}</ul></div>`
              : empty('🧾', 'Aucune dépense sur cette période.')}
          </div>
          <div class="card">
            <div class="card-head"><h3>Revenus vs dépenses</h3><small class="muted">6 derniers mois</small></div>
            ${Charts.bars(series.map((m) => ({ label: m.label, values: [m.income, m.expense, m.saving], highlight: m.key === Core.monthKey(refEnd) })), [{ name: 'Revenus', color: C_INCOME }, { name: 'Dépenses', color: C_EXPENSE }, { name: 'Épargne', color: C_SAVING }])}
            ${Charts.legend([{ name: 'Revenus', color: C_INCOME }, { name: 'Dépenses', color: C_EXPENSE }, { name: 'Épargne', color: C_SAVING }])}
          </div>
        </div>
        <div class="grid-2">
          <div class="card">
            <div class="card-head"><h3>Budgets ${App.ui.period === 'week' ? '<small class="muted">(ramenés à la semaine)</small>' : App.ui.period === 'year' ? '<small class="muted">(sur l\'année)</small>' : ''}</h3><a class="link" href="#/budgets">Gérer →</a></div>
            ${budgets.length ? `<ul class="budget-list">${budgets.slice(0, 5).map((x) => `<li>
              <div class="budget-line">${catBadge(x.c)}<span>${esc(x.c.name)}</span><b>${money(x.spent)} <small class="muted">/ ${money(x.b)}</small></b></div>
              ${progress(x.spent, x.b, x.level)}</li>`).join('')}</ul>`
              : empty('🎯', 'Aucun budget défini.', '<a class="btn small" href="#/budgets">Fixer des budgets</a>')}
          </div>
          <div class="card">
            <div class="card-head"><h3>Mes objectifs</h3><a class="link" href="#/objectifs">Tous →</a></div>
            ${S.goals.length ? `<ul class="goal-mini">${S.goals.slice(0, 4).map((g) => {
              const info = Core.goalInfo(g, today);
              return `<li>${catBadge({ icon: g.icon, color: g.color })}<div><div class="budget-line"><span>${esc(g.name)}</span><b>${pct(info.progress * 100)}</b></div>${progress(g.saved, g.target, info.done ? 'done' : '', g.color)}<small class="muted">${money(g.saved)} sur ${money(g.target)}${info.monthly && !info.done ? ` · ${money(info.monthly)}/mois` : ''}</small></div></li>`;
            }).join('')}</ul>` : empty('✈️', 'Mettez de l\'argent de côté pour un voyage, des sorties, un projet…', '<button class="btn small" data-action="new-goal">Créer un objectif</button>')}
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Dernières opérations</h3><a class="link" href="#/operations">Tout voir →</a></div>
          ${recent.length ? `<ul class="tx-list">${recent.map((t) => txRow(t, cats)).join('')}</ul>` : empty('🧾', 'Aucune opération sur cette période.')}
        </div>`;
    },
  };

  App.actions['load-demo'] = () => UI.confirmBox('Charger les données d\'exemple ?', 'Vos données actuelles seront remplacées par un budget fictif.', () => {
    App.S = Store.demoState(App.today());
    Store.save(App.S);
    App.render();
    UI.toast('Données d\'exemple chargées', 'good');
  }, 'Charger');

  // ---------- Opérations ----------

  function filteredTx() {
    const f = App.ui.tx;
    const range = Core.periodRange(App.ui.period, App.today(), App.ui.offset);
    const cats = App.cats();
    const q = f.q.trim().toLowerCase();
    return Core.inRange(App.S.transactions, range.start, range.end).filter((t) => {
      if (f.type !== 'all' && t.type !== f.type) return false;
      if (f.cat !== 'all' && t.categoryId !== f.cat) return false;
      if (q) {
        const c = cats[t.categoryId];
        if (!t.label.toLowerCase().includes(q) && !(c && c.name.toLowerCase().includes(q))) return false;
      }
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }

  function txListHTML() {
    const txs = filteredTx();
    const cats = App.cats();
    if (!txs.length) return empty('🔍', 'Aucune opération ne correspond.', '<button class="btn small primary" data-action="add-tx">+ Ajouter une opération</button>');
    const income = txs.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0);
    const expense = txs.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
    const groups = {};
    for (const t of txs) (groups[t.date] = groups[t.date] || []).push(t);
    return `<div class="tx-summary"><span>${txs.length} opération(s)</span><span class="amount income">+${money(income, true)}</span><span class="amount expense">−${money(expense, true)}</span><b class="${income - expense < 0 ? 'neg' : ''}">${signed(income - expense, true)}</b></div>
      ${Object.keys(groups).map((d) => {
        const dayTotal = groups[d].reduce((a, t) => a + (t.type === 'income' ? t.amount : -t.amount), 0);
        return `<div class="day-group"><div class="day-head"><span>${fmtDate(d, true)}</span><small>${signed(dayTotal, true)}</small></div><ul class="tx-list">${groups[d].map((t) => txRow(t, cats)).join('')}</ul></div>`;
      }).join('')}`;
  }

  App.views.operations = {
    title: 'Opérations',
    render() {
      const f = App.ui.tx;
      const tabs = `<div class="tabs">
        <button class="tab ${f.tab === 'list' ? 'active' : ''}" data-action="tx-tab" data-tab="list">Historique</button>
        <button class="tab ${f.tab === 'recurring' ? 'active' : ''}" data-action="tx-tab" data-tab="recurring">Récurrentes <span class="pill">${App.S.recurring.length}</span></button>
      </div>`;
      if (f.tab === 'recurring') return tabs + recurringHTML();
      const cats = App.S.categories;
      return `${tabs}
        <div class="page-head">${periodBar()}<div class="row-btns"><button class="btn ghost small" data-action="export-csv">⬇ Export CSV</button><button class="btn primary" data-action="add-tx">+ Nouvelle opération</button></div></div>
        <div class="card filters">
          <input type="search" placeholder="Rechercher un libellé, une catégorie…" value="${esc(f.q)}" data-input="tx-search" aria-label="Rechercher">
          <select data-change="tx-type" aria-label="Type">
            <option value="all" ${f.type === 'all' ? 'selected' : ''}>Tous les types</option>
            <option value="expense" ${f.type === 'expense' ? 'selected' : ''}>Dépenses</option>
            <option value="income" ${f.type === 'income' ? 'selected' : ''}>Revenus</option>
          </select>
          <select data-change="tx-cat" aria-label="Catégorie">
            <option value="all">Toutes les catégories</option>
            ${cats.map((c) => `<option value="${esc(c.id)}" ${f.cat === c.id ? 'selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="card" id="tx-list">${txListHTML()}</div>`;
    },
  };
  App.actions['tx-tab'] = (el) => { App.ui.tx.tab = el.dataset.tab; App.render(); };
  App.actions['tx-search'] = (el) => { App.ui.tx.q = el.value; document.getElementById('tx-list').innerHTML = txListHTML(); };
  App.actions['tx-type'] = (el) => { App.ui.tx.type = el.value; App.render(); };
  App.actions['tx-cat'] = (el) => { App.ui.tx.cat = el.value; App.render(); };
  App.actions['export-csv'] = () => App.exportCSV();

  const FREQ = { weekly: 'Hebdo', monthly: 'Mensuel', yearly: 'Annuel' };

  function recurringHTML() {
    const S = App.S, cats = App.cats();
    const list = [...S.recurring].sort((a, b) => (a.type === b.type ? b.amount - a.amount : a.type === 'income' ? -1 : 1));
    const active = list.filter((r) => r.active !== false && (!r.endDate || r.endDate >= App.today()));
    const inc = active.filter((r) => r.type === 'income').reduce((a, r) => a + Core.monthlyEquivalent(r), 0);
    const exp = active.filter((r) => r.type === 'expense').reduce((a, r) => a + Core.monthlyEquivalent(r), 0);
    const nextOf = (r) => {
      const n = Core.occurrencesBetween(r, Core.addDays(App.today(), 1), Core.addMonths(App.today(), 13));
      return n[0];
    };
    return `<div class="page-head"><p class="muted">Salaire, loyer, abonnements… Saisis une fois, ajoutés automatiquement à chaque échéance.</p><button class="btn primary" data-action="new-recurring">+ Opération récurrente</button></div>
      <div class="kpis three">
        ${kpi('Revenus fixes / mois', money(inc), '', 'income', '↗')}
        ${kpi('Charges fixes / mois', money(exp), inc ? `${pct(exp / inc * 100)} des revenus fixes` : '', 'expense', '↘')}
        ${kpi('Reste après charges fixes', signed(inc - exp), 'pour les dépenses variables et l\'épargne', 'remaining', '💶')}
      </div>
      <div class="card">${list.length ? `<ul class="tx-list">${list.map((r) => {
        const c = cats[r.categoryId];
        const next = nextOf(r);
        const off = r.active === false || (r.endDate && r.endDate < App.today());
        return `<li class="tx-row ${off ? 'off' : ''}" data-action="edit-recurring" data-id="${r.id}" tabindex="0">${catBadge(c)}
          <div class="tx-main"><b>${esc(r.label)}</b><small>${FREQ[r.frequency] || ''} · ${off ? 'inactive' : next ? `prochaine le ${fmtDate(next)}` : 'terminée'}</small></div>
          <span class="amount ${r.type}">${r.type === 'income' ? '+' : '−'}${money(r.amount, true)}</span></li>`;
      }).join('')}</ul>` : empty('🔁', 'Aucune opération récurrente.', '<button class="btn small primary" data-action="new-recurring">Ajouter le loyer, le salaire…</button>')}</div>`;
  }
  App.actions['new-recurring'] = () => App.recurringForm();
  App.actions['edit-recurring'] = (el) => App.recurringForm(App.S.recurring.find((r) => r.id === el.dataset.id));

  // ---------- Budgets ----------

  App.views.budgets = {
    title: 'Budgets & alertes',
    render() {
      const S = App.S, today = App.today();
      const status = Core.budgetStatus(S, today);
      const withBudget = new Set(status.map((b) => b.category.id));
      const monthTx = Core.inRange(S.transactions, Core.startOfMonth(today), Core.endOfMonth(today));
      const spentOf = (id) => monthTx.filter((t) => t.type === 'expense' && t.categoryId === id).reduce((a, t) => a + t.amount, 0);
      const others = S.categories.filter((c) => c.type === 'expense' && !withBudget.has(c.id) && c.group !== 'epargne');
      const g = status.global;
      const totalBudget = status.reduce((a, b) => a + b.budget, 0);
      const fc = Core.forecastMonth(S, today);
      const label = Core.periodRange('month', today, 0).label;

      return `
        <div class="page-head"><div><h2>${esc(label)}</h2><p class="muted">Fixez des enveloppes par catégorie et choisissez quand être prévenu.</p></div>
          <button class="btn" data-action="suggest-budgets">✨ Suggérer des budgets</button></div>
        <div class="grid-2">
          <div class="card">
            <h3>Plafond global de dépenses</h3>
            <p class="muted">Un montant maximum à dépenser par mois, toutes catégories confondues (hors épargne).</p>
            <label class="field inline"><span>Plafond mensuel</span><input inputmode="decimal" data-change="set-limit" value="${S.settings.monthlyLimit ? String(S.settings.monthlyLimit).replace('.', ',') : ''}" placeholder="Aucun"><em>€</em></label>
            ${g ? `<div class="budget-line"><span>Dépensé ce mois-ci</span><b>${money(g.spent)} / ${money(g.budget)}</b></div>${progress(g.spent, g.budget, g.level)}
              <small class="muted">${g.left >= 0 ? `Encore ${money(g.left)} disponibles` : `Dépassement de ${money(-g.left)}`} · projection fin de mois : ${money(fc.projectedExpense)}</small>` : ''}
          </div>
          <div class="card">
            <h3>Seuil d'alerte par défaut</h3>
            <p class="muted">Recevez une alerte quand ce pourcentage d'un budget est consommé. Personnalisable par catégorie.</p>
            <label class="field"><span>Me prévenir à <b id="def-th">${S.settings.alertThreshold} %</b> du budget</span>
              <input type="range" min="50" max="100" step="5" value="${S.settings.alertThreshold}" data-input="threshold-preview" data-change="set-threshold"></label>
            <div class="legend-states"><span class="dot ok"></span>Sous le seuil <span class="dot warn"></span>Seuil atteint <span class="dot over"></span>Budget dépassé</div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Enveloppes du mois</h3>${totalBudget ? `<small class="muted">Total budgété : ${money(totalBudget)}</small>` : ''}</div>
          ${status.length ? `<ul class="budget-grid">${status.sort((a, b) => b.pct - a.pct).map((b) => `<li class="budget-card ${b.level}" data-action="edit-budget" data-id="${b.category.id}" tabindex="0">
              <div class="budget-line">${catBadge(b.category)}<span>${esc(b.category.name)}</span><span class="state ${b.level}">${b.level === 'over' ? 'Dépassé' : b.level === 'warn' ? 'Attention' : 'OK'}</span></div>
              <div class="budget-amounts"><b>${money(b.spent)}</b><span class="muted">/ ${money(b.budget)}</span></div>
              <div class="progress-wrap">${progress(b.spent, b.budget, b.level)}<i class="threshold" style="left:${b.threshold}%" title="Seuil d'alerte ${b.threshold} %"></i></div>
              <small class="muted">${b.left >= 0 ? `Reste ${money(b.left)}` : `${money(-b.left)} de trop`} · alerte à ${b.threshold} %</small>
            </li>`).join('')}</ul>` : empty('🎯', 'Aucune enveloppe pour l\'instant. Cliquez sur une catégorie ci-dessous ou laissez Pécule vous en suggérer.')}
        </div>
        <div class="card">
          <h3>Catégories sans budget</h3>
          <ul class="chip-list">${others.map((c) => `<li><button class="chip" data-action="edit-budget" data-id="${c.id}">${c.icon} ${esc(c.name)} <small>${money(spentOf(c.id))} ce mois</small> <b>+</b></button></li>`).join('')}</ul>
        </div>`;
    },
  };
  App.actions['edit-budget'] = (el) => App.budgetForm(App.S.categories.find((c) => c.id === el.dataset.id));
  App.actions['set-limit'] = (el) => {
    const v = parseAmount(el.value);
    App.commit((s) => { s.settings.monthlyLimit = v > 0 ? v : 0; }, 'Plafond enregistré');
  };
  App.actions['threshold-preview'] = (el) => { document.getElementById('def-th').textContent = `${el.value} %`; };
  App.actions['set-threshold'] = (el) => App.commit((s) => { s.settings.alertThreshold = Number(el.value); }, 'Seuil enregistré');
  App.actions['suggest-budgets'] = () => {
    const hist = Core.variableAverages(App.S, App.today(), 3);
    const cats = App.cats();
    const ids = Object.keys(hist.perCat).filter((id) => cats[id] && cats[id].group !== 'epargne' && hist.perCat[id] >= 10);
    if (!ids.length) return UI.toast('Il faut au moins un mois complet d\'historique pour suggérer des budgets.', 'warn');
    const round = (n) => Math.max(10, Math.round(n / 10) * 10);
    // Besoins : moyenne arrondie ; envies : -10 % pour dégager de l'épargne
    const proposal = ids.map((id) => ({ c: cats[id], v: round(hist.perCat[id] * (cats[id].group === 'envie' ? 0.9 : 1)), avg: hist.perCat[id] }));
    UI.modal('Budgets suggérés', `<p class="muted">Basés sur vos dépenses variables des ${hist.months} derniers mois (−10 % sur les envies pour dégager de l'épargne).</p>
      <ul class="suggest-list">${proposal.map((p) => `<li>${catBadge(p.c)}<span>${esc(p.c.name)}</span><small class="muted">moy. ${money(p.avg)}</small><input name="b_${esc(p.c.id)}" inputmode="decimal" value="${p.v}"><em>€</em></li>`).join('')}</ul>`, {
      submit: 'Appliquer',
      onSubmit: (d) => App.commit((s) => {
        for (const p of proposal) {
          const v = parseAmount(d[`b_${p.c.id}`]);
          s.categories.find((c) => c.id === p.c.id).budget = v > 0 ? v : 0;
        }
      }, 'Budgets appliqués'),
    });
  };

  // ---------- Objectifs ----------

  App.views.objectifs = {
    title: 'Objectifs d\'épargne',
    render() {
      const S = App.S, today = App.today();
      const goals = S.goals.map((g) => ({ g, info: Core.goalInfo(g, today) }));
      const saved = S.goals.reduce((a, g) => a + g.saved, 0);
      const target = S.goals.reduce((a, g) => a + g.target, 0);
      const needed = goals.filter((x) => !x.info.done && x.info.monthly).reduce((a, x) => a + x.info.monthly, 0);
      const fc = Core.forecastMonth(S, today);
      const capacity = Math.max(0, fc.projectedRemaining);

      let split = '';
      const open = goals.filter((x) => !x.info.done);
      if (open.length && capacity > 0) {
        const weights = open.map((x) => x.info.monthly || x.info.missing / 12);
        const totalW = weights.reduce((a, b) => a + b, 0) || 1;
        const budget = Math.min(capacity, needed || capacity);
        split = `<div class="card tip">
          <h3>💡 Suggestion de répartition</h3>
          <p>Au rythme actuel, il devrait vous rester <b>${money(capacity)}</b> à la fin du mois. ${needed > capacity ? `C'est moins que les <b>${money(needed)}</b> nécessaires pour tenir toutes vos échéances : voici une répartition au prorata.` : `Voici comment répartir ${money(budget)} pour tenir vos échéances.`}</p>
          <ul class="split-list">${open.map((x, i) => `<li>${catBadge({ icon: x.g.icon, color: x.g.color })}<span>${esc(x.g.name)}</span><b>${money(budget * weights[i] / totalW)}</b></li>`).join('')}</ul>
        </div>`;
      }

      return `
        <div class="page-head"><p class="muted">Voyage, sorties, restos, fonds d'urgence… Donnez un but à votre épargne.</p><button class="btn primary" data-action="new-goal">+ Nouvel objectif</button></div>
        ${S.goals.length ? `<div class="kpis three">
          ${kpi('Total épargné', money(saved), `sur ${money(target)} visés`, 'saving', '🐷')}
          ${kpi('À mettre de côté / mois', money(needed), 'pour tenir toutes les échéances', 'expense', '📅')}
          ${kpi('Capacité ce mois-ci', money(capacity), 'reste prévu en fin de mois', capacity >= needed ? 'income' : 'remaining', '💶')}
        </div>` : ''}
        ${split}
        ${goals.length ? `<div class="goal-grid">${goals.map(({ g, info }) => {
          const r = 34, circ = 2 * Math.PI * r;
          return `<div class="card goal-card ${info.done ? 'done' : ''}" style="--c:${g.color}">
            <div class="goal-top">
              <svg viewBox="0 0 80 80" class="ring"><circle cx="40" cy="40" r="${r}" class="ring-bg"/><circle cx="40" cy="40" r="${r}" class="ring-fg" stroke-dasharray="${circ * info.progress} ${circ}" transform="rotate(-90 40 40)"/><text x="40" y="38" text-anchor="middle" class="ring-icon">${g.icon}</text><text x="40" y="56" text-anchor="middle" class="ring-pct">${pct(info.progress * 100)}</text></svg>
              <div><h3>${esc(g.name)}</h3><div class="goal-amount"><b>${money(g.saved)}</b> <span class="muted">/ ${money(g.target)}</span></div>
              ${info.done ? '<span class="state ok">Atteint 🎉</span>' : g.deadline ? `<span class="state ${info.onTrack ? 'ok' : 'warn'}">${info.onTrack ? 'Dans les temps' : 'En retard'}</span>` : ''}</div>
              <button class="icon-btn" data-action="edit-goal" data-id="${g.id}" aria-label="Modifier">✎</button>
            </div>
            <dl class="goal-facts">
              <div><dt>Reste à épargner</dt><dd>${money(info.missing)}</dd></div>
              <div><dt>Échéance</dt><dd>${g.deadline ? fmtDate(g.deadline) : '—'}</dd></div>
              <div><dt>Par mois</dt><dd>${info.done ? '—' : info.monthly != null ? money(info.monthly) : 'libre'}</dd></div>
              <div><dt>Par semaine</dt><dd>${info.done || info.monthly == null ? '—' : money(info.monthly * 12 / 52)}</dd></div>
            </dl>
            <div class="row-btns">
              <button class="btn primary small" data-action="contribute" data-id="${g.id}" ${info.done ? 'disabled' : ''}>+ Ajouter</button>
              <button class="btn ghost small" data-action="withdraw" data-id="${g.id}" ${g.saved <= 0 ? 'disabled' : ''}>Retirer</button>
            </div>
          </div>`;
        }).join('')}</div>` : `<div class="card">${empty('🎯', 'Aucun objectif pour le moment. Un voyage, un budget restos, un nouveau téléphone ?', '<button class="btn primary" data-action="new-goal">Créer mon premier objectif</button>')}</div>`}`;
    },
  };
  App.actions['new-goal'] = () => App.goalForm();
  App.actions['edit-goal'] = (el) => App.goalForm(App.S.goals.find((g) => g.id === el.dataset.id));
  App.actions['contribute'] = (el) => App.contributionForm(App.S.goals.find((g) => g.id === el.dataset.id));
  App.actions['withdraw'] = (el) => App.contributionForm(App.S.goals.find((g) => g.id === el.dataset.id), true);

  // ---------- Prévisions ----------

  function forecastDynamic() {
    const S = App.S, today = App.today(), sc = App.ui.scenario;
    const base = Core.forecastMonths(S, today, sc.horizon, {});
    const scen = Core.forecastMonths(S, today, sc.horizon, sc);
    const changed = sc.cutVariablePct || sc.incomeChangePct;
    const last = scen.months[scen.months.length - 1];
    const lastBase = base.months[base.months.length - 1];
    const avgNet = scen.months.reduce((a, m) => a + m.net, 0) / scen.months.length;
    const negMonths = scen.months.filter((m) => m.net < 0);
    const seriesDef = [{ name: changed ? 'Avec votre scénario' : 'Épargne cumulée prévue', color: C_ACCENT, values: scen.months.map((m) => m.cumulative), area: true }];
    if (changed) seriesDef.push({ name: 'Sans changement', color: 'var(--muted)', values: base.months.map((m) => m.cumulative), dashed: true });
    return `
      <div class="kpis three">
        ${kpi('Épargne dans ' + sc.horizon + ' mois', money(last.cumulative), changed ? `${signed(last.cumulative - lastBase.cumulative)} grâce au scénario` : `dont ${money(S.settings.currentSavings || 0)} déjà disponibles`, 'saving', '🐷')}
        ${kpi('Reste moyen / mois', signed(avgNet), 'revenus − dépenses prévues', avgNet >= 0 ? 'income' : 'expense', '💶')}
        ${kpi('Mois difficiles', String(negMonths.length), negMonths.length ? negMonths.map((m) => m.label).join(', ') : 'aucun mois négatif prévu', negMonths.length ? 'expense' : 'income', '⚠️')}
      </div>
      <div class="card">
        <div class="card-head"><h3>Évolution de votre épargne</h3></div>
        ${Charts.lines(scen.months.map((m) => m.label), seriesDef, { height: 300, width: 1100 })}
        ${Charts.legend(seriesDef)}
      </div>
      <div class="card">
        <div class="card-head"><h3>Mois par mois</h3><small class="muted">Base : charges fixes + moyenne de vos dépenses variables (${money(scen.baseline.varExpense)}/mois)</small></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Mois</th><th>Revenus</th><th>Dépenses</th><th>Reste</th><th>Cumul</th><th>Événements</th></tr></thead>
          <tbody>${scen.months.map((m) => `<tr><td>${esc(Core.monthLabel(m.start))}</td><td class="amount income">${money(m.income)}</td><td class="amount expense">${money(m.expense)}</td><td class="${m.net < 0 ? 'neg' : 'pos'}"><b>${signed(m.net)}</b></td><td>${money(m.cumulative)}</td><td>${m.planned.map((p) => `<span class="tag ${p.type}">${esc(p.label)}</span>`).join(' ')}</td></tr>`).join('')}</tbody>
        </table></div>
      </div>`;
  }

  App.views.previsions = {
    title: 'Prévisions',
    render() {
      const S = App.S, today = App.today(), sc = App.ui.scenario, cats = App.cats();
      const fc = Core.forecastMonth(S, today);
      const upcoming = [];
      for (const r of S.recurring) for (const d of Core.occurrencesBetween(r, Core.addDays(today, 1), Core.addDays(today, 30))) upcoming.push({ ...r, date: d });
      upcoming.sort((a, b) => a.date.localeCompare(b.date));
      const planned = [...S.planned].filter((p) => p.date >= today).sort((a, b) => a.date.localeCompare(b.date));
      const past = S.planned.filter((p) => p.date < today).length;
      const row = (label, value, cls) => `<div class="fc-line ${cls || ''}"><span>${label}</span><b>${value}</b></div>`;

      return `
        <div class="grid-2">
          <div class="card">
            <h3>Fin du mois en cours</h3>
            <p class="muted">${fc.elapsedDays} jour(s) écoulé(s) sur ${fc.totalDays}.</p>
            ${row('Revenus reçus', `+${money(fc.soFar.income)}`)}
            ${row('Revenus attendus', `+${money(fc.upcomingRecurring.income + fc.planned.income)}`)}
            ${row('Dépenses déjà faites', `−${money(fc.soFar.expense)}`)}
            ${row('Charges fixes à venir', `−${money(fc.upcomingRecurring.expense + fc.planned.expense)}`)}
            ${row(`Dépenses variables estimées <small class="muted">(${money(fc.dailyPace)}/jour)</small>`, `−${money(fc.variableRemaining)}`)}
            ${row('Épargne programmée', `−${money(fc.projectedSaving)}`)}
            ${row('Reste prévu en fin de mois', signed(fc.projectedRemaining), fc.projectedRemaining < 0 ? 'total neg' : 'total pos')}
            <p class="hint">Pour finir le mois à l'équilibre, limitez vos dépenses variables à <b>${money(fc.dailyAllowance)} par jour</b>.</p>
          </div>
          <div class="card">
            <div class="card-head"><h3>Dépenses & rentrées exceptionnelles</h3><button class="btn small primary" data-action="new-planned">+ Ajouter</button></div>
            <p class="muted">Vacances, impôts, prime, cadeaux de Noël… Anticipez-les pour éviter les mauvaises surprises.</p>
            ${planned.length ? `<ul class="tx-list">${planned.map((p) => `<li class="tx-row" data-action="edit-planned" data-id="${p.id}" tabindex="0">${catBadge(cats[p.categoryId])}<div class="tx-main"><b>${esc(p.label)}</b><small>${fmtDate(p.date)}</small></div><span class="amount ${p.type}">${p.type === 'income' ? '+' : '−'}${money(p.amount)}</span></li>`).join('')}</ul>` : empty('📅', 'Aucun événement prévu.')}
            ${past ? `<small class="muted">${past} prévision(s) passée(s) masquée(s).</small>` : ''}
          </div>
        </div>
        <div class="card scenario">
          <div class="card-head"><h3>Simulateur de scénario</h3>
            <select data-change="horizon" aria-label="Horizon">${[6, 12, 24, 36].map((n) => `<option value="${n}" ${sc.horizon === n ? 'selected' : ''}>${n} mois</option>`).join('')}</select></div>
          <div class="grid-2 tight">
            <label class="field"><span>Réduire mes dépenses variables de <b id="sc-cut">${sc.cutVariablePct} %</b></span><input type="range" min="0" max="50" step="5" value="${sc.cutVariablePct}" data-input="sc-cut"></label>
            <label class="field"><span>Variation de mes revenus <b id="sc-inc">${sc.incomeChangePct > 0 ? '+' : ''}${sc.incomeChangePct} %</b></span><input type="range" min="-30" max="30" step="5" value="${sc.incomeChangePct}" data-input="sc-inc"></label>
          </div>
        </div>
        <div id="fc-dynamic">${forecastDynamic()}</div>
        <div class="card">
          <h3>Prochaines échéances fixes (30 jours)</h3>
          ${upcoming.length ? `<ul class="tx-list">${upcoming.map((u) => `<li class="tx-row">${catBadge(cats[u.categoryId])}<div class="tx-main"><b>${esc(u.label)}</b><small>${fmtDate(u.date, true)}</small></div><span class="amount ${u.type}">${u.type === 'income' ? '+' : '−'}${money(u.amount, true)}</span></li>`).join('')}</ul>` : empty('🔁', 'Aucune échéance récurrente dans les 30 prochains jours.', '<a class="btn small" href="#/operations" data-action="tx-tab" data-tab="recurring">Ajouter des opérations récurrentes</a>')}
        </div>`;
    },
  };
  App.actions['new-planned'] = () => App.plannedForm();
  App.actions['edit-planned'] = (el) => App.plannedForm(App.S.planned.find((p) => p.id === el.dataset.id));
  App.actions['horizon'] = (el) => { App.ui.scenario.horizon = Number(el.value); document.getElementById('fc-dynamic').innerHTML = forecastDynamic(); };
  App.actions['sc-cut'] = (el) => { App.ui.scenario.cutVariablePct = Number(el.value); document.getElementById('sc-cut').textContent = `${el.value} %`; document.getElementById('fc-dynamic').innerHTML = forecastDynamic(); };
  App.actions['sc-inc'] = (el) => { const v = Number(el.value); App.ui.scenario.incomeChangePct = v; document.getElementById('sc-inc').textContent = `${v > 0 ? '+' : ''}${v} %`; document.getElementById('fc-dynamic').innerHTML = forecastDynamic(); };
  // Le lien vers les récurrentes depuis les prévisions doit changer d'onglet ET de page
  const txTab = App.actions['tx-tab'];
  App.actions['tx-tab'] = (el) => { App.ui.tx.tab = el.dataset.tab; if (App.route() !== 'operations') location.hash = '#/operations'; else txTab(el); };

  // ---------- Économies ----------

  App.views.economies = {
    title: 'Économies',
    render() {
      const S = App.S, today = App.today();
      const insights = Core.savingsInsights(S, today);
      const rule = insights.rule;
      const total = insights.reduce((a, i) => a + (i.monthly || 0), 0);
      const hist = Core.variableAverages(S, today, 3);
      const cats = App.cats();
      const top = Object.keys(hist.perCat).map((id) => ({ c: cats[id], v: hist.perCat[id] })).filter((x) => x.c).sort((a, b) => b.v - a.v).slice(0, 6);

      if (!rule && !insights.length) return `<div class="card">${empty('🔍', 'Pécule a besoin d\'au moins un mois d\'historique pour analyser vos dépenses et proposer des économies.', '<button class="btn primary" data-action="add-tx">+ Ajouter des opérations</button>')}</div>`;

      const bar = rule ? (() => {
        const b = Math.max(0, rule.split.besoin * 100), e = Math.max(0, rule.split.envie * 100), s = Math.max(0, 100 - b - e);
        return `<div class="card">
          <div class="card-head"><h3>La règle 50 / 30 / 20</h3><small class="muted">moyenne des 3 derniers mois · revenus ${money(rule.income)}/mois</small></div>
          <p class="muted">Un repère simple : 50 % pour les besoins, 30 % pour les envies, 20 % pour l'épargne.</p>
          <div class="stack-bar"><span class="besoin" style="width:${Math.min(100, b)}%">${Math.round(b)} %</span><span class="envie" style="width:${Math.min(100 - Math.min(100, b), e)}%">${Math.round(e)} %</span><span class="epargne" style="width:${s}%">${Math.round(s)} %</span></div>
          <div class="stack-bar target"><span class="besoin" style="width:50%">50 %</span><span class="envie" style="width:30%">30 %</span><span class="epargne" style="width:20%">20 %</span></div>
          <div class="rule-legend">
            <div><i class="besoin"></i><b>Besoins</b> ${money(rule.groups.besoin)} <small class="muted">cible ${money(rule.income * 0.5)}</small></div>
            <div><i class="envie"></i><b>Envies</b> ${money(rule.groups.envie)} <small class="muted">cible ${money(rule.income * 0.3)}</small></div>
            <div><i class="epargne"></i><b>Épargne</b> ${money(rule.income * s / 100)} <small class="muted">cible ${money(rule.income * 0.2)}</small></div>
          </div>
        </div>`;
      })() : '';

      return `
        ${total > 0 ? `<div class="card hero-savings"><div><h3>Économies potentielles identifiées</h3><p class="muted">En appliquant les pistes ci-dessous</p></div><div class="big pos">${money(total)}<small>/mois</small></div><div class="big-sub">soit <b>${money(total * 12)}</b> par an</div></div>` : ''}
        ${bar}
        <div class="insight-grid">${insights.map((i) => `<div class="card insight ${i.level}"><div class="insight-icon">${i.icon}</div><div><h3>${esc(i.title)}</h3><p>${esc(i.text)}</p>${i.monthly > 0 ? `<span class="tag good">≈ ${money(i.monthly)} / mois</span>` : ''}</div></div>`).join('')}</div>
        ${top.length ? `<div class="card"><div class="card-head"><h3>Vos plus gros postes variables</h3><small class="muted">moyenne mensuelle</small></div>
          <ul class="budget-list">${top.map((x) => `<li><div class="budget-line">${catBadge(x.c)}<span>${esc(x.c.name)}</span><b>${money(x.v)}</b></div>${progress(x.v, top[0].v, '', x.c.color)}<small class="muted">−10 % = ${money(x.v * 0.1 * 12)} économisés par an · −25 % = ${money(x.v * 0.25 * 12)}</small></li>`).join('')}</ul></div>` : ''}
        <div class="card"><h3>Astuces du quotidien</h3><ul class="tips">
          <li>🛒 Faites une liste de courses et comparez le prix au kilo : 10 à 20 % d'économies sur le panier.</li>
          <li>📱 Renégociez box, forfait mobile et assurances une fois par an (la résiliation est simple après 1 an).</li>
          <li>⏳ Appliquez la règle des 48 h avant tout achat « plaisir » non prévu au-delà de 50 €.</li>
          <li>💸 Programmez un virement d'épargne automatique le jour de la paie : on dépense ce qui reste, pas l'inverse.</li>
          <li>🍱 Préparez vos déjeuners 2 jours par semaine : ~80 € par mois d'économisés pour un déjeuner à 10 €.</li>
          <li>🔁 Vérifiez vos abonnements tous les 3 mois et résiliez ceux que vous n'utilisez plus.</li>
        </ul></div>`;
    },
  };

  // ---------- Placements ----------

  const SUPPORTS = [
    { id: 'livret', name: 'Livret A / LDDS', rate: 1.7, risk: 1, liquidity: 'Immédiate', horizon: 'Court terme', note: 'Capital garanti, intérêts non imposés. Plafonds : 22 950 € (A) et 12 000 € (LDDS). Idéal pour l\'épargne de précaution.' },
    { id: 'lep', name: 'LEP', rate: 2.7, risk: 1, liquidity: 'Immédiate', horizon: 'Court terme', note: 'Réservé aux revenus modestes, plafond 10 000 €, non imposé. Le meilleur livret si vous y avez droit.' },
    { id: 'fonds-euros', name: 'Assurance vie — fonds euros', rate: 2.5, risk: 1, liquidity: 'Quelques jours', horizon: '3 ans et +', note: 'Capital garanti par l\'assureur. Fiscalité avantageuse après 8 ans. Attention aux frais de gestion.' },
    { id: 'obligations', name: 'Fonds obligataires', rate: 3.5, risk: 2, liquidity: 'Quelques jours', horizon: '3 à 5 ans', note: 'Prêter aux États et entreprises. Plus stable que les actions, mais pas garanti.' },
    { id: 'scpi', name: 'SCPI (immobilier papier)', rate: 4.5, risk: 3, liquidity: 'Plusieurs mois', horizon: '8 ans et +', note: 'Revenus locatifs sans gérer de bien. Frais d\'entrée élevés (8-10 %), à garder longtemps.' },
    { id: 'etf', name: 'ETF actions monde (PEA / CTO)', rate: 7, risk: 4, liquidity: 'Quelques jours', horizon: '8 ans et +', note: 'Des milliers d\'entreprises en un seul fonds, frais très bas. Fortes variations à court terme : à réserver au long terme.' },
  ];
  const PROFILES = {
    prudent: { name: 'Prudent', icon: '🛡️', alloc: { 'fonds-euros': 60, livret: 25, etf: 15 }, text: 'Priorité à la sécurité du capital, avec une petite part d\'actions pour battre l\'inflation.' },
    equilibre: { name: 'Équilibré', icon: '⚖️', alloc: { 'fonds-euros': 35, etf: 50, obligations: 15 }, text: 'Un mix entre sécurité et croissance pour un horizon de 5 à 10 ans.' },
    dynamique: { name: 'Dynamique', icon: '🚀', alloc: { etf: 80, scpi: 10, 'fonds-euros': 10 }, text: 'Viser la performance sur 10 ans et plus, en acceptant des baisses temporaires importantes.' },
  };
  const supports = () => SUPPORTS.map((s) => ({ ...s, rate: App.S.settings.rates && App.S.settings.rates[s.id] != null ? App.S.settings.rates[s.id] : s.rate }));

  function investDynamic() {
    const v = App.ui.invest;
    const sim = Core.simulateInvestment(v);
    const list = supports();
    const compare = list.map((s) => ({ s, final: Core.simulateInvestment({ ...v, rate: s.rate }).final }));
    const pts = sim.points;
    const series = [
      { name: 'Valeur estimée', color: C_ACCENT, values: pts.map((p) => p.value), area: true },
      { name: 'Total versé', color: 'var(--muted)', values: pts.map((p) => p.contributed), dashed: true },
    ];
    return `
      <div class="kpis three">
        ${kpi(`Capital dans ${v.years} ans`, money(sim.final), `à ${String(v.rate).replace('.', ',')} %/an${v.fees ? ` − ${String(v.fees).replace('.', ',')} % de frais` : ''}`, 'saving', '📈')}
        ${kpi('Total versé', money(sim.contributed), `${money(v.initial)} + ${money(v.monthly)} × ${v.years * 12} mois`, 'remaining', '💶')}
        ${kpi('Intérêts gagnés', signed(sim.gains), sim.contributed ? `+${Math.round(sim.gains / sim.contributed * 100)} % sur vos versements` : '', 'income', '✨')}
      </div>
      <div class="grid-2">
        <div class="card"><div class="card-head"><h3>Effet des intérêts composés</h3></div>${Charts.lines(pts.map((p) => `${p.year} an${p.year > 1 ? 's' : ''}`), series, { height: 240 })}${Charts.legend(series)}</div>
        <div class="card"><div class="card-head"><h3>Comparaison des supports</h3><small class="muted">mêmes versements, ${v.years} ans</small></div>
          <ul class="budget-list">${compare.sort((a, b) => b.final - a.final).map((x) => `<li><div class="budget-line"><span>${esc(x.s.name)}</span><b>${money(x.final)}</b></div>${progress(x.final, compare[0].final, '', C_ACCENT)}<small class="muted">${String(x.s.rate).replace('.', ',')} %/an · risque ${'●'.repeat(x.s.risk)}${'○'.repeat(5 - x.s.risk)}</small></li>`).join('')}</ul>
        </div>
      </div>`;
  }

  App.views.placements = {
    title: 'Placements',
    render() {
      const S = App.S, today = App.today(), v = App.ui.invest;
      const series = Core.monthlySeries(S, 3, Core.addDays(Core.startOfMonth(today), -1)).filter((m) => m.income > 0);
      const avgNet = series.length ? series.reduce((a, m) => a + m.income - m.expense, 0) / series.length : 0;
      const insights = Core.savingsInsights(S, today);
      const prec = insights.precaution;
      const have = S.settings.currentSavings || 0;
      const precOk = prec ? have >= prec.min : false;
      const shortGoals = S.goals.filter((g) => !Core.goalInfo(g, today).done && g.deadline && Core.monthsBetween(today, g.deadline) <= 24);
      const goalsMonthly = shortGoals.reduce((a, g) => a + (Core.goalInfo(g, today).monthly || 0), 0);
      const investable = Math.max(0, avgNet - goalsMonthly);
      const prof = PROFILES[App.ui.profile];
      const list = supports();
      const byId = Object.fromEntries(list.map((s) => [s.id, s]));
      const blended = Object.entries(prof.alloc).reduce((a, [id, p]) => a + byId[id].rate * p / 100, 0);

      return `
        <div class="card disclaimer">⚠️ Informations pédagogiques, pas un conseil en investissement. Les taux affichés sont indicatifs (modifiables dans Réglages) et les performances passées ne préjugent pas des performances futures. Tout placement hors livrets comporte un risque de perte en capital.</div>
        <div class="kpis three">
          ${kpi('Capacité d\'épargne moyenne', signed(avgNet), 'par mois, sur les 3 derniers mois', avgNet >= 0 ? 'income' : 'expense', '💶')}
          ${kpi('Réservé aux projets < 2 ans', money(goalsMonthly), `${shortGoals.length} objectif(s) à court terme`, 'remaining', '🎯')}
          ${kpi('Investissable chaque mois', money(investable), 'après vos projets', 'saving', '📈')}
        </div>
        <div class="card">
          <h3>Dans quel ordre placer son argent ?</h3>
          <ol class="pyramid">
            <li class="${precOk ? 'ok' : 'todo'}"><span class="step">1</span><div><b>Épargne de précaution</b><p>${prec ? `3 à 6 mois de dépenses essentielles, soit ${money(prec.min)} à ${money(prec.max)}, sur un livret disponible à tout moment.` : 'L\'équivalent de 3 à 6 mois de dépenses essentielles sur un livret.'} Vous avez ${money(have)} de côté.</p>
              ${prec ? progress(have, prec.min, precOk ? 'done' : 'warn') : ''}</div><span class="state ${precOk ? 'ok' : 'warn'}">${precOk ? 'OK' : 'À constituer'}</span></li>
            <li class="${shortGoals.length ? 'todo' : 'ok'}"><span class="step">2</span><div><b>Projets à moins de 2 ans</b><p>Voyage, voiture, sorties… L'argent dont vous aurez besoin bientôt reste sur un livret : pas de risque.${shortGoals.length ? ` En cours : ${shortGoals.map((g) => esc(g.name)).join(', ')}.` : ''}</p></div><span class="state ${shortGoals.length ? 'warn' : 'ok'}">${shortGoals.length ? `${money(goalsMonthly)}/mois` : 'Aucun'}</span></li>
            <li><span class="step">3</span><div><b>Long terme (5 ans et +)</b><p>Retraite, achat immobilier, liberté financière : c'est là que l'assurance vie et les ETF actions font la différence grâce aux intérêts composés.</p></div><span class="state">${money(investable)}/mois</span></li>
          </ol>
        </div>
        <div class="card">
          <div class="card-head"><h3>Quel profil d'investisseur ?</h3></div>
          <div class="segmented profiles">${Object.entries(PROFILES).map(([k, p]) => `<label><input type="radio" name="profile" value="${k}" data-change="profile" ${App.ui.profile === k ? 'checked' : ''}><span>${p.icon} ${p.name}</span></label>`).join('')}</div>
          <p class="muted">${prof.text} Rendement moyen estimé : <b>${blended.toFixed(1).replace('.', ',')} %/an</b>.</p>
          <ul class="alloc">${Object.entries(prof.alloc).map(([id, p]) => `<li><div class="budget-line"><span>${esc(byId[id].name)}</span><b>${p} %</b>${investable ? `<small class="muted">${money(investable * p / 100)}/mois</small>` : ''}</div>${progress(p, 100, '', C_ACCENT)}</li>`).join('')}</ul>
          <button class="btn small" data-action="use-profile" data-rate="${blended.toFixed(2)}" data-monthly="${Math.round(investable)}">Simuler ce profil ↓</button>
        </div>
        <div class="card" id="simulator">
          <h3>Simulateur d'intérêts composés</h3>
          <div class="sim-grid">
            <label class="field"><span>Mise de départ : <b id="iv-initial">${money(v.initial)}</b></span><input type="range" min="0" max="50000" step="500" value="${v.initial}" data-input="iv" data-k="initial"></label>
            <label class="field"><span>Versement mensuel : <b id="iv-monthly">${money(v.monthly)}</b></span><input type="range" min="0" max="2000" step="10" value="${v.monthly}" data-input="iv" data-k="monthly"></label>
            <label class="field"><span>Durée : <b id="iv-years">${v.years} ans</b></span><input type="range" min="1" max="40" step="1" value="${v.years}" data-input="iv" data-k="years"></label>
            <label class="field"><span>Rendement annuel : <b id="iv-rate">${String(v.rate).replace('.', ',')} %</b></span><input type="range" min="0" max="12" step="0.1" value="${v.rate}" data-input="iv" data-k="rate"></label>
            <label class="field"><span>Frais annuels : <b id="iv-fees">${String(v.fees).replace('.', ',')} %</b></span><input type="range" min="0" max="3" step="0.1" value="${v.fees}" data-input="iv" data-k="fees"></label>
            <label class="field"><span>Taux d'un support</span><select data-change="iv-support">${list.map((s) => `<option value="${s.id}" ${v.support === s.id ? 'selected' : ''}>${esc(s.name)} (${String(s.rate).replace('.', ',')} %)</option>`).join('')}<option value="custom" ${v.support === 'custom' ? 'selected' : ''}>Personnalisé</option></select></label>
          </div>
        </div>
        <div id="inv-dynamic">${investDynamic()}</div>
        <div class="card">
          <h3>Les principaux supports</h3>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Support</th><th>Taux indicatif</th><th>Risque</th><th>Disponibilité</th><th>Horizon</th><th>À savoir</th></tr></thead>
            <tbody>${list.map((s) => `<tr><td><b>${esc(s.name)}</b></td><td>${String(s.rate).replace('.', ',')} %</td><td class="risk">${'●'.repeat(s.risk)}${'○'.repeat(5 - s.risk)}</td><td>${s.liquidity}</td><td>${s.horizon}</td><td class="note">${esc(s.note)}</td></tr>`).join('')}</tbody>
          </table></div>
        </div>`;
    },
  };
  const IV_FMT = { initial: (x) => money(x), monthly: (x) => money(x), years: (x) => `${x} ans`, rate: (x) => `${String(x).replace('.', ',')} %`, fees: (x) => `${String(x).replace('.', ',')} %` };
  App.actions['iv'] = (el) => {
    const k = el.dataset.k;
    App.ui.invest[k] = Number(el.value);
    if (k === 'rate') { App.ui.invest.support = 'custom'; const s = document.querySelector('[data-change=iv-support]'); if (s) s.value = 'custom'; }
    document.getElementById(`iv-${k}`).textContent = IV_FMT[k](App.ui.invest[k]);
    document.getElementById('inv-dynamic').innerHTML = investDynamic();
  };
  App.actions['iv-support'] = (el) => {
    App.ui.invest.support = el.value;
    const s = supports().find((x) => x.id === el.value);
    if (s) App.ui.invest.rate = s.rate;
    App.render();
  };
  App.actions['profile'] = (el) => { App.ui.profile = el.value; App.render(); };
  App.actions['use-profile'] = (el) => {
    App.ui.invest.rate = Math.round(Number(el.dataset.rate) * 10) / 10;
    App.ui.invest.support = 'custom';
    if (Number(el.dataset.monthly) > 0) App.ui.invest.monthly = Math.min(2000, Number(el.dataset.monthly));
    App.render();
    document.getElementById('simulator').scrollIntoView({ behavior: 'smooth' });
  };

  // ---------- Réglages ----------

  App.views.reglages = {
    title: 'Réglages',
    render() {
      const S = App.S;
      const catList = (type) => `<ul class="cat-manage">${App.catsOf(type).map((c) => `<li><button class="chip" data-action="edit-category" data-id="${c.id}">${c.icon} ${esc(c.name)}${c.group ? ` <small>${{ besoin: 'besoin', envie: 'envie', epargne: 'épargne' }[c.group]}</small>` : ''}</button></li>`).join('')}
        <li><button class="chip add" data-action="new-category" data-type="${type}">+ Ajouter</button></li></ul>`;
      return `
        <div class="grid-2">
          <div class="card">
            <h3>Profil</h3>
            <label class="field"><span>Prénom</span><input data-change="set-name" value="${esc(S.settings.name)}" maxlength="30" placeholder="Optionnel"></label>
            <label class="field"><span>Épargne déjà disponible (livrets, etc.)</span><input inputmode="decimal" data-change="set-savings" value="${String(S.settings.currentSavings || 0).replace('.', ',')}"></label>
            <p class="hint">Sert de point de départ aux prévisions et au calcul de l'épargne de précaution.</p>
          </div>
          <div class="card">
            <h3>Apparence</h3>
            <div class="segmented">${[['auto', '🖥️ Automatique'], ['light', '☀️ Clair'], ['dark', '🌙 Sombre']].map(([v, l]) => `<label><input type="radio" name="theme" value="${v}" data-change="set-theme" ${S.settings.theme === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
            <h3 class="mt">Taux indicatifs des placements</h3>
            <div class="rates">${supports().map((s) => `<label class="field inline"><span>${esc(s.name)}</span><input inputmode="decimal" data-change="set-rate" data-id="${s.id}" value="${String(s.rate).replace('.', ',')}"><em>%</em></label>`).join('')}</div>
          </div>
        </div>
        <div class="card"><h3>Catégories de dépenses</h3><p class="muted">La nature (besoin / envie / épargne) sert à l'analyse 50/30/20.</p>${catList('expense')}</div>
        <div class="card"><h3>Catégories de revenus</h3>${catList('income')}</div>
        <div class="card">
          <h3>Mes données</h3>
          <p class="muted">Tout est enregistré uniquement dans ce navigateur. Pensez à exporter une sauvegarde de temps en temps, ou pour passer sur un autre appareil.</p>
          <div class="row-btns">
            <button class="btn" data-action="export-json">⬇ Exporter une sauvegarde</button>
            <label class="btn">⬆ Importer une sauvegarde<input type="file" accept="application/json,.json" data-change="import-json" hidden></label>
            <button class="btn" data-action="export-csv">⬇ Exporter les opérations (CSV)</button>
            <button class="btn ghost" data-action="load-demo">🧪 Données d'exemple</button>
            <button class="btn ghost danger" data-action="reset">🗑 Tout effacer</button>
          </div>
          <p class="hint">${S.transactions.length} opérations · ${S.recurring.length} récurrentes · ${S.goals.length} objectifs · ${S.planned.length} prévisions</p>
        </div>`;
    },
  };
  App.actions['set-name'] = (el) => App.commit((s) => { s.settings.name = el.value.trim(); }, 'Profil enregistré');
  App.actions['set-savings'] = (el) => { const v = parseAmount(el.value); App.commit((s) => { s.settings.currentSavings = v > 0 ? v : 0; }, 'Épargne enregistrée'); };
  App.actions['set-theme'] = (el) => { App.S.settings.theme = el.value; Store.save(App.S); App.applyTheme(); };
  App.actions['set-rate'] = (el) => {
    const v = parseAmount(el.value);
    if (!(v >= 0)) return UI.toast('Taux invalide', 'warn');
    App.commit((s) => { s.settings.rates = { ...(s.settings.rates || {}), [el.dataset.id]: v }; }, 'Taux enregistré');
  };
  App.actions['new-category'] = (el) => { App.categoryForm(null); const r = document.querySelector(`#modal-form [name=type][value=${el.dataset.type}]`); if (r) { r.checked = true; r.dispatchEvent(new Event('change')); } };
  App.actions['edit-category'] = (el) => App.categoryForm(App.S.categories.find((c) => c.id === el.dataset.id));
  App.actions['export-json'] = () => App.exportJSON();
  App.actions['import-json'] = (el) => { if (el.files[0]) App.importJSON(el.files[0]); el.value = ''; };
  App.actions['reset'] = () => UI.confirmBox('Tout effacer ?', 'Toutes vos opérations, budgets et objectifs seront supprimés de cet appareil. Cette action est irréversible — exportez une sauvegarde avant si besoin.', () => {
    Store.clear();
    location.hash = '#/tableau';
    location.reload();
  }, 'Tout effacer');
})(window);
