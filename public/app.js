let stocks = [];
let optionsChart = null;
let stockChart = null;

const money = value => value == null ? "—" : "$" + Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = value => value == null ? "—" : (value >= 0 ? "+" : "") + Number(value).toFixed(2) + "%";
const ratio = value => value == null ? "—" : Number(value).toFixed(1) + "x";
const gradeClass = grade => grade === "A+" ? "aplus" : grade === "A" ? "a" : grade === "B" ? "b" : "pass";

async function loadData() {
  const status = document.getElementById("status");
  const errorBox = document.getElementById("errorBox");
  errorBox.classList.add("hidden");
  status.textContent = "Fetching market data...";
  try {
    const response = await fetch("/api/analyze");
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || "Could not load scanner.");
    stocks = json.data;
    render();
    const firstValid = stocks.findIndex(stock => !stock.error);
    if (firstValid >= 0) selectStock(firstValid);
    status.textContent = `Updated ${new Date(json.updatedAt).toLocaleString()}${json.cached ? " · cached" : ""}. Entry-ready stocks appear on top. Auto-refreshes every 60 seconds.`;
  } catch (error) {
    status.textContent = "Setup required.";
    errorBox.textContent = error.message;
    errorBox.classList.remove("hidden");
  }
}

function render() {
  const cards = document.getElementById("cards");
  const table = document.getElementById("stockTable");
  cards.innerHTML = "";
  table.innerHTML = "";
  let aplusCount = 0;

  stocks.forEach((stock, index) => {
    if (stock.error) {
      cards.innerHTML += `<article class="card"><div class="ticker">${stock.ticker}</div><p class="bad">${stock.error}</p></article>`;
      return;
    }
    if (stock.grade === "A+") aplusCount++;
    const changeClass = stock.changePercent >= 0 ? "green" : "red";
    const optBadge = stock.options.optionsReady ? "OPTIONS READY" : "Watch";
    const setupBad = stock.swing.setup.startsWith("Avoid");
    cards.innerHTML += `
      <article class="card" onclick="selectStock(${index})">
        <div class="card-top">
          <div><div class="ticker">${stock.ticker}</div><div class="theme">${stock.theme}</div></div>
          <span class="grade ${gradeClass(stock.grade)}">${stock.grade}</span>
        </div>
        <div class="score">${stock.score}/100</div>
        <div class="price">${money(stock.price)} <span class="${changeClass}">${pct(stock.changePercent)}</span></div>
        <div class="badges">
          <span class="pill ${stock.options.optionsReady ? "goodpill" : "watchpill"}">${optBadge}</span>
          <span class="pill ${setupBad ? "badpill" : "watchpill"}">${stock.swing.setup}</span>
        </div>
        <div class="levels">
          <div><b>Entry</b><span>${money(stock.options.levels.entry || stock.swing.levels.entry)}</span></div>
          <div><b>Alert 2</b><span>${money(stock.options.levels.alert2 || stock.swing.levels.alert2)}</span></div>
          <div><b>Alert 1</b><span>${money(stock.options.levels.alert1 || stock.swing.levels.alert1)}</span></div>
        </div>
        <div class="checks">
          ${checkLine("5M close above level + VWAP", stock.options.priceConfirm)}
          ${checkLine("5M volume > 2x avg", stock.options.volumeSpike2x)}
          ${checkLine("MACD 8/17/9 bullish", stock.options.macdCrossUp && stock.options.macdHistGreen)}
          ${checkLine("Good swing volume", stock.swing.goodVolume)}
          ${checkLine("Weekly/long trend filter", stock.swing.closeAboveWeekly50)}
        </div>
      </article>`;

    table.innerHTML += `
      <tr onclick="selectStock(${index})">
        <td><b>${stock.ticker}</b></td>
        <td><span class="grade ${gradeClass(stock.grade)}">${stock.grade}</span></td>
        <td><b>${stock.score}</b></td>
        <td>${money(stock.price)}</td>
        <td class="${changeClass}">${pct(stock.changePercent)}</td>
        <td class="${stock.options.optionsReady ? "ok" : ""}">${stock.options.optionsReady ? "Ready" : "Watch"}</td>
        <td class="${setupBad ? "bad" : "ok"}">${stock.swing.setup}</td>
        <td><b>${money(stock.options.levels.entry || stock.swing.levels.entry)}</b></td>
        <td>${money(stock.options.levels.alert2 || stock.swing.levels.alert2)}</td>
        <td>${money(stock.options.levels.alert1 || stock.swing.levels.alert1)}</td>
        <td>${ratio(stock.swing.volumeRatio)}</td>
        <td>${stock.benchmark} ${pct(stock.themeReturn1m)}</td>
      </tr>`;
  });
  document.getElementById("aplusCount").textContent = aplusCount;
}

