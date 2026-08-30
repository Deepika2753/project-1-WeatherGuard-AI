import threading
import webbrowser

from app import app, init_db

URL = "http://127.0.0.1:5000"


def open_browser():
    webbrowser.open(URL)


if __name__ == "__main__":
    init_db()
    print(f"Running at {URL}")
    threading.Timer(1.2, open_browser).start()
    app.run(host="127.0.0.1", port=5000, debug=False)
