// TinyRecipely — калькулятор рецептур.
// Все рецептуры лежат в data/recipes.json (раскладки на 1000 г готовой массы).

let DOUGHS, FILLINGS, PRODUCTS, FARSH_ONLY;
let PRICES_DEFAULT = {}, MARKUP_DEFAULT = { min: 2.5, max: 3 };
let PRICES = {}, MARKUP = { min: 2.5, max: 3 };
const PRICES_LS = 'tinyrecipely_prices';

const $ = id => document.getElementById(id);
let mode = 'product';
let lastCopyText = '';

// ---------- форматирование ----------
function roundG(g) {
  if (g >= 200) return Math.round(g / 5) * 5;
  if (g >= 20)  return Math.round(g);
  return Math.round(g * 2) / 2; // до 0.5 г для соли/перца
}

function fmtG(g) {
  const r = roundG(g);
  if (r >= 1000) return (r / 1000).toFixed(2).replace('.', ',') + ' кг';
  return r + ' г';
}

function fmtKg(kg) {
  return (Math.round(kg * 100) / 100).toString().replace('.', ',') + ' кг';
}

function eggNote(g) {
  const pcs = Math.round(g / 50 * 10) / 10;
  return '≈ ' + pcs.toString().replace('.', ',') + ' шт';
}

// масштабирует рецепт (на 1000 г) до нужной массы
function scale(recipe, targetG) {
  const base = recipe.items.reduce((s, i) => s + i.g, 0);
  return recipe.items.map(i => ({ ...i, g: i.g * targetG / base }));
}

// ---------- себестоимость ----------
function priceFor(name) {
  const n = name.toLowerCase();
  for (const k of Object.keys(PRICES).sort((a, b) => b.length - a.length)) {
    if (n.includes(k)) return PRICES[k];
  }
  return 0;
}

// parts: [{label, items}], massG — масса готового продукта
function econFor(parts, massG) {
  const rows = [];
  let grand = 0;
  for (const part of parts) {
    const c = part.items.reduce((s, it) => s + it.g / 1000 * priceFor(it.n), 0);
    grand += c;
    rows.push([part.label, c]);
  }
  if (grand <= 0) return { html: '', text: '' };
  const perKg = grand / (massG / 1000);
  const pMin = Math.round(perKg * MARKUP.min / 10) * 10;
  const pMax = Math.round(perKg * MARKUP.max / 10) * 10;

  let rowsHtml = rows.length > 1
    ? rows.map(([l, c]) => `<tr><td>${l}</td><td class="note"></td><td class="amt">${Math.round(c)} ₽</td></tr>`).join('')
    : '';
  rowsHtml += `<tr class="total"><td>Себестоимость</td><td class="note">${Math.round(perKg)} ₽/кг</td><td class="amt">${Math.round(grand)} ₽</td></tr>`;
  const html = `<div class="block econ"><h3>💰 Экономика</h3><table class="ing">${rowsHtml}</table>` +
    `<div class="hint">Рекомендуемая цена продажи: <b>${pMin}–${pMax} ₽/кг</b> (наценка ×${MARKUP.min}–×${MARKUP.max}). ` +
    `Учтены только ингредиенты с ценой — правятся во вкладке «Цены».</div></div>`;

  const text = `\n💰 Экономика:\n` +
    (rows.length > 1 ? rows.map(([l, c]) => `• ${l} — ${Math.round(c)} ₽\n`).join('') : '') +
    `• Себестоимость — ${Math.round(grand)} ₽ (${Math.round(perKg)} ₽/кг)\n` +
    `• Рекомендуемая цена: ${pMin}–${pMax} ₽/кг\n`;
  return { html, text };
}

// ---------- рендер блоков ----------
function ingBlockHTML(title, targetG, items, extraRows) {
  let rows = items.map(i => {
    const note = i.egg ? `<td class="note">${eggNote(i.g)}</td>` : '<td class="note"></td>';
    return `<tr><td>${i.n}</td>${note}<td class="amt">${fmtG(i.g)}</td></tr>`;
  }).join('');
  if (extraRows) rows += extraRows;
  rows += `<tr class="total"><td>Итого</td><td></td><td class="amt">${fmtG(targetG)}</td></tr>`;
  return `<div class="block"><h3>${title} — ${fmtKg(targetG / 1000)}</h3><table class="ing">${rows}</table></div>`;
}

