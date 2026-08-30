# WeatherGuard AI — Weather & Risk Advisory

A live weather dashboard with an automated risk-assessment layer, built with Flask.

## What it does
Search any city to get current conditions and a 7-day forecast (via the free
Open-Meteo API, no key required), plus an automatically generated risk level
(Low/Moderate/High) with a safety advisory based on rainfall, wind, and heat.

## Run locally
```
pip install -r requirements.txt
python run.py
```
Then open http://127.0.0.1:5000

## Deploy (Render, free tier)
1. Push this folder to a GitHub repo.
2. On Render: New > Web Service > connect the repo.
3. Build Command: `pip install -r requirements.txt`
4. Start Command: `gunicorn wsgi:app`
5. Plan: Free

## Tech stack
Flask, SQLite, Open-Meteo API, vanilla JS/CSS.
