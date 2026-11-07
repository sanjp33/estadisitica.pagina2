"use strict";

const $ = id => document.getElementById(id);
const sectors = ["Alimentos", "Comercio", "Servicios"];
const channels = ["Ninguno", "Redes sociales", "Volantes", "Radio local"];
const promotions = ["Ninguna", "Descuento", "Combo"];

const variables = [
  { key: "sector", label: "Sector", type: "Nominal", question: "¿Cuál es la actividad principal del negocio?", coding: "Alimentos; Comercio; Servicios.", categories: sectors },
  { key: "months", label: "Antigüedad (meses)", type: "Cuantitativa discreta", question: "¿Cuántos meses completos lleva funcionando?", coding: "Número entero de meses.", unit: "meses" },
  { key: "employees", label: "Trabajadores", type: "Cuantitativa discreta", question: "¿Cuántas personas trabajan, incluyendo al propietario?", coding: "Número entero de personas.", unit: "personas" },
  { key: "channel", label: "Canal principal", type: "Nominal", question: "¿Cuál fue su principal canal de publicidad pagada el último mes?", coding: "Ninguno; Redes sociales; Volantes; Radio local.", categories: channels },
  { key: "ad", label: "Gasto publicitario (C$)", type: "Cuantitativa continua", question: "¿Cuánto gastó en publicidad pagada el último mes?", coding: "Córdobas; cero si no pagó publicidad.", unit: "C$" },
  { key: "posts", label: "Publicaciones", type: "Cuantitativa discreta", question: "¿Cuántas publicaciones del negocio realizó en redes el último mes?", coding: "Número entero.", unit: "publicaciones" },
  { key: "promo", label: "Promoción principal", type: "Nominal", question: "¿Qué promoción utilizó durante más días el último mes?", coding: "Ninguna; Descuento; Combo.", categories: promotions },
  { key: "discount", label: "Descuento máximo (%)", type: "Cuantitativa continua", question: "¿Cuál fue el mayor descuento explícito aplicado?", coding: "Porcentaje de 0 a 100.", unit: "%" },
  { key: "days", label: "Días de promoción", type: "Cuantitativa discreta", question: "¿Durante cuántos días aplicó su promoción principal?", coding: "Entero de 0 a 30.", unit: "días" },
  { key: "customers", label: "Clientes por día", type: "Cuantitativa continua", question: "¿Cuál fue el promedio de clientes atendidos por día de apertura?", coding: "Promedio diario.", unit: "clientes/día" },
  { key: "previous", label: "Ventas anteriores (C$)", type: "Cuantitativa continua", question: "¿Cuánto vendió en total el mes anterior?", coding: "Ingresos en córdobas.", unit: "C$" },
  { key: "sales", label: "Ventas actuales (C$)", type: "Cuantitativa continua", question: "¿Cuánto vendió en total el último mes completo?", coding: "Ingresos en córdobas.", unit: "C$" },
  { key: "satisfaction", label: "Satisfacción", type: "Ordinal", question: "¿Qué tan satisfecho está con sus ventas?", coding: "1 al 5.", categories: [1, 2, 3, 4, 5] },
  { key: "records", label: "Registro de ventas", type: "Nominal", question: "¿Lleva un registro escrito o digital de sus ventas?", coding: "Sí; No.", categories: ["Sí", "No"] }
];

const derived = [
  { key: "growth", label: "Cambio de ventas (%)", type: "Cuantitativa continua", unit: "%" },
  { key: "grew", label: "Crecimiento de ventas", type: "Nominal", categories: ["No creció", "Creció"] }
];

const allVariables = [...variables, ...derived];
const quantitative = allVariables.filter(v => !v.categories);
const categorical = allVariables.filter(v => v.categories);
const meta = key => allVariables.find(v => v.key === key);

let data = [];
let visible = [];
let sortKey = "id";
let sortAscending = true;
let model = null;

const numberFormat = new Intl.NumberFormat("es-NI", { maximumFractionDigits: 2 });

