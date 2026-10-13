/* Pécule — utilitaires d'interface : formatage, modales, notifications. */
(function (root) {
  'use strict';

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const fmt0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const fmt2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = (n, dec) => (dec ? fmt2 : fmt0).format(dec ? n : Math.round(n));
  const signed = (n, dec) => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n), dec);
  const pct = (n) => `${Math.round(n)} %`;

  const dateFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const dateShort = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtDate = (iso, long) => {
    const s = (long ? dateFmt : dateShort).format(root.Core.parseISO(iso));
    return long ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  };

  const parseAmount = (v) => {
    const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  };

  // ---------- Notifications ----------

  function toast(message, kind) {
    const box = document.getElementById('toasts');
    const t = document.createElement('div');
    t.className = `toast ${kind || ''}`;
    t.innerHTML = message;
    box.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 300);
    }, kind === 'over' || kind === 'warn' ? 6000 : 3200);
  }

  // ---------- Modale ----------

  let current = null;

  /**
   * Ouvre une modale. body : HTML (peut contenir des champs).
   * opts.onSubmit(data, form) : appelé à la validation ; retourner false garde la modale ouverte.
   */
  function modal(title, body, opts) {
    opts = opts || {};
    close();
    const root_ = document.getElementById('modal-root');
    root_.innerHTML = `
      <div class="modal-backdrop" data-close>
        <div class="modal ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <header><h2 id="modal-title">${title}</h2><button class="icon-btn" data-close aria-label="Fermer">✕</button></header>
          <form id="modal-form" novalidate>
            <div class="modal-body">${body}</div>
            ${opts.noFooter ? '' : `<footer>
              ${opts.danger ? `<button type="button" class="btn ghost danger" data-modal-danger>${opts.danger}</button>` : ''}
              <span class="spacer"></span>
              <button type="button" class="btn ghost" data-close>${opts.cancel || 'Annuler'}</button>
              <button type="submit" class="btn primary">${opts.submit || 'Enregistrer'}</button>
            </footer>`}
          </form>
        </div>
      </div>`;
    const backdrop = root_.firstElementChild;
    const form = root_.querySelector('form');
    current = { opts, backdrop };
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) current && (current.downOnBackdrop = true);
    });
    backdrop.addEventListener('click', (e) => {
      const isBackdrop = e.target === backdrop;
      if ((isBackdrop && current && current.downOnBackdrop) || (!isBackdrop && e.target.closest('[data-close]') && e.target.closest('[data-close]') !== backdrop)) close();
      if (current) current.downOnBackdrop = false;
    });
    const danger = root_.querySelector('[data-modal-danger]');
    if (danger) danger.addEventListener('click', () => { if (opts.onDanger && opts.onDanger() !== false) close(); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      if (!opts.onSubmit || opts.onSubmit(data, form) !== false) close();
    });
    if (opts.onOpen) opts.onOpen(form);
    requestAnimationFrame(() => {
      backdrop.classList.add('show');
      const first = form.querySelector('[autofocus], input:not([type=hidden]):not([type=radio]), select');
      if (first && !opts.noFocus) first.focus();
    });
    return form;
  }

  function close() {
    const root_ = document.getElementById('modal-root');
    if (root_) root_.innerHTML = '';
    current = null;
  }

  function confirmBox(title, text, onYes, yesLabel) {
    modal(title, `<p class="muted">${text}</p>`, { submit: yesLabel || 'Confirmer', onSubmit: () => { onYes(); } });
  }

  /** Marque un champ en erreur et retourne false (pratique dans onSubmit). */
  function fieldError(form, name, message) {
    const input = form.querySelector(`[name="${name}"]`);
    if (input) {
      input.classList.add('invalid');
      input.focus();
      let hint = input.parentElement.querySelector('.error');
      if (!hint) {
        hint = document.createElement('small');
        hint.className = 'error';
        input.parentElement.appendChild(hint);
      }
      hint.textContent = message;
      input.addEventListener('input', () => { input.classList.remove('invalid'); hint.remove(); }, { once: true });
    }
    return false;
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type: type || 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && current) close(); });

  root.UI = { esc, money, signed, pct, fmtDate, parseAmount, toast, modal, close, confirmBox, fieldError, download };
})(window);
