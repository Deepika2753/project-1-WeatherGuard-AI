const form = document.getElementById("search-form");
const cityInput = document.getElementById("city-input");
const errorEl = document.getElementById("error");
const resultEl = document.getElementById("result");
const locationName = document.getElementById("location-name");
const locationMeta = document.getElementById("location-meta");
const conditionIcon = document.getElementById("condition-icon");
const gaugeNeedle = document.getElementById("gauge-needle");
const riskLabel = document.getElementById("risk-label");
const gaugeScore = document.getElementById("gauge-score");
const metricsEl = document.getElementById("metrics");
const advisoryEl = document.getElementById("advisory");
const reasonsEl = document.getElementById("reasons");
const historyEl = document.getElementById("history");

const RISK_COLORS = { Low: "#4ade80", Moderate: "#ffb84d", High: "#ff5c72" };
const GAUGE_MAX = 12;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

const ICONS = {
  sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8L6 18M18 6l1.8-1.8"/></svg>`,
  cloud: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 18a4 4 0 0 1-.4-8 5.5 5.5 0 0 1 10.7-1.7A4.5 4.5 0 0 1 17 18H6.5Z"/></svg>`,
  rain: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 14a4 4 0 0 1-.4-8 5.5 5.5 0 0 1 10.7-1.7A4.5 4.5 0 0 1 17 14H6.5Z"/><path d="M8 18l-1 2.5M12.5 18l-1 2.5M17 18l-1 2.5"/></svg>`,
  storm: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 13a4 4 0 0 1-.4-8 5.5 5.5 0 0 1 10.7-1.7A4.5 4.5 0 0 1 17 13H6.5Z"/><path d="M13 14l-3 5h3l-2 4"/></svg>`,
  snow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 13a4 4 0 0 1-.4-8 5.5 5.5 0 0 1 10.7-1.7A4.5 4.5 0 0 1 17 13H6.5Z"/><path d="M9 18v4M9 19l-1.5 1M9 19l1.5 1M15 18v4M15 19l-1.5 1M15 19l1.5 1"/></svg>`,
  fog: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 9h16M4 13h16M4 17h10"/></svg>`,
};

function iconForCode(code) {
  if (code === 0) return ICONS.sun;
  if ([1, 2, 3].includes(code)) return ICONS.cloud;
  if ([45, 48].includes(code)) return ICONS.fog;
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return ICONS.rain;
  if ([71, 73, 75, 77, 85, 86].includes(code)) return ICONS.snow;
  if ([95, 96, 99].includes(code)) return ICONS.storm;
  return ICONS.cloud;
}

function setGauge(score, level) {
  const clamped = Math.max(0, Math.min(GAUGE_MAX, score));
  const angle = -90 + (clamped / GAUGE_MAX) * 180;
  gaugeNeedle.style.transform = `translateX(-50%) rotate(${angle}deg)`;
  gaugeNeedle.style.background = RISK_COLORS[level] || "#eef4f8";
  riskLabel.textContent = `${level} risk`;
  riskLabel.style.color = RISK_COLORS[level] || "#eef4f8";
  gaugeScore.textContent = `score ${score}/${GAUGE_MAX}`;
}

function formatServerTime(str) {
  if (!str) return "";
  const d = new Date(str.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return str;
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function loadHistory() {
  try {
    const res = await fetch("/api/history");
    const items = await res.json();
    if (!items.length) {
      historyEl.innerHTML = "<p class='empty'>No searches yet.</p>";
      return;
    }
    historyEl.innerHTML = items
      .map(
        (h) => `
      <div class="history-item">
        <span class="history-dot ${h.risk_level}"></span>
        <span>${escapeHtml(h.city)}</span>
        <span class="history-temp">${h.temperature != null ? h.temperature + "°C" : "—"}</span>
        <span class="history-time">${formatServerTime(h.searched_at)}</span>
      </div>
    `
      )
      .join("");
  } catch (e) {
    historyEl.innerHTML = "<p class='empty'>Could not load history.</p>";
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.textContent = "";
  resultEl.hidden = true;
  const city = cityInput.value.trim();
  if (!city) return;

  try {
    const res = await fetch(`/api/weather?city=${encodeURIComponent(city)}`);
    const data = await res.json();
    if (!res.ok) {
      errorEl.textContent = data.error || "Something went wrong.";
      return;
    }

    const { location, current, risk } = data;

    locationName.textContent = `${location.name}${location.country ? ", " + location.country : ""}`;
    locationMeta.textContent = `${location.latitude.toFixed(2)}°, ${location.longitude.toFixed(2)}°${
      location.admin1 ? " · " + location.admin1 : ""
    }`;
    conditionIcon.innerHTML = iconForCode(current.weather_code);
    setGauge(risk.score, risk.level);

    metricsEl.innerHTML = `
      <div class="metric">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 14.5V4.5a2 2 0 1 0-4 0v10a4 4 0 1 0 4 0Z"/></svg>
        <div class="value">${current.temperature_2m ?? "—"}°C</div>
        <div class="label">Temperature</div>
      </div>
      <div class="metric">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h9a3 3 0 1 0-3-3M3 16h13a3 3 0 1 1-3 3"/></svg>
        <div class="value">${current.wind_speed_10m ?? "—"} km/h</div>
        <div class="label">Wind</div>
      </div>
      <div class="metric">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2s6 7.5 6 12a6 6 0 1 1-12 0c0-4.5 6-12 6-12Z"/></svg>
        <div class="value">${current.precipitation ?? 0} mm</div>
        <div class="label">Precipitation</div>
      </div>
      <div class="metric">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2s6 7.5 6 12a6 6 0 1 1-12 0c0-4.5 6-12 6-12Z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/></svg>
        <div class="value">${current.relative_humidity_2m ?? "—"}%</div>
        <div class="label">Humidity</div>
      </div>
    `;

    advisoryEl.textContent = risk.advisory;
    reasonsEl.innerHTML = risk.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("");
    resultEl.hidden = false;
    loadHistory();
  } catch (e) {
    errorEl.textContent = "Network error. Please try again.";
  }
});

loadHistory();
