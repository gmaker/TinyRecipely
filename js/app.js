// TinyRecipely — калькулятор рецептур.
// Все рецептуры лежат в data/recipes.json (раскладки на 1000 г готовой массы).

let DOUGHS, FILLINGS, PRODUCTS, FARSH_ONLY;

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
  if (!filling.extra) return { row: '', line: '' };
  const eg = filling.extra.per1000 * targetG / 1000;
  return {
    row: `<tr><td>${filling.extra.n}</td><td class="note"></td><td class="amt">${fmtG(eg)}</td></tr>`,
    line: `• ${filling.extra.n} — ${fmtG(eg)}\n`,
  };
}

function techListText(steps) {
  return steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
}

// ---------- главный пересчёт ----------
function render() {
  const weightKg = Math.max(0.5, parseFloat($('inpWeight').value) || 0.5);
  const targetG = weightKg * 1000;
  let html = '', text = '';

  if (mode === 'dough') {
    const d = DOUGHS[$('selDough').value];
    const items = scale(d, targetG);
    html += `<h2>${d.name}</h2><div class="sub">${d.desc}</div>`;
    html += ingBlockHTML('Ингредиенты', targetG, items);
    html += techBlockHTML('Технология', d.tech);
    text = d.name.toUpperCase() + `\n\n` + ingBlockText('Ингредиенты', targetG, items)
         + `\nТехнология:\n` + techListText(d.tech);
  }

  else if (mode === 'farsh') {
    const f = FILLINGS[$('selFilling').value];
    const items = scale(f, targetG);
    const ex = extraFor(f, targetG);
    html += `<h2>${f.name}</h2><div class="sub">Выход: ${fmtKg(weightKg)}</div>`;
    html += ingBlockHTML('Ингредиенты', targetG, items, ex.row);
    html += techBlockHTML('Технология', f.tech);
    text = f.name.toUpperCase() + `\n\n` + ingBlockText('Ингредиенты', targetG, items, ex.line)
         + `\nТехнология:\n` + techListText(f.tech);
  }

  else if (mode === 'fromFarsh') {
    // есть заготовка фарша (мясо + лук) — считаем добавки в него и тесто под него
    const p = PRODUCTS[$('selProduct').value];
    const dough = DOUGHS[p.dough];
    const f = FILLINGS[$('selFilling').value];
    const share = Math.min(65, Math.max(35, parseFloat($('inpRatio').value) || p.doughShare));

    const baseItems = f.items.filter(i => i.base);
    let additions = [], fillG;
    if (baseItems.length) {
      const baseSum = baseItems.reduce((s, i) => s + i.g, 0);
      const k = targetG / baseSum;
      additions = f.items.filter(i => !i.base).map(i => ({ ...i, g: i.g * k }));
      fillG = targetG + additions.reduce((s, i) => s + i.g, 0);
    } else {
      fillG = targetG; // начинка без базы (картошка и т.п.) — считаем готовой
    }

    const doughG = fillG * share / (100 - share);
    const totalG = fillG + doughG;
    const pieces = Math.round(totalG / p.pieceG);
    const doughItems = scale(dough, doughG);

    html += `<h2>${p.emoji} ${p.name}: к ${fmtKg(weightKg)} фарша-базы</h2>`;
    html += `<div class="sub">База — мясо с луком. Фарш с добавками: <b>${fmtG(fillG)}</b> · теста нужно: <b>${fmtG(doughG)}</b> · выход ≈ ${fmtKg(totalG / 1000)} (≈ ${pieces} шт, ${p.pieceNote}) · тесто ${share}% / начинка ${100 - share}%</div>`;

    let farshText = '';
    if (additions.length) {
      const farshItems = [{ n: 'Фарш мясо + лук (уже готов)', g: targetG }, ...additions];
      html += ingBlockHTML(`Добавить в фарш (${f.name})`, fillG, farshItems);
      farshText = ingBlockText(`ДОБАВИТЬ В ФАРШ (${f.name})`, fillG, farshItems) + '\n';
    }
    html += ingBlockHTML(dough.name, doughG, doughItems);
    if (additions.length) html += techBlockHTML('Технология — фарш', f.tech);
    html += techBlockHTML('Технология — тесто', dough.tech);

    text = `${p.emoji} ${p.name.toUpperCase()}: К ${fmtKg(weightKg)} ФАРША-БАЗЫ (МЯСО + ЛУК)\n`
         + `Фарш с добавками: ${fmtG(fillG)} · теста нужно: ${fmtG(doughG)} · выход ≈ ${fmtKg(totalG / 1000)} (≈ ${pieces} шт)\n\n`
         + farshText
         + ingBlockText('ТЕСТО', doughG, doughItems)
         + (additions.length ? `\nФарш:\n` + techListText(f.tech) + '\n' : '')
         + `\nТесто:\n` + techListText(dough.tech);
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
      html += ingBlockHTML(dough.name, doughG, doughItems);
      html += ingBlockHTML(f.name, fillG, fillItems);
      html += techBlockHTML('Технология — тесто', dough.tech);
      html += techBlockHTML('Технология — начинка', f.tech);

      text = `${p.emoji} ${p.name.toUpperCase()} — ${fmtKg(weightKg)} (≈ ${pieces} шт)\n`
           + `Тесто ${share}% / начинка ${100 - share}%\n\n`
           + ingBlockText('ТЕСТО', doughG, doughItems) + '\n'
           + ingBlockText(f.name.toUpperCase(), fillG, fillItems)
           + `\nТесто:\n` + techListText(dough.tech)
           + `\n\nНачинка:\n` + techListText(f.tech);
    } else {
      // котлеты: масса продукта = масса фарша, сухари сверху
      const fillItems = scale(f, targetG);
      const ex = extraFor(f, targetG);
      html += `<h2>${p.emoji} ${p.name} — ${fmtKg(weightKg)}</h2>`;
      html += `<div class="sub">≈ ${pieces} шт (${p.pieceNote})</div>`;
      html += ingBlockHTML(f.name, targetG, fillItems, ex.row);
      html += techBlockHTML('Технология', f.tech);

      text = `${p.emoji} ${p.name.toUpperCase()} — ${fmtKg(weightKg)} (≈ ${pieces} шт)\n\n`
           + ingBlockText(f.name.toUpperCase(), targetG, fillItems, ex.line)
           + `\nТехнология:\n` + techListText(f.tech);
    }
  }

  $('result').innerHTML = html;
  lastCopyText = text;
}

