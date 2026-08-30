const form = document.getElementById("search-form");
const cityInput = document.getElementById("city-input");
const errorEl = document.getElementById("error");
const resultEl = document.getElementById("result");
const locationName = document.getElementById("location-name");
const riskBadge = document.getElementById("risk-badge");
const metricsEl = document.getElementById("metrics");
const advisoryEl = document.getElementById("advisory");
const reasonsEl = document.getElementById("reasons");
const historyEl = document.getElementById("history");

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
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
        <span>${escapeHtml(h.city)} — ${h.risk_level}</span>
        <span>${h.temperature != null ? h.temperature + "°C" : "—"}</span>
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
    riskBadge.textContent = `${risk.level} Risk`;
    riskBadge.className = `badge ${risk.level}`;

    metricsEl.innerHTML = `
      <div class="metric"><div class="value">${current.temperature_2m ?? "—"}°C</div><div class="label">Temperature</div></div>
      <div class="metric"><div class="value">${current.wind_speed_10m ?? "—"} km/h</div><div class="label">Wind</div></div>
      <div class="metric"><div class="value">${current.precipitation ?? 0} mm</div><div class="label">Precipitation</div></div>
      <div class="metric"><div class="value">${current.relative_humidity_2m ?? "—"}%</div><div class="label">Humidity</div></div>
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
