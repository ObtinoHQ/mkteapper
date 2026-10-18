/* MK optimized version: size memory, card prices per size, delivery dates, cart underlay, newsletter timing. */
(() => {
  const SIZE_KEY = 'mk:size';
  const store = {
    get(k, s = sessionStorage) {
      try { return s.getItem(k); } catch (e) { return null; }
    },
    set(k, v, s = sessionStorage) {
      try { v === null ? s.removeItem(k) : s.setItem(k, v); } catch (e) { /* storage blocked */ }
    },
  };
  const formatMoney = (cents) =>
    window.FoxTheme?.Currency?.formatMoney
      ? FoxTheme.Currency.formatMoney(cents, FoxTheme.settings.moneyFormat)
      : `${(cents / 100).toLocaleString('da-DK')} kr.`;

  /* ---------- Delivery dates ---------- */
  const addBusinessDays = (from, days) => {
    const d = new Date(from);
    let left = days;
    while (left > 0) {
      d.setDate(d.getDate() + 1);
      const wd = d.getDay();
      if (wd !== 0 && wd !== 6) left -= 1;
    }
    return d;
  };
  const renderDeliveryDates = (root = document) => {
    const cutoff = Number(window.MkSettings?.cutoffHour ?? 14);
    const now = new Date();
    let start = now;
    // After cutoff or in the weekend, the parcel leaves the next business day
    if (now.getHours() >= cutoff || now.getDay() === 0 || now.getDay() === 6) start = addBusinessDays(now, 1);
    const fmt = new Intl.DateTimeFormat('da-DK', { weekday: 'short', day: 'numeric', month: 'short' });
    root.querySelectorAll('[data-mk-delivery]').forEach((el) => {
      const min = Number(el.dataset.min);
      const max = Number(el.dataset.max);
      if (!max) return;
      const a = fmt.format(addBusinessDays(start, min || max));
      const b = fmt.format(addBusinessDays(start, max));
      el.textContent = `${el.dataset.prefix || 'Levering'} ${a === b ? a : `${a} – ${b}`}`;
    });
  };

  /* ---------- Size chosen on collection pages ---------- */
  const sizeToFilterValue = (key) => (key.startsWith('r') ? `Ø${key.slice(1)} cm` : `${key} cm`);

  // Only touch the DOM when the content changes: the MutationObserver below would loop otherwise
  const setHtml = (el, html) => {
    if (el.dataset.mkHtml === html) return;
    el.dataset.mkHtml = html;
    el.innerHTML = html;
  };

  // A size within 10 cm on each side counts as the chosen size (160x220 and 160x235 for 160x230),
  // shown with its real measurements. Shapes never mix: round, oval and rectangular stay apart.
  const SIZE_TOLERANCE_CM = 10;
  const parseSizeKey = (key) => {
    const m = /^(r?)(\d+)(?:x(\d+))?(-.+)?$/.exec(key || '');
    if (!m) return null;
    return { kind: m[1] + (m[1] && m[3] ? 'x' : '') + (m[4] || ''), a: Number(m[2]), b: Number(m[3] || m[2]) };
  };
  const closestSize = (key, candidates) => {
    if (candidates.includes(key)) return key;
    const want = parseSizeKey(key);
    if (!want) return null;
    let best = null;
    let bestDiff = Infinity;
    candidates.forEach((c) => {
      const p = parseSizeKey(c);
      if (!p || p.kind !== want.kind) return;
      const da = Math.abs(p.a - want.a);
      const db = Math.abs(p.b - want.b);
      if (da > SIZE_TOLERANCE_CM || db > SIZE_TOLERANCE_CM || da + db >= bestDiff) return;
      best = c;
      bestDiff = da + db;
    });
    return best;
  };

  const applySizeToCards = (key, root = document) => {
    root.querySelectorAll('[data-mk-card-price][data-mk-sizes]').forEach((card) => {
      const def = card.querySelector('[data-mk-card-price-default]');
      const out = card.querySelector('[data-mk-card-price-size]');
      const productCard = card.closest('.product-card');
      const baseUrl = card.dataset.mkUrl;
      const links = productCard ? productCard.querySelectorAll(`a[href^="${baseUrl}"]`) : [];
      const entries = card.dataset.mkSizes.split(';').map((s) => s.split(':'));
      const match = key ? closestSize(key, entries.map((p) => p[0])) : null;
      const entry = match ? entries.find((p) => p[0] === match) : null;

      if (!key) {
        def.hidden = false;
        out.hidden = true;
        links.forEach((a) => (a.href = baseUrl));
        return;
      }
      if (!entry) {
        def.hidden = false;
        out.hidden = false;
        setHtml(out, `<span class="mk-card-price__missing">Findes ikke i ${sizeLabel(key)}</span>`);
        links.forEach((a) => (a.href = baseUrl));
        return;
      }
      const [, price, compare, id, available, label] = entry;
      const p = Number(price);
      const c = Number(compare);
      def.hidden = true;
      out.hidden = false;
      setHtml(
        out,
        `<span class="mk-card-price__label">${label}</span>` +
        `<span class="mk-card-price__value${c > p ? ' is-sale' : ''}">${formatMoney(p)}</span>` +
        (c > p ? `<s class="mk-card-price__compare">${formatMoney(c)}</s>` : '') +
          (available === '1' ? '' : '<span class="mk-card-price__missing">Udsolgt i denne størrelse</span>')
      );
      links.forEach((a) => (a.href = `${baseUrl}?variant=${id}`));
    });
  };

  const sizeLabel = (key) => {
    const chip = document.querySelector(`[data-mk-size-chip="${key}"]`);
    if (chip) return chip.dataset.label;
    return key.startsWith('r') ? `Ø ${key.slice(1)} cm` : `${key.replace('x', ' × ')} cm`;
  };

  const initSizeBar = () => {
    const bar = document.querySelector('[data-mk-size-bar]');
    const params = new URLSearchParams(location.search);
    const fromUrl = params.get('storrelse');
    if (fromUrl !== null) store.set(SIZE_KEY, fromUrl || null);
    let current = store.get(SIZE_KEY) || '';

    const filterParam = bar?.dataset.filterParam;
    const sync = () => {
      bar?.querySelectorAll('[data-mk-size-chip]').forEach((chip) => {
        const k = chip.dataset.mkSizeChip;
        if (k) chip.setAttribute('aria-pressed', String(k === current));
        else chip.hidden = !current;
      });
      applySizeToCards(current);
    };

    bar?.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-mk-size-chip]');
      if (!chip) return;
      const k = chip.dataset.mkSizeChip;
      current = k === current ? '' : k;
      store.set(SIZE_KEY, current || null);

      const url = new URL(location.href);
      if (current) url.searchParams.set('storrelse', current);
      else url.searchParams.delete('storrelse');
      if (filterParam) {
        url.searchParams.delete(filterParam);
        if (current) url.searchParams.set(filterParam, sizeToFilterValue(current));
        url.searchParams.delete('page');
        location.href = url.toString();
        return;
      }
      history.replaceState({}, '', url.toString());
      sync();
    });

    // Filtered first visit from the homepage: apply the filter once
    if (filterParam && fromUrl && !params.has(filterParam)) {
      const url = new URL(location.href);
      url.searchParams.set(filterParam, sizeToFilterValue(fromUrl));
      location.replace(url.toString());
      return;
    }

    sync();
    // Cards re-render on filtering, sorting and pagination
    let t;
    new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => applySizeToCards(current), 50);
    }).observe(document.body, { childList: true, subtree: true });
  };

  /* ---------- Product page: open on the remembered or best-selling size ---------- */
  const initProductSize = () => {
    document.addEventListener('change', (e) => {
      const input = e.target.closest('[data-mk-size-key]');
      if (input && input.checked) store.set(SIZE_KEY, input.dataset.mkSizeKey);
    });

    const picker = document.querySelector('[data-mk-size-picker]');
    if (!picker || new URLSearchParams(location.search).has('variant')) return;

    const remembered = store.get(SIZE_KEY);
    const usable = (el) => el && !el.classList.contains('disabled');
    const usableKeys = [...picker.querySelectorAll('[data-mk-size-key]:not(.disabled)')].map((i) => i.dataset.mkSizeKey);
    const near = remembered ? closestSize(remembered, usableKeys) : null;
    let target = near ? picker.querySelector(`[data-mk-size-key="${near}"]`) : null;
    if (!usable(target)) target = picker.querySelector('[data-mk-bestseller]');
    if (!usable(target) || target.checked) return;

    customElements.whenDefined('variant-selects').then(() => {
      target.checked = true;
      target.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };

  /* ---------- Homepage finder tabs ---------- */
  const initFinder = () => {
    document.querySelectorAll('.mk-finder').forEach((finder) => {
      const tabs = finder.querySelectorAll('[data-mk-tab]');
      tabs.forEach((tab) =>
        tab.addEventListener('click', () => {
          tabs.forEach((t) => {
            const on = t === tab;
            t.setAttribute('aria-selected', String(on));
            document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
          });
        })
      );
    });
  };

  /* ---------- Cart: add the matching underlay ---------- */
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-mk-add-variant]');
    if (!btn) return;
    btn.classList.add('btn--loading');
    btn.disabled = true;
    try {
      await fetch(`${window.Shopify?.routes?.root || '/'}cart/add.js`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items: [{ id: Number(btn.dataset.mkAddVariant), quantity: 1 }] }),
      });
      document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true, detail: { open: true } }));
    } finally {
      btn.classList.remove('btn--loading');
      btn.disabled = false;
    }
  });

  /* ---------- Newsletter: 2nd page view or after N seconds, never on top of the cookie banner ---------- */
  const initNewsletter = () => {
    const cfg = window.MkSettings || {};
    if (!cfg.klaviyoFormId) return;
    const SHOWN = 'mk:nl-shown';
    const last = Number(store.get(SHOWN, localStorage) || 0);
    if (Date.now() - last < 7 * 24 * 3600 * 1000) return;

    const views = Number(store.get('mk:views') || 0) + 1;
    store.set('mk:views', String(views));

    let opened = false;
    const cookiebotOnPage = !!document.getElementById('Cookiebot');
    const consentAnswered = () => (window.Cookiebot ? window.Cookiebot.hasResponse : !cookiebotOnPage);
    const open = () => {
      if (opened) return;
      if (!consentAnswered()) {
        const retry = () => setTimeout(open, 1500);
        ['CookiebotOnAccept', 'CookiebotOnDecline', 'CookiebotOnLoad'].forEach((ev) =>
          window.addEventListener(ev, retry, { once: true })
        );
        return;
      }
      opened = true;
      store.set(SHOWN, String(Date.now()), localStorage);
      window._klOnsite = window._klOnsite || [];
      window._klOnsite.push(['openForm', cfg.klaviyoFormId]);
    };

    if (views >= Number(cfg.newsletterMinPageviews || 2)) {
      setTimeout(open, 3000);
    } else {
      setTimeout(open, Number(cfg.newsletterDelaySeconds || 30) * 1000);
    }
  };

  const init = () => {
    renderDeliveryDates();
    initSizeBar();
    initProductSize();
    initFinder();
    initNewsletter();
    document.addEventListener('cart:updated', () => setTimeout(renderDeliveryDates, 50));
    document.addEventListener('variant:changed', () => renderDeliveryDates());
    window.FoxTheme?.pubsub?.subscribe?.(FoxTheme.pubsub.PUB_SUB_EVENTS.cartUpdate, () =>
      setTimeout(renderDeliveryDates, 50)
    );
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