function techBlockHTML(title, steps) {
  return `<div class="block"><h3>${title}</h3><ol class="tech">${steps.map(s => `<li>${s}</li>`).join('')}</ol></div>`;
}

function ingBlockText(title, targetG, items, extraLines) {
  let out = `${title} — ${fmtKg(targetG / 1000)}\n`;
  for (const i of items) {
    out += `• ${i.n} — ${fmtG(i.g)}${i.egg ? ' (' + eggNote(i.g) + ')' : ''}\n`;
  }
  if (extraLines) out += extraLines;
  return out;
}

function extraFor(filling, targetG) {
  if (!filling.extra) return { row: '', line: '', item: null };
  const eg = filling.extra.per1000 * targetG / 1000;
  return {
    row: `<tr><td>${filling.extra.n}</td><td class="note"></td><td class="amt">${fmtG(eg)}</td></tr>`,
    line: `• ${filling.extra.n} — ${fmtG(eg)}\n`,
    item: { n: filling.extra.n, g: eg },
  };
}

function techListText(steps) {
  return steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
}

// ---------- главный пересчёт ----------
function render() {
  if (mode === 'prices') { renderPrices(); return; }

  const weightKg = Math.max(0.5, parseFloat($('inpWeight').value) || 0.5);
  const targetG = weightKg * 1000;
  let html = '', text = '';

  if (mode === 'dough') {
    const d = DOUGHS[$('selDough').value];
    const items = scale(d, targetG);
    const econ = econFor([{ label: 'Тесто', items }], targetG);
    html += `<h2>${d.name}</h2><div class="sub">${d.desc}</div>`;
    html += ingBlockHTML('Ингредиенты', targetG, items);
    html += econ.html;
    html += techBlockHTML('Технология', d.tech);
    text = d.name.toUpperCase() + `\n\n` + ingBlockText('Ингредиенты', targetG, items)
         + econ.text
         + `\nТехнология:\n` + techListText(d.tech);
  }

  else if (mode === 'farsh') {
    const f = FILLINGS[$('selFilling').value];
    const items = scale(f, targetG);
    const ex = extraFor(f, targetG);
    const econ = econFor([{ label: f.name, items: ex.item ? [...items, ex.item] : items }], targetG);
    html += `<h2>${f.name}</h2><div class="sub">Выход: ${fmtKg(weightKg)}</div>`;
    html += ingBlockHTML('Ингредиенты', targetG, items, ex.row);
    html += econ.html;
    html += techBlockHTML('Технология', f.tech);
    text = f.name.toUpperCase() + `\n\n` + ingBlockText('Ингредиенты', targetG, items, ex.line)
         + econ.text
         + `\nТехнология:\n` + techListText(f.tech);
  }

  else { // product
    const p = PRODUCTS[$('selProduct').value];
    const f = FILLINGS[$('selFilling').value];
    const pieces = Math.round(targetG / p.pieceG);

    if (p.doughShare > 0) {
      const dough = DOUGHS[p.dough];
      const share = Math.min(65, Math.max(35, parseFloat($('inpRatio').value) || p.doughShare));
      const doughG = targetG * share / 100;
      const fillG = targetG - doughG;
      const doughItems = scale(dough, doughG);
      const fillItems = scale(f, fillG);

      html += `<h2>${p.emoji} ${p.name} — ${fmtKg(weightKg)}</h2>`;
      html += `<div class="sub">≈ ${pieces} шт (${p.pieceNote}) · тесто ${share}% / начинка ${100 - share}%</div>`;
      const econ = econFor([
        { label: 'Тесто', items: doughItems },
        { label: 'Начинка', items: fillItems },
      ], targetG);
      html += ingBlockHTML(dough.name, doughG, doughItems);
      html += ingBlockHTML(f.name, fillG, fillItems);
      html += econ.html;
      html += techBlockHTML('Технология — тесто', dough.tech);
      html += techBlockHTML('Технология — начинка', f.tech);

      text = `${p.emoji} ${p.name.toUpperCase()} — ${fmtKg(weightKg)} (≈ ${pieces} шт)\n`
           + `Тесто ${share}% / начинка ${100 - share}%\n\n`
           + ingBlockText('ТЕСТО', doughG, doughItems) + '\n'
           + ingBlockText(f.name.toUpperCase(), fillG, fillItems)
           + econ.text
           + `\nТесто:\n` + techListText(dough.tech)
           + `\n\nНачинка:\n` + techListText(f.tech);
    } else {
      // котлеты: масса продукта = масса фарша, сухари сверху
      const fillItems = scale(f, targetG);
      const ex = extraFor(f, targetG);
      const econ = econFor([
        { label: f.name, items: ex.item ? [...fillItems, ex.item] : fillItems },
      ], targetG);
      html += `<h2>${p.emoji} ${p.name} — ${fmtKg(weightKg)}</h2>`;
      html += `<div class="sub">≈ ${pieces} шт (${p.pieceNote})</div>`;
      html += ingBlockHTML(f.name, targetG, fillItems, ex.row);
      html += econ.html;
      html += techBlockHTML('Технология', f.tech);

      text = `${p.emoji} ${p.name.toUpperCase()} — ${fmtKg(weightKg)} (≈ ${pieces} шт)\n\n`
           + ingBlockText(f.name.toUpperCase(), targetG, fillItems, ex.line)
           + econ.text
           + `\nТехнология:\n` + techListText(f.tech);
    }
  }

  $('result').innerHTML = html;
  lastCopyText = text;
}

