from app import app, init_db

# Gunicorn imports this module instead of running app.py as __main__.
# Initialize the SQLite schema before serving requests.
init_db()