function checkLine(label, passed) {
  return `<div class="check">${label}<b class="${passed ? "ok" : "bad"}">${passed ? "✓" : "×"}</b></div>`;
}

function selectStock(index) {
  const stock = stocks[index];
  if (!stock || stock.error) return;
  document.getElementById("selectedTitle").textContent = `${stock.ticker}: ${stock.grade} setup — ${stock.score}/100`;
  document.getElementById("selectedSummary").textContent =
    `Options: ${stock.options.optionsReady ? "READY" : "watch only"}. Needs price confirmation (${stock.options.priceConfirm ? "yes" : "no"}), 2x volume (${stock.options.volumeSpike2x ? "yes" : "no"}), MACD confirmation (${stock.options.macdCrossUp && stock.options.macdHistGreen ? "yes" : "no"}). Stock swing: ${stock.swing.setup}; volume ${ratio(stock.swing.volumeRatio)}; avoid flags: distribution ${stock.swing.distributionDay ? "yes" : "no"}, extended ${stock.swing.extended2w ? "yes" : "no"}, rejected highs ${stock.swing.rejectedATH ? "yes" : "no"}. Check earnings manually before holding 1–3 months.`;

  drawChart("optionsChart", "options", stock, stock.options.levels);
  drawChart("stockChart", "stock", stock, stock.swing.levels);
}

function drawChart(canvasId, kind, stock, levels) {
  const labels = stock.candles.map(c => c.date);
  const closes = stock.candles.map(c => c.close);
  const entry = labels.map(() => levels.entry);
  const alert2 = labels.map(() => levels.alert2);
  const alert1 = labels.map(() => levels.alert1);
  const datasets = [
    { label: "Close", data: closes, borderWidth: 3, tension: 0.25 },
    { label: "Entry / Go trigger", data: entry, borderWidth: 2, pointRadius: 0 },
    { label: "Alert 2 / Momentum watch", data: alert2, borderWidth: 2, pointRadius: 0, borderDash: [4, 4] },
    { label: "Alert 1 / Get ready", data: alert1, borderWidth: 2, pointRadius: 0, borderDash: [8, 6] }
  ];
  if (kind === "stock") {
    datasets.push({ label: "21 EMA", data: labels.map(() => stock.ema21), borderWidth: 1, pointRadius: 0 });
    datasets.push({ label: "50 EMA", data: labels.map(() => stock.ema50), borderWidth: 1, pointRadius: 0 });
  } else {
    datasets.push({ label: "VWAP", data: labels.map(() => stock.options.vwap), borderWidth: 1, pointRadius: 0 });
  }

  const chartRef = canvasId === "optionsChart" ? optionsChart : stockChart;
  if (chartRef) chartRef.destroy();
  const newChart = new Chart(document.getElementById(canvasId), {
    type: "line",
    data: { labels, datasets },
    options: {
      plugins: { legend: { labels: { color: "#dce1ea" } } },
      scales: {
        x: { ticks: { color: "#9aa3b4", maxTicksLimit: 8 }, grid: { color: "#172033" } },
        y: { ticks: { color: "#9aa3b4" }, grid: { color: "#172033" } }
      }
    }
  });
  if (canvasId === "optionsChart") optionsChart = newChart; else stockChart = newChart;
}

loadData();
setInterval(loadData, 60000);
