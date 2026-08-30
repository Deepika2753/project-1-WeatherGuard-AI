from flask import Flask, render_template, request, jsonify
import sqlite3
from pathlib import Path
import requests

APP_DIR = Path(__file__).resolve().parent
DB_PATH = APP_DIR / "database" / "weatherguard.db"

app = Flask(__name__)


def db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS searches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                city TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                temperature REAL,
                precipitation REAL,
                wind_speed REAL,
                risk_level TEXT NOT NULL,
                searched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS favorites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                city TEXT NOT NULL UNIQUE,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            """
        )


# Ensure tables exist at import time (so this runs under gunicorn too,
# not just when the script is executed directly with `python app.py`)
init_db()


def geocode_city(city):
    url = "https://geocoding-api.open-meteo.com/v1/search"
    r = requests.get(
        url,
        params={"name": city, "count": 1, "language": "en", "format": "json"},
        timeout=12,
    )
    r.raise_for_status()
    data = r.json()
    results = data.get("results") or []
    if not results:
        return None
    item = results[0]
    return {
        "name": item.get("name", city),
        "country": item.get("country", ""),
        "admin1": item.get("admin1", ""),
        "latitude": item["latitude"],
        "longitude": item["longitude"],
    }


def fetch_weather(lat, lon):
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max",
        "timezone": "auto",
        "forecast_days": 7,
    }
    r = requests.get(url, params=params, timeout=15)
    r.raise_for_status()
    return r.json()


def safe_first(lst, default=0):
    try:
        v = (lst or [default])[0]
        return default if v is None else v
    except (IndexError, TypeError):
        return default


def risk_assessment(current, daily):
    current = current or {}
    daily = daily or {}

    precipitation = float(current.get("precipitation") or 0)
    wind = float(current.get("wind_speed_10m") or 0)
    temp = float(current.get("temperature_2m") or 0)
    daily_rain = float(safe_first(daily.get("precipitation_sum")))
    pop = float(safe_first(daily.get("precipitation_probability_max")))

    score = 0
    reasons = []

    if daily_rain >= 50:
        score += 4
        reasons.append("Very heavy daily rainfall is forecast.")
    elif daily_rain >= 25:
        score += 3
        reasons.append("Heavy daily rainfall is forecast.")
    elif daily_rain >= 10:
        score += 2
        reasons.append("Moderate daily rainfall is forecast.")
    elif precipitation > 0:
        score += 1
        reasons.append("Precipitation is currently being reported.")

    if pop >= 80:
        score += 2
        reasons.append("Rain probability is very high.")
    elif pop >= 60:
        score += 1
        reasons.append("Rain probability is elevated.")

    if wind >= 60:
        score += 3
        reasons.append("Strong winds may create hazardous conditions.")
    elif wind >= 40:
        score += 2
        reasons.append("Wind speeds are elevated.")

    if temp >= 42:
        score += 2
        reasons.append("Extreme heat may increase heat-stress risk.")
    elif temp >= 38:
        score += 1
        reasons.append("High temperature may require heat precautions.")

    if score >= 7:
        level = "High"
    elif score >= 4:
        level = "Moderate"
    else:
        level = "Low"

    if not reasons:
        reasons.append("No major weather hazard threshold is currently triggered.")

    advisory = {
        "High": "Avoid unnecessary travel in exposed or flood-prone areas and follow official local alerts.",
        "Moderate": "Stay weather-aware, keep a rain plan ready, and avoid waterlogged routes.",
        "Low": "Normal precautions are sufficient; continue monitoring if you have outdoor plans.",
    }[level]

    return {"level": level, "score": score, "reasons": reasons, "advisory": advisory}


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/api/weather")
def weather():
    city = (request.args.get("city") or "").strip()
    if not city:
        return jsonify({"error": "Please enter a city name."}), 400
    try:
        location = geocode_city(city)
        if not location:
            return jsonify({"error": "City not found. Try a more specific place name."}), 404

        weather_data = fetch_weather(location["latitude"], location["longitude"])
        current = weather_data.get("current", {}) or {}
        daily = weather_data.get("daily", {}) or {}
        risk = risk_assessment(current, daily)

        with db() as conn:
            conn.execute(
                """INSERT INTO searches
                (city, latitude, longitude, temperature, precipitation, wind_speed, risk_level)
                VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    location["name"],
                    location["latitude"],
                    location["longitude"],
                    current.get("temperature_2m"),
                    current.get("precipitation"),
                    current.get("wind_speed_10m"),
                    risk["level"],
                ),
            )

        return jsonify({
            "location": location,
            "current": current,
            "daily": daily,
            "risk": risk,
            "timezone": weather_data.get("timezone"),
        })
    except requests.RequestException:
        return jsonify({"error": "Weather service is temporarily unavailable. Try again shortly."}), 502
    except Exception as exc:
        app.logger.exception("Unexpected error in /api/weather")
        return jsonify({"error": "Unexpected server error."}), 500


@app.route("/api/history")
def history():
    with db() as conn:
        rows = conn.execute(
            """SELECT id, city, temperature, precipitation, wind_speed, risk_level, searched_at
               FROM searches ORDER BY id DESC LIMIT 12"""
        ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/history/<int:item_id>", methods=["DELETE"])
def delete_history(item_id):
    with db() as conn:
        cur = conn.execute("DELETE FROM searches WHERE id = ?", (item_id,))
    if cur.rowcount == 0:
        return jsonify({"error": "History item not found."}), 404
    return jsonify({"ok": True})


@app.route("/api/favorites", methods=["GET", "POST"])
def favorites():
    if request.method == "GET":
        with db() as conn:
            rows = conn.execute("SELECT * FROM favorites ORDER BY city").fetchall()
        return jsonify([dict(r) for r in rows])

    payload = request.get_json(silent=True) or {}
    city = (payload.get("city") or "").strip()
    lat = payload.get("latitude")
    lon = payload.get("longitude")
    if not city or lat is None or lon is None:
        return jsonify({"error": "city, latitude and longitude are required."}), 400
    try:
        with db() as conn:
            conn.execute(
                "INSERT INTO favorites (city, latitude, longitude) VALUES (?, ?, ?)",
                (city, lat, lon),
            )
        return jsonify({"ok": True}), 201
    except sqlite3.IntegrityError:
        return jsonify({"error": "This city is already in favorites."}), 409


@app.route("/api/favorites/<int:item_id>", methods=["DELETE"])
def delete_favorite(item_id):
    with db() as conn:
        cur = conn.execute("DELETE FROM favorites WHERE id = ?", (item_id,))
    if cur.rowcount == 0:
        return jsonify({"error": "Favorite not found."}), 404
    return jsonify({"ok": True})


@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Not found."}), 404


@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": "Internal server error."}), 500


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