function fmt(value, digits = 2) {
  if (!Number.isFinite(value)) return "No disponible";
  return new Intl.NumberFormat("es-NI", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

function table(headers, rows) {
  return `<table><thead><tr>${headers.map(h => `<th>${escapeHTML(h)}</th>`).join("")}</tr></thead><tbody>${
    rows.length ? rows.map(row => `<tr>${row.map(cell => `<td>${escapeHTML(cell)}</td>`).join("")}</tr>`).join("") :
    `<tr><td colspan="${headers.length}">No hay datos válidos.</td></tr>`
  }</tbody></table>`;
}

function values(key) {
  return visible.map(row => row[key]).filter(Number.isFinite);
}

function mean(a) {
  return a.length ? a.reduce((sum, x) => sum + x, 0) / a.length : NaN;
}

function quantile(sorted, p) {
  if (!sorted.length) return NaN;
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return sorted[lower] + fraction * (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]);
}

function stats(a) {
  const sorted = [...a].sort((x, y) => x - y);
  const n = a.length;
  const average = mean(a);
  const variance = n > 1 ? a.reduce((sum, x) => sum + (x - average) ** 2, 0) / (n - 1) : NaN;
  const counts = new Map();
  a.forEach(x => counts.set(x, (counts.get(x) || 0) + 1));
  const highest = Math.max(0, ...counts.values());
  const modes = highest > 1 ? [...counts].filter(([, count]) => count === highest).map(([x]) => x) : [];
  return { n, mean: average, variance, sd: Math.sqrt(variance), min: n ? sorted[0] : NaN, max: n ? sorted[n - 1] : NaN, median: quantile(sorted, .5), q1: quantile(sorted, .25), q3: quantile(sorted, .75), modes, highest };
}

const random = (min, max) => min + Math.random() * (max - min);
const choose = a => a[Math.floor(Math.random() * a.length)];
const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
const rounded = (x, digits = 2) => Number(x.toFixed(digits));

function normal() {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function generate() {
  const requested = Number($("sampleSize")?.value);
  const n = Number.isFinite(requested) ? clamp(Math.round(requested), 40, 500) : 80;
  if ($("sampleSize")) $("sampleSize").value = n;

  data = Array.from({ length: n }, (_, i) => {
    const sector = choose(sectors);
    const employees = Math.floor(random(1, 9));
    const months = Math.floor(random(6, 145));
    const channel = choose(channels);
    const ad = channel === "Ninguno" ? 0 : rounded(random(250, 4800) + employees * random(20, 150));
    const posts = channel === "Redes sociales" ? Math.floor(random(8, 39)) : Math.floor(random(0, 18));
    const promo = choose(promotions);
    const discount = promo === "Descuento" ? Math.floor(random(5, 26)) : 0;
    const days = promo === "Ninguna" ? 0 : Math.floor(random(3, 25));
    const previous = rounded(11000 + employees * random(2800, 6500) + random(3000, 38000));
    const sectorEffect = sector === "Alimentos" ? .025 : sector === "Servicios" ? -.015 : 0;
    const growthRate = -.07 + ad / 33000 + (promo === "Ninguna" ? 0 : .045) + sectorEffect + normal() * .16;
    const sales = rounded(Math.max(4000, previous * (1 + growthRate)));
    const growth = 100 * (sales - previous) / previous;
    const ticket = sector === "Alimentos" ? random(80, 180) : sector === "Servicios" ? random(180, 420) : random(120, 300);
    const customers = rounded(sales / (ticket * 26), 1);
    const satisfaction = clamp(Math.round(3 + growth / 18 + normal() * .85), 1, 5);

    return {
      id: `N${String(i + 1).padStart(3, "0")}`,
      sector, months, employees, channel, ad, posts, promo, discount, days,
      customers, previous, sales, satisfaction,
      records: Math.random() < .7 ? "Sí" : "No",
      growth, grew: growth > 0 ? "Creció" : "No creció"
    };
  });

  applyFilters();
  if ($("status")) $("status").textContent = `Se generaron ${n} negocios sintéticos.`;
}

function populateSelect(id, list, selected) {
  const el = $(id);
  if (!el) return;
  el.innerHTML = list.map(v => `<option value="${escapeHTML(v.key)}">${escapeHTML(v.label)}</option>`).join("");
  if (selected) el.value = selected;
}

function setup() {
  if ($("questionnaire")) {
    $("questionnaire").innerHTML = table(
      ["N.º", "Pregunta", "Variable", "Tipo", "Codificación"],
      variables.map((v, i) => [i + 1, v.question, v.key, v.type, v.coding])
    );
  }

  if ($("sectorFilter")) {
    $("sectorFilter").innerHTML = '<option value="">Todos los sectores</option>' + sectors.map(x => `<option>${x}</option>`).join("");
  }
  if ($("promoFilter")) {
    $("promoFilter").innerHTML = '<option value="">Todas las promociones</option>' + promotions.map(x => `<option>${x}</option>`).join("");
  }

  populateSelect("freqVar", allVariables, "channel");
  populateSelect("descVar", quantitative, "sales");
  populateSelect("chiRow", categorical, "promo");
  populateSelect("chiCol", categorical, "grew");
  populateSelect("xVar", quantitative, "ad");
  populateSelect("yVar", quantitative, "sales");

  // Event Listeners seguros con comprobación de existencia
  const addEv = (id, event, fn) => { const el = $(id); if (el) el.addEventListener(event, fn); };

  addEv("generate", "click", generate);
  addEv("download", "click", downloadCSV);
  addEv("print", "click", () => window.print());
  addEv("search", "input", applyFilters);
  addEv("sectorFilter", "change", applyFilters);
  addEv("promoFilter", "change", applyFilters);

  addEv("clear", "click", () => {
    if ($("search")) $("search").value = "";
    if ($("sectorFilter")) $("sectorFilter").value = "";
    if ($("promoFilter")) $("promoFilter").value = "";
    applyFilters();
  });

  ["freqVar", "descVar", "chiRow", "chiCol", "xVar", "yVar"].forEach(id => {
    addEv(id, "change", render);
  });

  addEv("predict", "click", predict);
  addEv("prediction", "keydown", event => { if (event.key === "Enter") predict(); });

  generate();
}

function applyFilters() {
  const term = $("search") ? $("search").value.trim().toLocaleLowerCase("es") : "";
  const sectorVal = $("sectorFilter") ? $("sectorFilter").value : "";
  const promoVal = $("promoFilter") ? $("promoFilter").value : "";

  visible = data.filter(row => {
    const matchesSearch = !term || [row.id, row.sector, row.channel, row.promo, row.records, row.grew].some(value => String(value).toLocaleLowerCase("es").includes(term));
    return matchesSearch && (!sectorVal || row.sector === sectorVal) && (!promoVal || row.promo === promoVal);
  });

  render();
}

function render() {
  renderData();
  renderMetrics();
  renderFrequency();
  renderDescriptive();
  renderChi();
  renderRegression();
  renderCharts();
  renderConclusions();
}

function renderData() {
  visible.sort((a, b) => {
    const comparison = typeof a[sortKey] === "number" ? a[sortKey] - b[sortKey] : String(a[sortKey]).localeCompare(String(b[sortKey]), "es");
    return sortAscending ? comparison : -comparison;
  });

  const cols = [{ key: "id", label: "Negocio" }, ...allVariables];
  if ($("rowCount")) $("rowCount").textContent = `${visible.length} de ${data.length} negocios seleccionados.`;

  if ($("dataTable")) {
    $("dataTable").innerHTML = `<table><thead><tr>${cols.map(v => {
      const selected = sortKey === v.key;
      return `<th aria-sort="${selected ? (sortAscending ? "ascending" : "descending") : "none"}">
        <button data-sort="${v.key}">${escapeHTML(v.label)} ${selected ? (sortAscending ? "↑" : "↓") : "↕"}</button></th>`;
    }).join("")}</tr></thead><tbody>${
      visible.length ? visible.map(row => `<tr>${cols.map(v => {
        const val = row[v.key];
        return `<td>${escapeHTML(val == null ? "Faltante" : typeof val === "number" ? numberFormat.format(val) : val)}</td>`;
      }).join("")}</tr>`).join("") : `<tr><td colspan="${cols.length}">No hay registros con estos filtros.</td></tr>`
    }</tbody></table>`;

    $("dataTable").querySelectorAll("[data-sort]").forEach(button => {
      button.addEventListener("click", () => {
        const key = button.dataset.sort;
        sortAscending = key === sortKey ? !sortAscending : true;
        sortKey = key;
        renderData();
      });
    });
  }
}

function renderMetrics() {
  if (!$("metrics")) return;
  const cards = [
    ["Negocios seleccionados", visible.length],
    ["Ventas promedio (C$)", fmt(mean(values("sales")))],
    ["Publicidad promedio (C$)", fmt(mean(values("ad")))],
    ["Cambio promedio (%)", fmt(mean(values("growth")))]
  ];
  $("metrics").innerHTML = cards.map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function grouped(a) {
  if (!a.length) return [];
  const min = Math.min(...a), max = Math.max(...a);
  if (min === max) return [{ low: min, high: max, mark: min, count: a.length }];
  const k = Math.min(12, Math.ceil(1 + Math.log2(a.length)));
  const width = (max - min) / k;
  const bins = Array.from({ length: k }, (_, i) => ({
    low: min + i * width,
    high: i === k - 1 ? max : min + (i + 1) * width,
    mark: min + (i + .5) * width,
    count: 0
  }));
  a.forEach(x => {
    const index = Math.min(k - 1, Math.floor((x - min) / width));
    bins[index].count++;
  });
  return bins;
}

function countsFor(key) {
  const v = meta(key);
  return v.categories.map(label => ({ label: String(label), count: visible.filter(row => row[key] === label).length }));
}

function renderFrequency() {
  const freqVarEl = $("freqVar");
  if (!freqVarEl || !$("freqTable")) return;
  const key = freqVarEl.value;
  const v = meta(key);
  let cumulative = 0;

  if (v.categories) {
    const counts = countsFor(key);
    const n = counts.reduce((sum, item) => sum + item.count, 0);
    const ordinal = v.type === "Ordinal";
    const rows = counts.map(item => {
      cumulative += item.count;
      return [item.label, item.count, n ? fmt(item.count / n, 4) : "—", n ? fmt(100 * item.count / n) + "%" : "—", ...(ordinal ? [cumulative, n ? fmt(100 * cumulative / n) + "%" : "—"] : [])];
    });
    $("freqTable").innerHTML = table(["Categoría", "fi", "hi", "%", ...(ordinal ? ["Fi", "% acumulado"] : [])], rows);
    const top = [...counts].sort((a, b) => b.count - a.count)[0];
    if ($("freqExplanation")) {
      $("freqExplanation").textContent = n ? `${v.label}: se analizaron ${n} respuestas válidas. La categoría más frecuente es ${top.label} (${top.count} negocios, ${fmt(100 * top.count / n)}%).` : "No hay respuestas válidas.";
    }
  } else {
    const a = values(key);
    const bins = grouped(a);
    $("freqTable").innerHTML = table(
      ["Intervalo", "Marca de clase", "fi", "hi", "%", "Fi", "% acumulado"],
      bins.map((b, i) => {
        cumulative += b.count;
        return [`[${fmt(b.low)}; ${fmt(b.high)}${i === bins.length - 1 ? "]" : ")"}`, fmt(b.mark), b.count, fmt(b.count / a.length, 4), fmt(100 * b.count / a.length) + "%", cumulative, fmt(100 * cumulative / a.length) + "%"];
      })
    );
    if ($("freqExplanation")) $("freqExplanation").textContent = a.length ? `Se agruparon ${a.length} valores en ${bins.length} clases.` : "No hay valores numéricos.";
  }
}

function renderDescriptive() {
  const descVarEl = $("descVar");
  if (!descVarEl || !$("descTable")) return;
  const key = descVarEl.value;
  const v = meta(key);
  const s = stats(values(key));
  const mode = !s.modes.length ? "Sin moda" : s.modes.map(x => fmt(x)).join("; ");

  $("descTable").innerHTML = table(["Estadístico", "Resultado"], [
    ["n válido", s.n], ["Media", fmt(s.mean)], ["Mediana", fmt(s.median)], ["Moda", mode],
    ["Mínimo", fmt(s.min)], ["Máximo", fmt(s.max)], ["Desviación estándar", fmt(s.sd)]
  ]);
  if ($("descExplanation")) $("descExplanation").textContent = s.n ? `Para ${v.label}, la media es ${fmt(s.mean)} y la mediana ${fmt(s.median)}.` : "No hay datos válidos.";
}

function logGamma(z) {
  const c = [676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905, -.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7];
  if (z < .5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  z--;
  let x = .9999999999998099;
  c.forEach((val, i) => { x += val / (z + i + 1); });
  const t = z + c.length - .5;
  return .5 * Math.log(2 * Math.PI) + (z + .5) * Math.log(t) - t + Math.log(x);
}

function gammaQ(a, x) {
  if (!(a > 0) || x < 0) return NaN;
  if (x === 0) return 1;
  const factor = Math.exp(-x + a * Math.log(x) - logGamma(a));
  let sum = 1 / a, delta = sum, ap = a;
  for (let i = 1; i <= 100; i++) { delta *= x / ++ap; sum += delta; }
  return clamp(1 - sum * factor, 0, 1);
}

function formatP(p) { return !Number.isFinite(p) ? "No disponible" : p < .0001 ? "< 0.0001" : p.toFixed(4); }

function renderChi() {
  const chiRowEl = $("chiRow"), chiColEl = $("chiCol");
  if (!chiRowEl || !chiColEl || !$("chiTable")) return;
  const rowKey = chiRowEl.value, colKey = chiColEl.value;
  if (rowKey === colKey) {
    $("chiTable").innerHTML = "";
    if ($("chiResult")) $("chiResult").textContent = "Selecciona dos variables diferentes.";
    return;
  }
  const pairs = visible.filter(r => meta(rowKey).categories.includes(r[rowKey]) && meta(colKey).categories.includes(r[colKey]));
  const rows = meta(rowKey).categories.filter(x => pairs.some(r => r[rowKey] === x));
  const cols = meta(colKey).categories.filter(x => pairs.some(r => r[colKey] === x));
  if (rows.length < 2 || cols.length < 2) return;
  const observed = rows.map(a => cols.map(b => pairs.filter(r => r[rowKey] === a && r[colKey] === b).length));
  const rowTotals = observed.map(r => r.reduce((a, b) => a + b, 0));
  const colTotals = cols.map((_, j) => observed.reduce((sum, r) => sum + r[j], 0));
  const n = pairs.length;
  let chi = 0;
  observed.forEach((r, i) => r.forEach((o, j) => {
    const expected = (rowTotals[i] * colTotals[j]) / (n || 1);
    if (expected > 0) chi += (o - expected) ** 2 / expected;
  }));
  const df = (rows.length - 1) * (cols.length - 1);
  const p = gammaQ(df / 2, chi / 2);
  if ($("chiResult")) $("chiResult").innerHTML = `<div class="result">χ² = ${fmt(chi, 4)} · gl = ${df} · p = ${formatP(p)} · n = ${n}</div>`;
}

function regression(xKey, yKey) {
  const pairs = visible.filter(r => Number.isFinite(r[xKey]) && Number.isFinite(r[yKey]));
  if (pairs.length < 3 || xKey === yKey) return null;
  const x = pairs.map(r => r[xKey]), y = pairs.map(r => r[yKey]);
  const mx = mean(x), my = mean(y);
  const sxx = x.reduce((sum, v) => sum + (v - mx) ** 2, 0);
  const syy = y.reduce((sum, v) => sum + (v - my) ** 2, 0);
  const sxy = x.reduce((sum, v, i) => sum + (v - mx) * (y[i] - my), 0);
  if (sxx <= 0 || syy <= 0) return null;
  const slope = sxy / sxx, intercept = my - slope * mx;
  const r = clamp(sxy / Math.sqrt(sxx * syy), -1, 1);
  return { pairs, xKey, yKey, slope, intercept, r, r2: r * r, minX: Math.min(...x), maxX: Math.max(...x), minY: Math.min(...y), maxY: Math.max(...y) };
}

function renderRegression() {
  const xVarEl = $("xVar"), yVarEl = $("yVar");
  if (!xVarEl || !yVarEl) return;
  model = regression(xVarEl.value, yVarEl.value);
  if ($("predictionResult")) $("predictionResult").textContent = "";

  if (!model) {
    if ($("regResult")) $("regResult").textContent = "No se puede estimar el modelo.";
    if ($("predict")) $("predict").disabled = true;
    return;
  }
  if ($("predict")) $("predict").disabled = false;
  const m = model;
  if ($("regResult")) {
    $("regResult").innerHTML = `<div class="result">Pearson r = ${fmt(m.r, 4)} · R² = ${fmt(m.r2, 4)} · n = ${m.pairs.length}<br>Ŷ = ${fmt(m.intercept, 4)} + ${fmt(m.slope, 4)} × X</div>`;
  }
  if ($("prediction")) {
    $("prediction").min = m.minX;
    $("prediction").max = m.maxX;
    $("prediction").value = rounded(mean(m.pairs.map(r => r[m.xKey])), 4);
  }
}

function predict() {
  if (!model || !$("prediction")) return;
  const raw = $("prediction").value.trim();
  const x = Number(raw);
  if (!Number.isFinite(x)) return;
  const y = model.intercept + model.slope * x;
  if ($("predictionResult")) $("predictionResult").textContent = `Estimación: ${fmt(y)}`;
}

const W = 720, H = 380, left = 85, right = 25, top = 32, bottom = 95;
const plotW = W - left - right, plotH = H - top - bottom;
const palette = ["#1A4A5E", "#4E876D", "#E5B239", "#64748B", "#8C6200"];

function svg(content, title) {
  return `<svg viewBox="0 0 ${W} ${H}" role="img"><title>${escapeHTML(title)}</title>${content}</svg>`;
}

function emptyChart(id) { const el = $(id); if (el) el.innerHTML = svg(`<text x="${W/2}" y="${H/2}" text-anchor="middle" fill="#64748B">Sin datos</text>`, "Vacío"); }

function axes(maxY, xLabel, yLabel) {
  let result = "";
  const upper = maxY > 0 ? maxY : 1;
  for (let i = 0; i <= 4; i++) {
    const y = top + plotH - i * plotH / 4;
    result += `<line x1="${left}" y1="${y}" x2="${W - right}" y2="${y}" stroke="#E2E8ED"/>`;
    result += `<text x="${left - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="#64748B">${fmt(i * upper / 4, 1)}</text>`;
  }
  return result;
}

function barChart(id, items, xLabel, yLabel) {
  const el = $(id);
  if (!el || !items.length) { emptyChart(id); return; }
  const maximum = Math.max(...items.map(item => item.value)) * 1.15;
  let out = axes(maximum, xLabel, yLabel);
  const width = plotW / items.length;

  items.forEach((item, i) => {
    const x = left + i * width + width * .15;
    const h = (item.value / (maximum || 1)) * plotH;
    out += `<rect x="${x}" y="${top + plotH - h}" width="${width * .7}" height="${h}" rx="6" fill="${palette[i % palette.length]}"/>`;
  });
  el.innerHTML = svg(out, yLabel);
}

function pieChart() {
  const el = $("pieChart");
  if (!el) return;
  const items = countsFor("sector").filter(item => item.count);
  const n = items.reduce((s, item) => s + item.count, 0);
  if (!n) { emptyChart("pieChart"); return; }
  let angle = -Math.PI / 2, out = "";
  items.forEach((item, i) => {
    const end = angle + (item.count / n) * Math.PI * 2;
    const color = palette[i % palette.length];
    const x1 = 225 + 125 * Math.cos(angle), y1 = 180 + 125 * Math.sin(angle);
    const x2 = 225 + 125 * Math.cos(end), y2 = 180 + 125 * Math.sin(end);
    out += `<path d="M 225 180 L ${x1} ${y1} A 125 125 0 ${end - angle > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z" fill="${color}" stroke="white" stroke-width="2"/>`;
    out += `<rect x="390" y="${100 + i * 45}" width="14" height="14" rx="3" fill="${color}"/>`;
    out += `<text x="415" y="${112 + i * 45}" font-size="12" fill="#1E293B">${escapeHTML(item.label)} (${fmt(100 * item.count / n, 1)}%)</text>`;
    angle = end;
  });
  el.innerHTML = svg(out, "Sector");
}

function renderCharts() {
  const channelCounts = countsFor("channel");
  barChart("barChart", channelCounts.map(x => ({ label: x.label, value: x.count })), "Canal", "Negocios");
  pieChart();
}

function renderConclusions() {
  const el = $("conclusions");
  if (!el) return;
  el.innerHTML = `<p>Se analizaron ${visible.length} negocios con ventas promedio de C$ ${fmt(mean(values("sales")))}.</p>`;
}

function downloadCSV() {
  const columns = [{ key: "id", label: "Negocio" }, ...allVariables];
  const rows = [columns.map(v => v.key), ...visible.map(row => columns.map(v => row[v.key]))];
  const csv = "\uFEFF" + rows.map(row => row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "datos.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
document.addEventListener("DOMContentLoaded", setup);