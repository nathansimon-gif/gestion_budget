/* Pécule — état de l'application, routage, actions et formulaires. */
(function (root) {
  'use strict';
  const { Core, Store, UI } = root;
  const { esc, money, toast, modal, fieldError, parseAmount } = UI;

  const App = {
    S: null,
    views: {},
    actions: {},
    ui: {
      period: 'month',
      offset: 0,
      tx: { q: '', type: 'all', cat: 'all', tab: 'list' },
      scenario: { cutVariablePct: 0, incomeChangePct: 0, horizon: 12 },
      invest: { initial: 1000, monthly: 200, years: 15, rate: 7, fees: 0.3, support: 'etf' },
      profile: 'equilibre',
    },
  };

  App.today = () => Core.todayISO();
  App.cats = () => Core.categoryMap(App.S);
  App.catsOf = (type) => App.S.categories.filter((c) => c.type === type);

  // ---------- Persistance & rendu ----------

  function alertKeys() {
    return new Set(Core.computeAlerts(App.S, App.today()).map((a) => a.key));
  }

  /** Applique une modification, sauvegarde, re-rend et signale les nouvelles alertes. */
  App.commit = function (mutate, message) {
    const before = alertKeys();
    mutate(App.S);
    Store.save(App.S);
    App.render();
    if (message) toast(message, 'good');
    const fresh = Core.computeAlerts(App.S, App.today()).filter((a) => !before.has(a.key) && !App.S.dismissedAlerts.includes(a.key));
    fresh.forEach((a, i) => setTimeout(() => toast(`<b>${a.icon} ${esc(a.title)}</b><br>${esc(a.text)}`, a.level), 250 * (i + 1)));
  };

  const SEVERITY = { over: 0, warn: 1 };
  App.activeAlerts = () => Core.computeAlerts(App.S, App.today())
    .filter((a) => !App.S.dismissedAlerts.includes(a.key))
    .sort((a, b) => SEVERITY[a.level] - SEVERITY[b.level]);

  App.route = () => (location.hash.replace(/^#\/?/, '') || 'tableau').split('?')[0];

  App.render = function () {
    const name = App.views[App.route()] ? App.route() : 'tableau';
    const view = App.views[name];
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
    document.getElementById('page-title').textContent = view.title;
    document.title = `${view.title} · Pécule`;
    const container = document.getElementById('view');
    container.innerHTML = view.render();
    if (view.after) view.after(container);
    const n = App.activeAlerts().length;
    const badge = document.getElementById('alert-badge');
    badge.textContent = n;
    badge.hidden = n === 0;
  };

  // ---------- Thème ----------

  App.applyTheme = function () {
    const t = App.S.settings.theme;
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  };

  // ---------- Champs de formulaire réutilisables ----------

  App.categoryOptions = function (type, selected) {
    return App.catsOf(type).map((c) => `<option value="${esc(c.id)}" ${c.id === selected ? 'selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('');
  };

  function typeToggle(name, value) {
    return `<div class="segmented" role="radiogroup">
      <label><input type="radio" name="${name}" value="expense" ${value !== 'income' ? 'checked' : ''}><span>Dépense</span></label>
      <label><input type="radio" name="${name}" value="income" ${value === 'income' ? 'checked' : ''}><span>Revenu</span></label>
    </div>`;
  }

  function bindTypeToggle(form, selected) {
    const sel = form.querySelector('[name=categoryId]');
    form.querySelectorAll('[name=type]').forEach((r) => r.addEventListener('change', () => {
      sel.innerHTML = App.categoryOptions(r.value, selected);
    }));
  }

  // ---------- Transactions ----------

  App.transactionForm = function (tx, preset) {
    const editing = !!tx;
    tx = tx || { type: 'expense', amount: '', label: '', categoryId: 'courses', date: App.today(), ...(preset || {}) };
    const body = `
      ${typeToggle('type', tx.type)}
      <div class="grid2">
        <label class="field"><span>Montant (€)</span><input name="amount" inputmode="decimal" placeholder="0,00" value="${tx.amount !== '' ? String(tx.amount).replace('.', ',') : ''}" autofocus></label>
        <label class="field"><span>Date</span><input type="date" name="date" value="${esc(tx.date)}"></label>
      </div>
      <label class="field"><span>Libellé</span><input name="label" placeholder="Ex. : courses, resto avec Léa…" value="${esc(tx.label)}" maxlength="80"></label>
      <label class="field"><span>Catégorie</span><select name="categoryId">${App.categoryOptions(tx.type, tx.categoryId)}</select></label>
      ${editing ? (tx.recurringId ? '<p class="hint">Cette opération provient d\'une opération récurrente : seule cette occurrence sera modifiée.</p>' : '') : `
      <label class="field"><span>Répéter</span>
        <select name="frequency">
          <option value="">Non, opération ponctuelle</option>
          <option value="weekly">Chaque semaine</option>
          <option value="monthly">Chaque mois</option>
          <option value="yearly">Chaque année</option>
        </select>
      </label>`}`;
    modal(editing ? 'Modifier l\'opération' : 'Nouvelle opération', body, {
      submit: editing ? 'Enregistrer' : 'Ajouter',
      danger: editing ? 'Supprimer' : null,
      onOpen: (form) => bindTypeToggle(form, tx.categoryId),
      onDanger: () => { App.commit((s) => { s.transactions = s.transactions.filter((t) => t.id !== tx.id); }, 'Opération supprimée'); },
      onSubmit: (d, form) => {
        const amount = parseAmount(d.amount);
        if (!(amount > 0)) return fieldError(form, 'amount', 'Indiquez un montant positif.');
        if (!d.date) return fieldError(form, 'date', 'Choisissez une date.');
        const cat = App.cats()[d.categoryId];
        const label = d.label.trim() || (cat ? cat.name : 'Opération');
        App.commit((s) => {
          if (editing) {
            Object.assign(s.transactions.find((t) => t.id === tx.id), { type: d.type, amount, label, categoryId: d.categoryId, date: d.date });
          } else if (d.frequency) {
            const rec = { id: Store.uid(), type: d.type, amount, label, categoryId: d.categoryId, frequency: d.frequency, startDate: d.date, dayOfMonth: Core.parseISO(d.date).getDate(), active: true };
            s.recurring.push(rec);
            Core.materializeRecurring(s, App.today(), Store.uid);
          } else {
            s.transactions.push({ id: Store.uid(), type: d.type, amount, label, categoryId: d.categoryId, date: d.date });
          }
        }, editing ? 'Opération modifiée' : d.frequency ? 'Opération récurrente créée' : 'Opération ajoutée');
      },
    });
  };

  App.recurringForm = function (rec) {
    const editing = !!rec;
    rec = rec || { type: 'expense', amount: '', label: '', categoryId: 'logement', frequency: 'monthly', startDate: App.today(), active: true };
    const body = `
      ${typeToggle('type', rec.type)}
      <div class="grid2">
        <label class="field"><span>Montant (€)</span><input name="amount" inputmode="decimal" value="${rec.amount !== '' ? String(rec.amount).replace('.', ',') : ''}" autofocus></label>
        <label class="field"><span>Fréquence</span><select name="frequency">
          ${[['weekly', 'Chaque semaine'], ['monthly', 'Chaque mois'], ['yearly', 'Chaque année']].map(([v, l]) => `<option value="${v}" ${rec.frequency === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></label>
      </div>
      <label class="field"><span>Libellé</span><input name="label" value="${esc(rec.label)}" placeholder="Ex. : loyer, salaire, Netflix…" maxlength="80"></label>
      <label class="field"><span>Catégorie</span><select name="categoryId">${App.categoryOptions(rec.type, rec.categoryId)}</select></label>
      <div class="grid2">
        <label class="field"><span>Première échéance</span><input type="date" name="startDate" value="${esc(rec.startDate)}"></label>
        <label class="field"><span>Fin (optionnel)</span><input type="date" name="endDate" value="${esc(rec.endDate || '')}"></label>
      </div>
      <label class="check"><input type="checkbox" name="active" ${rec.active !== false ? 'checked' : ''}> Active</label>`;
    modal(editing ? 'Modifier l\'opération récurrente' : 'Nouvelle opération récurrente', body, {
      danger: editing ? 'Supprimer' : null,
      onOpen: (form) => bindTypeToggle(form, rec.categoryId),
      onDanger: () => {
        App.commit((s) => { s.recurring = s.recurring.filter((r) => r.id !== rec.id); }, 'Opération récurrente supprimée (l\'historique est conservé)');
      },
      onSubmit: (d, form) => {
        const amount = parseAmount(d.amount);
        if (!(amount > 0)) return fieldError(form, 'amount', 'Indiquez un montant positif.');
        if (!d.startDate) return fieldError(form, 'startDate', 'Choisissez une date.');
        if (d.endDate && d.endDate < d.startDate) return fieldError(form, 'endDate', 'La fin doit être après le début.');
        const patch = {
          type: d.type, amount, label: d.label.trim() || App.cats()[d.categoryId].name, categoryId: d.categoryId, frequency: d.frequency,
          startDate: d.startDate, endDate: d.endDate || null, dayOfMonth: Core.parseISO(d.startDate).getDate(), active: d.active === 'on',
        };
        App.commit((s) => {
          if (editing) {
            const r = s.recurring.find((x) => x.id === rec.id);
            // Si la date de départ change, on régénère les occurrences à partir de la nouvelle date
            if (r.startDate !== patch.startDate || r.frequency !== patch.frequency) r.generatedUntil = null;
            Object.assign(r, patch);
          } else {
            s.recurring.push({ id: Store.uid(), ...patch });
          }
          Core.materializeRecurring(s, App.today(), Store.uid);
        }, editing ? 'Opération récurrente modifiée' : 'Opération récurrente créée');
      },
    });
  };

  // ---------- Objectifs ----------

  const GOAL_ICONS = ['✈️', '🏖️', '🗾', '🍽️', '🎉', '🚗', '🚲', '🏠', '💍', '🎓', '💻', '🎁', '🛟', '👶', '🐶', '🎸'];
  const GOAL_COLORS = ['#10b981', '#0ea5e9', '#6366f1', '#a855f7', '#ec4899', '#ef4444', '#f59e0b', '#14b8a6'];

  App.goalForm = function (goal) {
    const editing = !!goal;
    goal = goal || { name: '', icon: '✈️', color: GOAL_COLORS[App.S.goals.length % GOAL_COLORS.length], target: '', saved: 0, deadline: Core.addMonths(App.today(), 6) };
    const body = `
      <label class="field"><span>Nom de l'objectif</span><input name="name" value="${esc(goal.name)}" placeholder="Ex. : voyage à Lisbonne, sorties du mois…" maxlength="60" autofocus></label>
      <div class="field"><span>Icône</span><div class="icon-picker">
        ${GOAL_ICONS.map((i) => `<label><input type="radio" name="icon" value="${i}" ${goal.icon === i ? 'checked' : ''}><span>${i}</span></label>`).join('')}
      </div></div>
      <div class="field"><span>Couleur</span><div class="color-picker">
        ${GOAL_COLORS.map((c) => `<label><input type="radio" name="color" value="${c}" ${goal.color === c ? 'checked' : ''}><span style="background:${c}"></span></label>`).join('')}
      </div></div>
      <div class="grid2">
        <label class="field"><span>Montant visé (€)</span><input name="target" inputmode="decimal" value="${goal.target !== '' ? String(goal.target).replace('.', ',') : ''}"></label>
        <label class="field"><span>Déjà mis de côté (€)</span><input name="saved" inputmode="decimal" value="${String(goal.saved).replace('.', ',')}"></label>
      </div>
      <label class="field"><span>Échéance (optionnel)</span><input type="date" name="deadline" value="${esc(goal.deadline || '')}"></label>
      <p class="hint" id="goal-hint"></p>`;
    modal(editing ? 'Modifier l\'objectif' : 'Nouvel objectif d\'épargne', body, {
      danger: editing ? 'Supprimer' : null,
      onDanger: () => App.commit((s) => { s.goals = s.goals.filter((g) => g.id !== goal.id); }, 'Objectif supprimé'),
      onOpen: (form) => {
        const upd = () => {
          const t = parseAmount(form.target.value), sv = parseAmount(form.saved.value) || 0;
          const hint = form.querySelector('#goal-hint');
          if (t > 0 && form.deadline.value) {
            const info = Core.goalInfo({ target: t, saved: sv, deadline: form.deadline.value }, App.today());
            hint.textContent = info.done ? 'Objectif déjà atteint 🎉' : `Il faudra mettre de côté environ ${money(info.monthly)} par mois${info.monthsLeft ? ` pendant ${info.monthsLeft} mois` : ''}.`;
          } else hint.textContent = '';
        };
        form.addEventListener('input', upd);
        upd();
      },
      onSubmit: (d, form) => {
        if (!d.name.trim()) return fieldError(form, 'name', 'Donnez un nom à votre objectif.');
        const target = parseAmount(d.target);
        if (!(target > 0)) return fieldError(form, 'target', 'Indiquez le montant visé.');
        const saved = parseAmount(d.saved) || 0;
        const patch = { name: d.name.trim(), icon: d.icon || '🎯', color: d.color || GOAL_COLORS[0], target, saved: Math.max(0, saved), deadline: d.deadline || null };
        App.commit((s) => {
          if (editing) Object.assign(s.goals.find((g) => g.id === goal.id), patch);
          else s.goals.push({ id: Store.uid(), createdAt: App.today(), ...patch });
        }, editing ? 'Objectif modifié' : 'Objectif créé 🎯');
      },
    });
  };

  App.contributionForm = function (goal, withdraw) {
    const info = Core.goalInfo(goal, App.today());
    const suggested = withdraw ? '' : info.monthly ? Math.ceil(info.monthly) : '';
    const body = `
      <p class="muted">${goal.icon} <b>${esc(goal.name)}</b> — ${money(goal.saved)} / ${money(goal.target)}</p>
      <label class="field"><span>Montant (€)</span><input name="amount" inputmode="decimal" value="${suggested}" autofocus></label>
      ${withdraw ? '' : `<label class="check"><input type="checkbox" name="record" checked> Enregistrer comme virement vers l'épargne dans mes opérations</label>`}`;
    modal(withdraw ? 'Retirer de l\'objectif' : 'Mettre de l\'argent de côté', body, {
      submit: withdraw ? 'Retirer' : 'Ajouter',
      onSubmit: (d, form) => {
        const amount = parseAmount(d.amount);
        if (!(amount > 0)) return fieldError(form, 'amount', 'Indiquez un montant positif.');
        if (withdraw && amount > goal.saved) return fieldError(form, 'amount', `Maximum ${money(goal.saved, true)}.`);
        const wasDone = info.done;
        App.commit((s) => {
          const g = s.goals.find((x) => x.id === goal.id);
          g.saved = Math.round((g.saved + (withdraw ? -amount : amount)) * 100) / 100;
          if (!withdraw && d.record === 'on') {
            s.transactions.push({ id: Store.uid(), type: 'expense', amount, categoryId: 'epargne', label: `Épargne : ${g.name}`, date: App.today(), goalId: g.id });
          }
        }, withdraw ? 'Montant retiré' : 'Bien joué, c\'est mis de côté 💪');
        const after = App.S.goals.find((x) => x.id === goal.id);
        if (!wasDone && after && Core.goalInfo(after, App.today()).done) setTimeout(() => toast(`🎉 <b>Objectif « ${esc(after.name)} » atteint !</b>`, 'good'), 400);
      },
    });
  };

  // ---------- Prévisions ponctuelles ----------

  App.plannedForm = function (p) {
    const editing = !!p;
    p = p || { type: 'expense', label: '', amount: '', date: Core.addMonths(App.today(), 1), categoryId: 'voyages' };
    const body = `
      <p class="hint">Une dépense ou rentrée exceptionnelle à venir (vacances, prime, impôts, réparation…). Elle sera prise en compte dans les prévisions.</p>
      ${typeToggle('type', p.type)}
      <div class="grid2">
        <label class="field"><span>Montant (€)</span><input name="amount" inputmode="decimal" value="${p.amount !== '' ? String(p.amount).replace('.', ',') : ''}" autofocus></label>
        <label class="field"><span>Date prévue</span><input type="date" name="date" value="${esc(p.date)}"></label>
      </div>
      <label class="field"><span>Libellé</span><input name="label" value="${esc(p.label)}" placeholder="Ex. : vacances d'été, taxe foncière…" maxlength="80"></label>
      <label class="field"><span>Catégorie</span><select name="categoryId">${App.categoryOptions(p.type, p.categoryId)}</select></label>`;
    modal(editing ? 'Modifier la prévision' : 'Nouvelle prévision', body, {
      danger: editing ? 'Supprimer' : null,
      onOpen: (form) => bindTypeToggle(form, p.categoryId),
      onDanger: () => App.commit((s) => { s.planned = s.planned.filter((x) => x.id !== p.id); }, 'Prévision supprimée'),
      onSubmit: (d, form) => {
        const amount = parseAmount(d.amount);
        if (!(amount > 0)) return fieldError(form, 'amount', 'Indiquez un montant positif.');
        if (!d.date) return fieldError(form, 'date', 'Choisissez une date.');
        const patch = { type: d.type, amount, date: d.date, label: d.label.trim() || App.cats()[d.categoryId].name, categoryId: d.categoryId };
        App.commit((s) => {
          if (editing) Object.assign(s.planned.find((x) => x.id === p.id), patch);
          else s.planned.push({ id: Store.uid(), ...patch });
        }, editing ? 'Prévision modifiée' : 'Prévision ajoutée');
      },
    });
  };

  // ---------- Catégories & budgets ----------

  App.budgetForm = function (cat) {
    const body = `
      <p class="muted">${cat.icon} <b>${esc(cat.name)}</b></p>
      <label class="field"><span>Budget mensuel (€) — laissez vide pour aucun</span><input name="budget" inputmode="decimal" value="${cat.budget ? String(cat.budget).replace('.', ',') : ''}" autofocus></label>
      <label class="field"><span>Me prévenir à partir de… <b id="th-val">${cat.alertAt || App.S.settings.alertThreshold} %</b></span>
        <input type="range" name="alertAt" min="50" max="100" step="5" value="${cat.alertAt || App.S.settings.alertThreshold}">
      </label>
      <p class="hint">Vous recevrez une alerte quand ce pourcentage du budget est atteint, puis une autre en cas de dépassement.</p>`;
    modal('Budget & seuil d\'alerte', body, {
      onOpen: (form) => form.alertAt.addEventListener('input', () => { form.querySelector('#th-val').textContent = `${form.alertAt.value} %`; }),
      onSubmit: (d) => {
        const budget = parseAmount(d.budget);
        App.commit((s) => {
          const c = s.categories.find((x) => x.id === cat.id);
          c.budget = budget > 0 ? budget : 0;
          c.alertAt = Number(d.alertAt) === s.settings.alertThreshold ? null : Number(d.alertAt);
        }, 'Budget enregistré');
      },
    });
  };

  const CAT_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#64748b'];

  App.categoryForm = function (cat) {
    const editing = !!cat;
    cat = cat || { name: '', icon: '🏷️', type: 'expense', group: 'envie', color: CAT_COLORS[App.S.categories.length % CAT_COLORS.length] };
    const used = editing && (App.S.transactions.some((t) => t.categoryId === cat.id) || App.S.recurring.some((r) => r.categoryId === cat.id));
    const body = `
      <div class="grid2">
        <label class="field"><span>Nom</span><input name="name" value="${esc(cat.name)}" maxlength="40" autofocus></label>
        <label class="field"><span>Emoji</span><input name="icon" value="${esc(cat.icon)}" maxlength="4"></label>
      </div>
      ${editing ? `<input type="hidden" name="type" value="${cat.type}">` : typeToggle('type', cat.type)}
      <label class="field" data-group><span>Nature de la dépense</span><select name="group">
        <option value="besoin" ${cat.group === 'besoin' ? 'selected' : ''}>Besoin essentiel (loyer, courses…)</option>
        <option value="envie" ${cat.group === 'envie' ? 'selected' : ''}>Envie / plaisir (sorties, shopping…)</option>
        <option value="epargne" ${cat.group === 'epargne' ? 'selected' : ''}>Épargne / investissement</option>
      </select></label>
      <div class="field"><span>Couleur</span><div class="color-picker">
        ${CAT_COLORS.map((c) => `<label><input type="radio" name="color" value="${c}" ${cat.color === c ? 'checked' : ''}><span style="background:${c}"></span></label>`).join('')}
      </div></div>
      ${used ? '<p class="hint">Cette catégorie est utilisée : en la supprimant, ses opérations seront déplacées dans « Divers » / « Autres revenus ».</p>' : ''}`;
    modal(editing ? 'Modifier la catégorie' : 'Nouvelle catégorie', body, {
      danger: editing && !['epargne', 'divers', 'autres-revenus'].includes(cat.id) ? 'Supprimer' : null,
      onOpen: (form) => {
        const g = form.querySelector('[data-group]');
        const sync = () => { const t = form.querySelector('[name=type]:checked') || form.querySelector('[name=type]'); g.hidden = t.value === 'income'; };
        form.querySelectorAll('[name=type]').forEach((r) => r.addEventListener('change', sync));
        sync();
      },
      onDanger: () => App.commit((s) => {
        const fallback = cat.type === 'income' ? 'autres-revenus' : 'divers';
        for (const t of s.transactions) if (t.categoryId === cat.id) t.categoryId = fallback;
        for (const r of s.recurring) if (r.categoryId === cat.id) r.categoryId = fallback;
        for (const p of s.planned) if (p.categoryId === cat.id) p.categoryId = fallback;
        s.categories = s.categories.filter((c) => c.id !== cat.id);
      }, 'Catégorie supprimée'),
      onSubmit: (d, form) => {
        if (!d.name.trim()) return fieldError(form, 'name', 'Donnez un nom.');
        const patch = { name: d.name.trim(), icon: d.icon.trim() || '🏷️', color: d.color || cat.color, type: d.type, group: d.type === 'income' ? undefined : d.group };
        App.commit((s) => {
          if (editing) Object.assign(s.categories.find((c) => c.id === cat.id), patch);
          else s.categories.push({ id: Store.uid(), budget: 0, ...patch });
        }, editing ? 'Catégorie modifiée' : 'Catégorie créée');
      },
    });
  };

  // ---------- Alertes ----------

  App.showAlerts = function () {
    const alerts = Core.computeAlerts(App.S, App.today());
    const body = alerts.length ? `<ul class="alert-list">${alerts.map((a) => {
      const dismissed = App.S.dismissedAlerts.includes(a.key);
      return `<li class="alert ${a.level} ${dismissed ? 'dismissed' : ''}"><span class="alert-icon">${a.icon}</span><div><b>${esc(a.title)}</b><p>${esc(a.text)}</p></div>
        ${dismissed ? '<small class="muted">Vue</small>' : `<button type="button" class="btn small ghost" data-action="dismiss-alert" data-key="${esc(a.key)}">Marquer comme vue</button>`}</li>`;
    }).join('')}</ul>` : '<div class="empty"><div class="empty-icon">✅</div><p>Aucune alerte : tout est sous contrôle.</p></div>';
    modal('Alertes', body + '<p class="hint">Les seuils se règlent dans l\'onglet <a href="#/budgets" data-close>Budgets</a>.</p>', { noFooter: true, noFocus: true });
  };

  App.actions['dismiss-alert'] = (el) => {
    App.S.dismissedAlerts.push(el.dataset.key);
    // On garde la liste raisonnable
    App.S.dismissedAlerts = App.S.dismissedAlerts.slice(-200);
    Store.save(App.S);
    App.render();
    App.showAlerts();
  };

  // ---------- Import / export ----------

  App.exportJSON = () => UI.download(`pecule-sauvegarde-${App.today()}.json`, JSON.stringify(App.S, null, 2), 'application/json');

  App.exportCSV = function () {
    const cats = App.cats();
    const rows = [['Date', 'Type', 'Catégorie', 'Libellé', 'Montant']];
    [...App.S.transactions].sort((a, b) => a.date.localeCompare(b.date)).forEach((t) => {
      rows.push([t.date, t.type === 'income' ? 'Revenu' : 'Dépense', cats[t.categoryId] ? cats[t.categoryId].name : '', t.label, (t.type === 'income' ? t.amount : -t.amount).toFixed(2).replace('.', ',')]);
    });
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    UI.download(`pecule-operations-${App.today()}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
  };

  App.importJSON = function (file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.transactions) || !Array.isArray(data.categories)) throw new Error('format');
        UI.confirmBox('Importer cette sauvegarde ?', `Elle contient ${data.transactions.length} opérations. Vos données actuelles seront remplacées.`, () => {
          App.S = Store.migrate(data);
          Core.materializeRecurring(App.S, App.today(), Store.uid);
          Store.save(App.S);
          App.applyTheme();
          App.render();
          toast('Sauvegarde importée', 'good');
        }, 'Importer');
      } catch (e) {
        toast('Ce fichier n\'est pas une sauvegarde Pécule valide.', 'over');
      }
    };
    reader.readAsText(file);
  };

  // ---------- Démarrage ----------

  function welcome() {
    modal('Bienvenue sur Pécule 👋', `
      <p>Pécule vous aide à suivre vos <b>revenus</b> et <b>dépenses</b>, à voir ce qu'il vous <b>reste à épargner</b>, à fixer des <b>budgets avec alertes</b>, à financer vos <b>projets</b> et à anticiper les mois à venir.</p>
      <p class="muted">Vos données restent sur cet appareil (stockage local du navigateur). Rien n'est envoyé sur Internet.</p>
      <div class="choice-grid">
        <button type="button" class="choice" data-start="demo"><span>🧪</span><b>Explorer avec des données d'exemple</b><small>Idéal pour découvrir toutes les fonctionnalités</small></button>
        <button type="button" class="choice" data-start="empty"><span>✨</span><b>Commencer avec mon budget</b><small>Vous saisirez vos propres opérations</small></button>
      </div>`, {
      noFooter: true,
      noFocus: true,
      onOpen: (form) => form.querySelectorAll('[data-start]').forEach((b) => b.addEventListener('click', () => {
        App.S = b.dataset.start === 'demo' ? Store.demoState(App.today()) : Store.emptyState();
        Store.save(App.S);
        UI.close();
        App.render();
        if (b.dataset.start === 'empty') setTimeout(startWizard, 200);
      })),
    });
  }

  function startWizard() {
    modal('Vos bases mensuelles', `
      <p class="muted">Trois infos pour démarrer — vous pourrez tout modifier ensuite.</p>
      <label class="field"><span>Votre prénom (optionnel)</span><input name="name" maxlength="30"></label>
      <div class="grid2">
        <label class="field"><span>Revenu net mensuel (€)</span><input name="salary" inputmode="decimal" placeholder="Ex. : 2 000"></label>
        <label class="field"><span>Jour de versement</span><input name="salaryDay" type="number" min="1" max="31" value="1"></label>
      </div>
      <div class="grid2">
        <label class="field"><span>Loyer / crédit (€)</span><input name="rent" inputmode="decimal" placeholder="Ex. : 650"></label>
        <label class="field"><span>Épargne déjà disponible (€)</span><input name="savings" inputmode="decimal" placeholder="Ex. : 1 500"></label>
      </div>`, {
      submit: 'C\'est parti',
      cancel: 'Plus tard',
      onSubmit: (d) => {
        App.commit((s) => {
          s.settings.name = d.name.trim();
          s.settings.currentSavings = parseAmount(d.savings) || 0;
          const day = Math.min(31, Math.max(1, parseInt(d.salaryDay, 10) || 1));
          const firstDate = (dd) => {
            const t = App.today();
            const p = Core.parseISO(t);
            const iso = Core.toISO(new Date(p.getFullYear(), p.getMonth(), Math.min(dd, Core.daysInMonth(p.getFullYear(), p.getMonth()))));
            return iso;
          };
          const salary = parseAmount(d.salary);
          if (salary > 0) s.recurring.push({ id: Store.uid(), type: 'income', amount: salary, label: 'Salaire', categoryId: 'salaire', frequency: 'monthly', startDate: firstDate(day), dayOfMonth: day, active: true });
          const rent = parseAmount(d.rent);
          if (rent > 0) s.recurring.push({ id: Store.uid(), type: 'expense', amount: rent, label: 'Loyer', categoryId: 'logement', frequency: 'monthly', startDate: firstDate(5), dayOfMonth: 5, active: true });
          Core.materializeRecurring(s, App.today(), Store.uid);
        }, 'Tout est prêt ! Ajoutez vos dépenses avec le bouton « + »');
      },
    });
  }

  App.init = function () {
    App.S = Store.load();
    if (App.S) {
      Core.materializeRecurring(App.S, App.today(), Store.uid);
      Store.save(App.S);
    } else {
      App.S = Store.emptyState();
    }
    App.applyTheme();

    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const fn = App.actions[el.dataset.action];
      if (fn) { e.preventDefault(); fn(el, e); }
    });
    document.addEventListener('change', (e) => {
      const el = e.target.closest('[data-change]');
      if (el && App.actions[el.dataset.change]) App.actions[el.dataset.change](el, e);
    });
    document.addEventListener('input', (e) => {
      const el = e.target.closest('[data-input]');
      if (el && App.actions[el.dataset.input]) App.actions[el.dataset.input](el, e);
    });
    window.addEventListener('hashchange', () => { App.render(); window.scrollTo(0, 0); });

    // Le jour change (appli laissée ouverte) : on génère les récurrences du jour
    let lastDay = App.today();
    setInterval(() => {
      if (App.today() !== lastDay) {
        lastDay = App.today();
        Core.materializeRecurring(App.S, lastDay, Store.uid);
        Store.save(App.S);
        App.render();
      }
    }, 60000);

    App.render();
    if (!Store.load()) welcome();
  };

  App.actions['add-tx'] = (el) => App.transactionForm(null, el.dataset.type ? { type: el.dataset.type, categoryId: el.dataset.type === 'income' ? 'salaire' : 'courses' } : null);
  App.actions['alerts'] = () => App.showAlerts();
  App.actions['toggle-theme'] = () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
      (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    App.S.settings.theme = dark ? 'light' : 'dark';
    Store.save(App.S);
    App.applyTheme();
  };

  root.App = App;
})(window);
