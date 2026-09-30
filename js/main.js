/* =========================================================================
   Nova Wallet — application script
   Vanilla JS, no build step. Responsibilities:
     - mock data + localStorage persistence
     - rendering of balance, stats, transaction table
     - search / filter / pagination
     - modals (send, top up, request) with validation
     - theme toggle, sidebar toggle, toasts, CSV export
   ========================================================================= */
(function () {
  'use strict';

  /* ----------------------------------------------------------------------
     Constants & mock data
     ---------------------------------------------------------------------- */
  const STARTING_BALANCE = 12480.55;
  const SPENDING_LIMIT = 5000;
  const PAGE_SIZE = 6;
  const STORAGE_KEY = 'nova-wallet-state-v1';
  const THEME_KEY = 'nova-wallet-theme';

  const CATEGORIES = ['Shopping', 'Food', 'Transport', 'Bills', 'Salary', 'Transfer', 'Refund', 'Entertainment'];
  const AVATAR_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6'];

  const SEED_TRANSACTIONS = [
    { id: 't1',  name: 'Stripe Payroll',    note: 'September salary',       amount: 4250.00, type: 'in',  category: 'Salary',      date: '2026-09-28T09:12:00', status: 'completed' },
    { id: 't2',  name: 'Blue Bottle Coffee', note: 'Card •••• 4242',         amount: 6.75,    type: 'out', category: 'Food',        date: '2026-09-27T16:40:00', status: 'completed' },
    { id: 't3',  name: 'Maya Okonkwo',      note: 'Rent share',             amount: 820.00,  type: 'out', category: 'Bills',       date: '2026-09-26T11:05:00', status: 'completed' },
    { id: 't4',  name: 'Acme Cloud',        note: 'Invoice #4417',          amount: 249.99,  type: 'out', category: 'Bills',       date: '2026-09-25T08:30:00', status: 'pending'   },
    { id: 't5',  name: 'Refund — Uniqlo',   note: 'Order #8812',            amount: 74.60,   type: 'in',  category: 'Refund',     date: '2026-09-24T14:20:00', status: 'completed' },
    { id: 't6',  name: 'Metro Transit',     note: 'Monthly pass',           amount: 96.00,   type: 'out', category: 'Transport',   date: '2026-09-22T07:55:00', status: 'completed' },
    { id: 't7',  name: 'Daniel Reyes',      note: 'Concert tickets',        amount: 210.00,  type: 'out', category: 'Entertainment', date: '2026-09-20T19:45:00', status: 'completed' },
    { id: 't8',  name: 'Whole Foods',       note: 'Groceries',              amount: 132.48,  type: 'out', category: 'Shopping',    date: '2026-09-18T18:02:00', status: 'completed' },
    { id: 't9',  name: 'Priya Raman',      note: 'Split dinner',           amount: 58.20,   type: 'in',  category: 'Transfer',    date: '2026-09-16T21:10:00', status: 'completed' },
    { id: 't10', name: 'Amazon',            note: 'Standing desk',          amount: 419.99,  type: 'out', category: 'Shopping',    date: '2026-09-14T13:33:00', status: 'failed'   }
  ];

  const VIEW_META = {
    dashboard:    { title: 'Dashboard',    subtitle: 'Your money at a glance.' },
    transactions: { title: 'Transactions', subtitle: 'Every movement on your account.' },
    send:         { title: 'Send Money',   subtitle: 'Transfer to anyone, instantly.' },
    topup:        { title: 'Top Up',       subtitle: 'Add funds from a card or bank.' },
    settings:     { title: 'Settings',     subtitle: 'Control how Nova Wallet behaves.' }
  };

  /* ----------------------------------------------------------------------
     State
     ---------------------------------------------------------------------- */
  const state = {
    balance: STARTING_BALANCE,
    transactions: [],
    currency: 'USD',
    filter: 'all',
    search: '',
    page: 1,
    balanceHidden: false
  };

  let lastFocused = null;

  /* ----------------------------------------------------------------------
     DOM references
     ---------------------------------------------------------------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const el = {
    root: document.documentElement,
    sidebar: $('#sidebar'),
    sidebarOpen: $('#sidebarOpen'),
    sidebarClose: $('#sidebarClose'),
    sidebarBackdrop: $('#sidebarBackdrop'),
    viewTitle: $('#viewTitle'),
    viewSubtitle: $('#viewSubtitle'),
    themeToggle: $('#themeToggle'),
    darkSwitch: $('#darkSwitch'),
    notificationsBtn: $('#notificationsBtn'),
    searchInput: $('#searchInput'),
    balanceAmount: $('#balanceAmount'),
    balanceTrend: $('#balanceTrend'),
    toggleBalance: $('#toggleBalance'),
    totalIncome: $('#totalIncome'),
    totalSpending: $('#totalSpending'),
    totalPending: $('#totalPending'),
    limitText: $('#limitText'),
    limitBar: $('#limitBar'),
    txBody: $('#txBody'),
    txEmpty: $('#txEmpty'),
    txCount: $('#txCount'),
    pageLabel: $('#pageLabel'),
    pagePrev: $('#pagePrev'),
    pageNext: $('#pageNext'),
    currencySelect: $('#currencySelect'),
    sendModal: $('#sendModal'),
    sendForm: $('#sendForm'),
    sendRecipient: $('#sendRecipient'),
    sendAmount: $('#sendAmount'),
    sendNote: $('#sendNote'),
    sendAvailable: $('#sendAvailable'),
    sendSubmit: $('#sendSubmit'),
    topUpModal: $('#topUpModal'),
    topUpForm: $('#topUpForm'),
    topUpAmount: $('#topUpAmount'),
    requestModal: $('#requestModal'),
    requestForm: $('#requestForm'),
    requestFrom: $('#requestFrom'),
    requestAmount: $('#requestAmount'),
    requestNote: $('#requestNote'),
    toasts: $('#toasts')
  };

  /* ----------------------------------------------------------------------
     Helpers
     ---------------------------------------------------------------------- */
  const CURRENCY_META = {
    USD: { locale: 'en-US', currency: 'USD', symbol: '$' },
    EUR: { locale: 'de-DE', currency: 'EUR', symbol: '€' },
    GBP: { locale: 'en-GB', currency: 'GBP', symbol: '£' },
    INR: { locale: 'en-IN', currency: 'INR', symbol: '₹' }
  };

  function currencyMeta() {
    return CURRENCY_META[state.currency] || CURRENCY_META.USD;
  }

  function formatMoney(value, opts) {
    const meta = currencyMeta();
    return new Intl.NumberFormat(meta.locale, {
      style: 'currency',
      currency: meta.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      ...(opts || {})
    }).format(value || 0);
  }

  function formatDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString(currencyMeta().locale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  function initials(name) {
    return String(name || '?')
      .replace(/@.*$/, '')
      .trim()
      .split(/[\s-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('');
  }

  function colorFor(name) {
    let hash = 0;
    const str = String(name || '');
    for (let i = 0; i < str.length; i += 1) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  function uid() {
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setFieldError(form, name, message) {
    const slot = form ? form.querySelector('[data-error="' + name + '"]') : null;
    const input = form ? form.querySelector('[name="' + name + '"]') || form.querySelector('#' + name) : null;
    if (slot) slot.textContent = message || '';
    if (input) input.classList.toggle('has-error', Boolean(message));
  }

  function clearErrors(form) {
    $$('[data-error]', form).forEach((node) => { node.textContent = ''; });
    $$('.has-error', form).forEach((node) => node.classList.remove('has-error'));
  }

  /* ----------------------------------------------------------------------
     Persistence
     ---------------------------------------------------------------------- */
  function saveState() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        balance: state.balance,
        transactions: state.transactions,
        currency: state.currency
      }));
    } catch (err) {
      /* storage unavailable (private mode) — app still works in memory */
    }
  }

  function loadState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.balance !== 'number' || !Array.isArray(parsed.transactions)) return false;
      state.balance = parsed.balance;
      state.transactions = parsed.transactions;
      if (CURRENCY_META[parsed.currency]) state.currency = parsed.currency;
      return true;
    } catch (err) {
      return false;
    }
  }

  function resetState() {
    state.balance = STARTING_BALANCE;
    state.transactions = SEED_TRANSACTIONS.map((tx) => Object.assign({}, tx));
    state.filter = 'all';
    state.search = '';
    state.page = 1;
    saveState();
  }

  /* ----------------------------------------------------------------------
     Derived values
     ---------------------------------------------------------------------- */
  function computeStats() {
    const stats = { income: 0, spending: 0, pending: 0 };
    state.transactions.forEach((tx) => {
      if (tx.status === 'pending') {
        stats.pending += Math.abs(tx.amount);
        return;
      }
      if (tx.status === 'failed') return;
      if (tx.type === 'in') stats.income += tx.amount;
      else stats.spending += tx.amount;
    });
    return stats;
  }

  function filteredTransactions() {
    const term = state.search.trim().toLowerCase();
    return state.transactions
      .filter((tx) => (state.filter === 'all' ? true : tx.type === state.filter))
      .filter((tx) => {
        if (!term) return true;
        return (
          tx.name.toLowerCase().includes(term) ||
          String(tx.note || '').toLowerCase().includes(term) ||
          String(tx.category).toLowerCase().includes(term) ||
          String(tx.status).toLowerCase().includes(term)
        );
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  /* ----------------------------------------------------------------------
     Rendering
     ---------------------------------------------------------------------- */
  function renderBalance() {
    el.balanceAmount.textContent = state.balanceHidden ? '••••••' : formatMoney(state.balance);
    el.balanceAmount.classList.toggle('is-masked', state.balanceHidden);
    el.toggleBalance.setAttribute('aria-label', state.balanceHidden ? 'Show balance' : 'Hide balance');

    const stats = computeStats();
    el.totalIncome.textContent = formatMoney(stats.income);
    el.totalSpending.textContent = formatMoney(stats.spending);
    el.totalPending.textContent = formatMoney(stats.pending);

    const net = stats.income - stats.spending;
    const pct = stats.spending > 0 ? (net / stats.spending) * 100 : 0;
    const up = net >= 0;
    el.balanceTrend.className = 'trend ' + (up ? 'trend--up' : 'trend--down');
    el.balanceTrend.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg> ' +
      (up ? '+' : '') + pct.toFixed(1) + '%';

    const limitPct = Math.max(0, Math.min(100, (stats.spending / SPENDING_LIMIT) * 100));
    el.limitText.textContent = formatMoney(stats.spending) + ' / ' + formatMoney(SPENDING_LIMIT, { maximumFractionDigits: 0 });
    el.limitBar.style.width = limitPct.toFixed(1) + '%';

    const symbol = currencyMeta().symbol;
    el.sendAvailable.textContent = formatMoney(state.balance);
    ['#sendCurrencySymbol', '#topUpCurrencySymbol', '#requestCurrencySymbol'].forEach((sel) => {
      const node = $(sel);
      if (node) node.textContent = symbol;
    });
  }

  function statusBadge(status) {
    if (status === 'completed') return '<span class="badge badge--success">Completed</span>';
    if (status === 'pending') return '<span class="badge badge--warning">Pending</span>';
    return '<span class="badge badge--danger">Failed</span>';
  }

  function rowHtml(tx, isNew) {
    const isIn = tx.type === 'in';
    const sign = isIn ? '+' : '-';
    const cls = isIn ? 'amount--in' : 'amount--out';
    return (
      '<tr' + (isNew ? ' class="is-new"' : '') + '>' +
        '<td>' +
          '<div class="tx-person">' +
            '<span class="tx-avatar" style="background:' + colorFor(tx.name) + '" aria-hidden="true">' + escapeHtml(initials(tx.name)) + '</span>' +
            '<span>' +
              '<span class="tx-name">' + escapeHtml(tx.name) + '</span><br>' +
              '<span class="tx-sub">' + escapeHtml(tx.note || 'No note') + '</span>' +
            '</span>' +
          '</div>' +
        '</td>' +
        '<td><span class="tag">' + escapeHtml(tx.category) + '</span></td>' +
        '<td class="muted">' + escapeHtml(formatDate(tx.date)) + '</td>' +
        '<td>' + statusBadge(tx.status) + '</td>' +
        '<td class="ta-right"><span class="amount ' + cls + '">' + sign + escapeHtml(formatMoney(Math.abs(tx.amount))) + '</span></td>' +
      '</tr>'
    );
  }

  function renderTransactions() {
    const list = filteredTransactions();
    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * PAGE_SIZE;
    const pageItems = list.slice(start, start + PAGE_SIZE);

    el.txBody.innerHTML = pageItems.map((tx) => rowHtml(tx, tx.__new)).join('');

    const isEmpty = list.length === 0;
    el.txEmpty.hidden = !isEmpty;
    $('#txTable').hidden = isEmpty;

    el.txCount.textContent = list.length + (list.length === 1 ? ' transaction' : ' transactions');
    el.pageLabel.textContent = 'Page ' + state.page + ' of ' + totalPages;
    el.pagePrev.disabled = state.page <= 1;
    el.pageNext.disabled = state.page >= totalPages;
  }

  function renderAll() {
    renderBalance();
    renderTransactions();
  }

  /* ----------------------------------------------------------------------
     Toasts
     ---------------------------------------------------------------------- */
  const TOAST_ICONS = {
    success: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 13 4 4L19 7"/></svg>',
    danger:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    info:    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8h.01"/><path d="M12 11v5"/><circle cx="12" cy="12" r="9"/></svg>'
  };

  function toast(title, text, variant) {
    const type = variant || 'info';
    const node = document.createElement('div');
    node.className = 'toast toast--' + type;
    node.innerHTML =
      '<span class="toast__icon" aria-hidden="true">' + TOAST_ICONS[type] + '</span>' +
      '<span class="grow"><span class="toast__title">' + escapeHtml(title) + '</span>' +
      (text ? '<br><span class="toast__text">' + escapeHtml(text) + '</span>' : '') + '</span>';
    el.toasts.appendChild(node);

    window.setTimeout(() => {
      node.classList.add('is-leaving');
      window.setTimeout(() => node.remove(), 220);
    }, 3600);
  }

  /* ----------------------------------------------------------------------
     Modals
     ---------------------------------------------------------------------- */
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

  function openModal(modal) {
    if (!modal) return;
    lastFocused = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    const target = modal.querySelector('[data-autofocus]') || modal.querySelector(FOCUSABLE);
    if (target) window.setTimeout(() => target.focus(), 60);
  }

  function closeModal(modal) {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.style.overflow = '';
    if (modal.id === 'sendModal') clearErrors(el.sendForm);
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  }

  function openSendModal() {
    el.sendForm.reset();
    clearErrors(el.sendForm);
    el.sendAvailable.textContent = formatMoney(state.balance);
    openModal(el.sendModal);
  }

  function openTopUpModal() {
    el.topUpForm.reset();
    clearErrors(el.topUpForm);
    openModal(el.topUpModal);
  }

  function openRequestModal() {
    el.requestForm.reset();
    openModal(el.requestModal);
  }

  /* ----------------------------------------------------------------------
     Transaction mutations
     ---------------------------------------------------------------------- */
  function addTransaction(tx) {
    const record = Object.assign({ id: uid(), date: new Date().toISOString(), status: 'completed' }, tx);
    record.__new = true;
    state.transactions.unshift(record);
    state.filter = 'all';
    state.page = 1;
    saveState();
    renderAll();
    window.setTimeout(() => {
      const first = el.txBody.querySelector('tr.is-new');
      if (first) first.classList.remove('is-new');
    }, 500);
    return record;
  }

  function sendMoney(recipient, amount, note) {
    if (state.balance < amount) {
      setFieldError(el.sendForm, 'amount', 'Insufficient balance. Top up first.');
      return false;
    }
    state.balance -= amount;
    addTransaction({
      name: recipient,
      note: note || 'Money transfer',
      amount: amount,
      type: 'out',
      category: 'Transfer',
      status: 'completed'
    });
    toast('Money sent', formatMoney(amount) + ' to ' + recipient, 'success');
    return true;
  }

  function topUp(amount, method) {
    state.balance += amount;
    addTransaction({
      name: method || 'Top up',
      note: 'Wallet top up',
      amount: amount,
      type: 'in',
      category: 'Transfer',
      status: 'completed'
    });
    toast('Top up complete', formatMoney(amount) + ' added via ' + (method || 'card'), 'success');
  }

  function requestMoney(from, amount, note) {
    addTransaction({
      name: from,
      note: note || 'Money requested',
      amount: amount,
      type: 'in',
      category: 'Transfer',
      status: 'pending'
    });
    toast('Request sent', formatMoney(amount) + ' requested from ' + from, 'info');
  }

  /* ----------------------------------------------------------------------
     CSV export
     ---------------------------------------------------------------------- */
  function exportCsv() {
    const rows = [['Date', 'Description', 'Note', 'Category', 'Type', 'Status', 'Amount']].concat(
      filteredTransactions().map((tx) => [
        new Date(tx.date).toISOString(),
        tx.name,
        tx.note || '',
        tx.category,
        tx.type,
        tx.status,
        Math.abs(tx.amount).toFixed(2)
      ])
    );
    const csv = rows
      .map((row) => row.map((cell) => '"' + String(cell).replace(/"/g, '""') + '"').join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'nova-wallet-transactions.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast('Export ready', 'Downloaded transactions as CSV', 'success');
  }

  /* ----------------------------------------------------------------------
     Theme
     ---------------------------------------------------------------------- */
  function applyTheme(theme) {
    el.root.setAttribute('data-theme', theme);
    const isDark = theme === 'dark';
    el.themeToggle.setAttribute('aria-pressed', String(isDark));
    el.darkSwitch.checked = isDark;
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch (err) {
      /* ignore */
    }
  }

  function initTheme() {
    let stored = null;
    try {
      stored = window.localStorage.getItem(THEME_KEY);
    } catch (err) {
      stored = null;
    }
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(stored || (prefersDark ? 'dark' : 'light'));
  }

  /* ----------------------------------------------------------------------
     Views
     ---------------------------------------------------------------------- */
  function setView(name) {
    const view = VIEW_META[name] ? name : 'dashboard';

    $$('.nav__item').forEach((item) => {
      const active = item.dataset.view === view || (view === 'dashboard' && item.dataset.view === 'dashboard');
      item.classList.toggle('is-active', active);
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });

    $$('[data-view-panel]').forEach((panel) => {
      const active = panel.dataset.viewPanel === view;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });

    // Send Money / Top Up nav items open their modal on top of the dashboard
    if (view === 'send') {
      openSendModal();
      if (window.location.hash !== '#send') history.replaceState(null, '', '#send');
    } else if (view === 'topup') {
      openTopUpModal();
      if (window.location.hash !== '#topup') history.replaceState(null, '', '#topup');
    } else {
      if (window.location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
    }

    el.viewTitle.textContent = VIEW_META[view].title;
    el.viewSubtitle.textContent = VIEW_META[view].subtitle;
    closeSidebar();
  }

  function viewFromHash() {
    const hash = (window.location.hash || '').replace('#', '');
    return VIEW_META[hash] ? hash : 'dashboard';
  }

  /* ----------------------------------------------------------------------
     Sidebar (mobile)
     ---------------------------------------------------------------------- */
  function openSidebar() {
    el.sidebar.classList.add('is-open');
    el.sidebarBackdrop.hidden = false;
    el.sidebarOpen.setAttribute('aria-expanded', 'true');
  }

  function closeSidebar() {
    el.sidebar.classList.remove('is-open');
    el.sidebarBackdrop.hidden = true;
    el.sidebarOpen.setAttribute('aria-expanded', 'false');
  }

  /* ----------------------------------------------------------------------
     Event wiring
     ---------------------------------------------------------------------- */
  function bindEvents() {
    // Navigation
    el.sidebar.addEventListener('click', (event) => {
      const item = event.target.closest('.nav__item');
      if (!item) return;
      event.preventDefault();
      setView(item.dataset.view);
    });

    el.sidebarOpen.addEventListener('click', openSidebar);
    el.sidebarClose.addEventListener('click', closeSidebar);
    el.sidebarBackdrop.addEventListener('click', closeSidebar);

    window.addEventListener('hashchange', () => setView(viewFromHash()));

    // Theme
    el.themeToggle.addEventListener('click', () => {
      applyTheme(el.root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
    el.darkSwitch.addEventListener('change', () => {
      applyTheme(el.darkSwitch.checked ? 'dark' : 'light');
    });

    // Notifications
    el.notificationsBtn.addEventListener('click', () => {
      toast('No new alerts', 'You are all caught up.', 'info');
      $('.badge-dot', el.notificationsBtn).style.display = 'none';
    });

    // Balance privacy
    el.toggleBalance.addEventListener('click', () => {
      state.balanceHidden = !state.balanceHidden;
      renderBalance();
    });

    // Search
    el.searchInput.addEventListener('input', (event) => {
      state.search = event.target.value;
      state.page = 1;
      renderTransactions();
    });

    // Filters
    $$('.segmented__btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('.segmented__btn').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        state.filter = btn.dataset.filter;
        state.page = 1;
        renderTransactions();
      });
    });

    // Pagination
    el.pagePrev.addEventListener('click', () => {
      if (state.page > 1) { state.page -= 1; renderTransactions(); }
    });
    el.pageNext.addEventListener('click', () => {
      state.page += 1; renderTransactions();
    });

    // Quick actions + delegated data-action buttons
    document.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-action]');
      if (!trigger) return;
      const action = trigger.dataset.action;
      if (action === 'send') openSendModal();
      else if (action === 'top-up') openTopUpModal();
      else if (action === 'request') openRequestModal();
      else if (action === 'export') exportCsv();
      else if (action === 'scan') toast('QR scanner', 'Camera access is disabled in this demo.', 'info');
      else if (action === 'reset') {
        resetState();
        renderAll();
        if (el.currencySelect) el.currencySelect.value = state.currency;
        toast('Demo data reset', 'Balance and transactions restored.', 'info');
      }
    });

    // Modal dismissal (backdrop, X, cancel)
    $$('.modal').forEach((modal) => {
      modal.addEventListener('click', (event) => {
        if (event.target.closest('[data-close]')) closeModal(modal);
      });
    });

    // Focus trap + Escape
    document.addEventListener('keydown', (event) => {
      const open = $$('.modal').find((m) => !m.hidden);
      if (event.key === 'Escape') {
        if (open) { closeModal(open); return; }
        closeSidebar();
        return;
      }
      if (event.key !== 'Tab' || !open) return;
      const nodes = $$(FOCUSABLE, open).filter((n) => n.offsetParent !== null);
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    // Amount chips
    $('#amountChips').addEventListener('click', (event) => {
      const chip = event.target.closest('.chip');
      if (!chip) return;
      el.sendAmount.value = chip.dataset.amount;
      setFieldError(el.sendForm, 'amount', '');
    });
    $('#topUpChips').addEventListener('click', (event) => {
      const chip = event.target.closest('.chip');
      if (!chip) return;
      el.topUpAmount.value = chip.dataset.amount;
      setFieldError(el.topUpForm, 'amount', '');
    });

    // Send money form
    el.sendForm.addEventListener('submit', (event) => {
      event.preventDefault();
      clearErrors(el.sendForm);

      const recipient = el.sendRecipient.value.trim();
      const amount = parseFloat(el.sendAmount.value);
      const note = el.sendNote.value.trim();
      let valid = true;

      if (!recipient) {
        setFieldError(el.sendForm, 'recipient', 'Enter an email or phone number.');
        valid = false;
      } else if (recipient.length < 3) {
        setFieldError(el.sendForm, 'recipient', 'That recipient does not look valid.');
        valid = false;
      }

      if (!amount || isNaN(amount) || amount <= 0) {
        setFieldError(el.sendForm, 'amount', 'Enter an amount greater than zero.');
        valid = false;
      } else if (amount > state.balance) {
        setFieldError(el.sendForm, 'amount', 'Insufficient balance. Top up first.');
        valid = false;
      }

      if (!valid) return;

      el.sendSubmit.disabled = true;
      window.setTimeout(() => {
        el.sendSubmit.disabled = false;
        if (sendMoney(recipient, amount, note)) {
          closeModal(el.sendModal);
          el.sendForm.reset();
        }
      }, 450);
    });

    // Top up form
    el.topUpForm.addEventListener('submit', (event) => {
      event.preventDefault();
      clearErrors(el.topUpForm);
      const amount = parseFloat(el.topUpAmount.value);
      if (!amount || isNaN(amount) || amount <= 0) {
        setFieldError(el.topUpForm, 'amount', 'Enter an amount greater than zero.');
        return;
      }
      if (amount > 10000) {
        setFieldError(el.topUpForm, 'amount', 'Single top ups are capped at 10,000.');
        return;
      }
      const method = $('#topUpMethod').value;
      topUp(amount, method);
      closeModal(el.topUpModal);
      el.topUpForm.reset();
    });

    // Request form
    el.requestForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const from = el.requestFrom.value.trim();
      const amount = parseFloat(el.requestAmount.value);
      if (!from || !amount || isNaN(amount) || amount <= 0) {
        toast('Check the details', 'Enter a contact and a valid amount.', 'danger');
        return;
      }
      requestMoney(from, amount, el.requestNote.value.trim());
      closeModal(el.requestModal);
      el.requestForm.reset();
    });

    // Currency
    el.currencySelect.addEventListener('change', (event) => {
      state.currency = event.target.value;
      saveState();
      renderAll();
      toast('Currency updated', 'Amounts now shown in ' + state.currency, 'info');
    });

    // Live update of the "available" hint
    el.sendAmount.addEventListener('input', () => setFieldError(el.sendForm, 'amount', ''));
    el.sendRecipient.addEventListener('input', () => setFieldError(el.sendForm, 'recipient', ''));
  }

  /* ----------------------------------------------------------------------
     Init
     ---------------------------------------------------------------------- */
  function init() {
    if (!loadState()) {
      state.transactions = SEED_TRANSACTIONS.map((tx) => Object.assign({}, tx));
    }
    el.currencySelect.value = state.currency;
    initTheme();
    bindEvents();
    renderAll();
    setView(viewFromHash());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