// ---------- селекторы ----------
function fillProductSelect() {
  // в режиме «Тесто к фаршу» показываем только продукты с тестом
  const entries = Object.entries(PRODUCTS)
    .filter(([k, p]) => mode !== 'fromFarsh' || p.doughShare > 0);
  const prev = $('selProduct').value;
  $('selProduct').innerHTML = entries
    .map(([k, p]) => `<option value="${k}">${p.emoji} ${p.name}</option>`).join('');
  if (entries.some(([k]) => k === prev)) $('selProduct').value = prev;
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
  const p = PRODUCTS[$('selProduct').value];
  const withDough = (mode === 'product' || mode === 'fromFarsh') && p.doughShare > 0;
  $('selProduct').parentElement.style.display = (mode === 'product' || mode === 'fromFarsh') ? '' : 'none';
  $('fieldFilling').style.display = (mode !== 'dough') ? '' : 'none';
  $('fieldDough').style.display = (mode === 'dough') ? '' : 'none';
  $('fieldRatio').style.display = withDough ? '' : 'none';
  $('lblWeight').textContent =
    mode === 'dough' ? 'Сколько теста, кг' :
    mode === 'farsh' ? 'Сколько фарша / начинки, кг' :
    mode === 'fromFarsh' ? 'Сколько фарша (мясо + лук), кг' : 'Сколько продукта, кг';
  if (withDough) $('inpRatio').value = p.doughShare;
}

// ---------- события ----------
function bindEvents() {
  document.querySelectorAll('.tabs button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      mode = b.dataset.mode;
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
  updateVisibility();
  render();
}

init();