// ---------- вкладка «Цены» ----------
function renderPrices() {
  const inp = (attr, val, step) =>
    `<input type="number" min="0" step="${step}" ${attr} value="${val}" style="width:110px;text-align:right">`;
  const rows = Object.keys(PRICES_DEFAULT)
    .map(k => `<tr><td>${k}</td><td class="note"></td><td class="amt">${inp(`data-pricekey="${k}"`, PRICES[k], 5)}</td></tr>`)
    .join('');
  $('result').innerHTML =
    `<h2>💰 Цены и наценка</h2>` +
    `<div class="sub">₽ за 1 кг. Что не считаем в себестоимости — оставь 0. Изменения сохраняются в этом браузере автоматически.</div>` +
    `<div class="block"><h3>Наценка при продаже (×)</h3><table class="ing">` +
    `<tr><td>Минимальная</td><td class="note"></td><td class="amt">${inp('data-markup="min"', MARKUP.min, 0.1)}</td></tr>` +
    `<tr><td>Максимальная</td><td class="note"></td><td class="amt">${inp('data-markup="max"', MARKUP.max, 0.1)}</td></tr>` +
    `</table></div>` +
    `<div class="block"><h3>Цены ингредиентов, ₽/кг</h3><table class="ing">${rows}</table></div>` +
    `<button id="resetPrices" style="padding:9px 14px;border:1px solid var(--line);border-radius:8px;background:var(--accent-soft);color:var(--accent);font-weight:600;cursor:pointer">↺ Сбросить к исходным</button>`;
  lastCopyText = 'ЦЕНЫ, ₽/КГ\n' +
    Object.keys(PRICES_DEFAULT).filter(k => PRICES[k] > 0).map(k => `• ${k} — ${PRICES[k]} ₽`).join('\n');
}

function savePrices() {
  localStorage.setItem(PRICES_LS, JSON.stringify({ prices: PRICES, markup: MARKUP }));
}

// ---------- селекторы ----------
function fillProductSelect() {
  const prev = $('selProduct').value;
  $('selProduct').innerHTML = Object.entries(PRODUCTS)
    .map(([k, p]) => `<option value="${k}">${p.emoji} ${p.name}</option>`).join('');
  if (PRODUCTS[prev]) $('selProduct').value = prev;
}

function fillFillingSelect() {
  const keys = (mode === 'farsh') ? FARSH_ONLY : PRODUCTS[$('selProduct').value].fillings;
  $('selFilling').innerHTML = keys
    .map(k => `<option value="${k}">${FILLINGS[k].name}</option>`).join('');
}

function fillDoughSelect() {
  $('selDough').innerHTML = Object.entries(DOUGHS)
    .map(([k, d]) => `<option value="${k}">${d.name}</option>`).join('');
}

function updateVisibility() {
  $('controls').style.display = (mode === 'prices') ? 'none' : '';
  document.querySelector('.actions').style.display = (mode === 'prices') ? 'none' : '';
  if (mode === 'prices') return;
  const p = PRODUCTS[$('selProduct').value];
  const withDough = mode === 'product' && p.doughShare > 0;
  $('selProduct').parentElement.style.display = (mode === 'product') ? '' : 'none';
  $('fieldFilling').style.display = (mode !== 'dough') ? '' : 'none';
  $('fieldDough').style.display = (mode === 'dough') ? '' : 'none';
  $('fieldRatio').style.display = withDough ? '' : 'none';
  $('lblWeight').textContent =
    mode === 'dough' ? 'Сколько теста, кг' :
    mode === 'farsh' ? 'Сколько фарша / начинки, кг' : 'Сколько продукта, кг';
  if (withDough) $('inpRatio').value = p.doughShare;
}

// ---------- события ----------
function bindEvents() {
  document.querySelectorAll('.tabs button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      mode = b.dataset.mode;
      history.replaceState(null, '', '#' + mode);
      fillProductSelect();
      fillFillingSelect();
      updateVisibility();
      render();
    });
  });

  $('selProduct').addEventListener('change', () => { fillFillingSelect(); updateVisibility(); render(); });
  $('selFilling').addEventListener('change', render);
  $('selDough').addEventListener('change', render);
  $('inpRatio').addEventListener('input', render);
  $('inpWeight').addEventListener('input', render);
  $('btnMinus').addEventListener('click', () => {
    $('inpWeight').value = Math.max(0.5, (parseFloat($('inpWeight').value) || 0.5) - 0.5);
    render();
  });
  $('btnPlus').addEventListener('click', () => {
    $('inpWeight').value = (parseFloat($('inpWeight').value) || 0) + 0.5;
    render();
  });

  // редактор цен: правки инпутов сохраняем сразу
  $('result').addEventListener('input', e => {
    const t = e.target;
    if (t.dataset && t.dataset.pricekey !== undefined && t.dataset.pricekey !== '') {
      PRICES[t.dataset.pricekey] = parseFloat(t.value) || 0;
      savePrices();
    } else if (t.dataset && t.dataset.markup) {
      MARKUP[t.dataset.markup] = parseFloat(t.value) || MARKUP_DEFAULT[t.dataset.markup];
      savePrices();
    }
  });
  $('result').addEventListener('click', e => {
    if (e.target.id === 'resetPrices') {
      localStorage.removeItem(PRICES_LS);
      PRICES = { ...PRICES_DEFAULT };
      MARKUP = { ...MARKUP_DEFAULT };
      renderPrices();
    }
  });

  $('printBtn').addEventListener('click', () => window.print());
  $('copyBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(lastCopyText);
    } catch (e) {
      // fallback для http без clipboard API
      const ta = document.createElement('textarea');
      ta.value = lastCopyText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    const btn = $('copyBtn');
    btn.classList.add('copied');
    btn.textContent = '✅ Скопировано';
    setTimeout(() => { btn.classList.remove('copied'); btn.textContent = '📋 Скопировать'; }, 1500);
  });
}

// ---------- старт ----------
async function init() {
  try {
    const resp = await fetch('data/recipes.json');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    DOUGHS = data.doughs;
    FILLINGS = data.fillings;
    PRODUCTS = data.products;
    FARSH_ONLY = data.farshOnly;

    const pResp = await fetch('data/prices.json');
    if (pResp.ok) {
      const pData = await pResp.json();
      PRICES_DEFAULT = pData.prices || {};
      MARKUP_DEFAULT = pData.markup || MARKUP_DEFAULT;
    }
    PRICES = { ...PRICES_DEFAULT };
    MARKUP = { ...MARKUP_DEFAULT };
    try {
      const saved = JSON.parse(localStorage.getItem(PRICES_LS));
      if (saved) {
        PRICES = { ...PRICES_DEFAULT, ...saved.prices };
        MARKUP = { ...MARKUP_DEFAULT, ...saved.markup };
      }
    } catch (e) { /* битые сохранённые цены игнорируем */ }
  } catch (e) {
    $('result').innerHTML =
      `<p class="error">Не удалось загрузить data/recipes.json (${e.message}).<br>` +
      `Открой страницу через http-сервер, а не как файл.</p>`;
    return;
  }
  fillProductSelect();
  fillFillingSelect();
  fillDoughSelect();
  bindEvents();
  // открытие вкладки по хэшу: #farsh, #dough, #prices
  const hashTab = document.querySelector(`.tabs button[data-mode="${location.hash.slice(1)}"]`);
  if (hashTab) { hashTab.click(); return; }
  updateVisibility();
  render();
}

init();

// счётчик просмотров в футере (публичный API GoatCounter)
fetch('https://gmaker.goatcounter.com/counter/TOTAL.json')
  .then(r => r.ok ? r.json() : Promise.reject())
  .then(d => {
    $('viewsNum').textContent = d.count;
    $('views').style.display = '';
  })
  .catch(() => { /* счётчик недоступен — просто не показываем */ });
