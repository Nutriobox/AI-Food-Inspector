#!/usr/bin/env python3
"""
NutrioBox weight service — SERIAL version (Arduino reads the HX711).

This replaces the old GPIO/bit-bang weight_server.py. A dedicated Arduino reads the
load cell and streams raw values ("R:<int>\\n") over USB serial; this service just
reads that stream, applies the saved calibration, and serves the SAME HTTP API as
before, so the KDS and the /tare + /calibrate workflow are unchanged.

Setup on the Pi:
    sudo apt install -y python3-serial      # or: pip3 install pyserial
    # plug in the Arduino, then run:
    python3 weight_server_serial.py
The Arduino usually appears as /dev/ttyUSB0 (CH340 clones) or /dev/ttyACM0 (genuine).
This script auto-detects it; override with env SERIAL_PORT=/dev/ttyUSB0 if needed.
"""
import json, os, threading, time, glob
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

import serial  # pip3 install pyserial  (or apt install python3-serial)

HTTP_PORT = int(os.environ.get("WEIGHT_PORT", "8765"))
CAL_FILE  = os.environ.get("WEIGHT_CAL_FILE", os.path.join(os.path.dirname(__file__), "weight_cal.json"))
BAUD      = int(os.environ.get("SERIAL_BAUD", "115200"))
DEADZONE  = float(os.environ.get("WEIGHT_DEADZONE", "5"))

# scale: raw units per gram; offset: raw at zero load. Persisted to CAL_FILE (unchanged).
_cal = {"offset": 0.0, "scale": 1.0}
if os.path.exists(CAL_FILE):
    try: _cal.update(json.load(open(CAL_FILE)))
    except Exception: pass

def _save_cal():
    try: json.dump(_cal, open(CAL_FILE, "w"))
    except Exception as e: print("cal save failed:", e)

def _find_port():
    if os.environ.get("SERIAL_PORT"):
        return os.environ["SERIAL_PORT"]
    for pat in ("/dev/ttyUSB*", "/dev/ttyACM*"):
        hits = sorted(glob.glob(pat))
        if hits: return hits[0]
    return None

# ---- Serial reader: keeps a small ring buffer of the latest raw values ----
_lock = threading.Lock()
_recent = []           # last N raw ints from the Arduino
_MAXN = 15
_link_ok = {"v": False}

def _median(xs):
    ys = sorted(xs); n = len(ys); m = n // 2
    return ys[m] if n % 2 else (ys[m-1] + ys[m]) / 2

def _serial_loop():
    while True:
        port = _find_port()
        if not port:
            _link_ok["v"] = False; time.sleep(1.0); continue
        try:
            ser = serial.Serial(port, BAUD, timeout=1.0)
            time.sleep(2.0)  # let the Arduino reset after the port opens
            ser.reset_input_buffer()
            while True:
                line = ser.readline().decode(errors="ignore").strip()
                if not line.startswith("R:"):
                    continue
                try: raw = int(line[2:])
                except ValueError: continue
                with _lock:
                    _recent.append(raw)
                    if len(_recent) > _MAXN: _recent.pop(0)
                    _link_ok["v"] = True
        except Exception as e:
            _link_ok["v"] = False
            print("serial error, retrying:", e)
            time.sleep(1.5)

threading.Thread(target=_serial_loop, daemon=True).start()

def read_raw():
    """Median of the recent Arduino samples. Raises if the link is not up yet."""
    with _lock:
        if not _recent:
            raise TimeoutError("no data from scale (check the Arduino/USB cable)")
        return _median(list(_recent))

def read_grams():
    raw = read_raw()
    g = (raw - _cal["offset"]) / _cal["scale"]
    return g, raw

# ---- Background loop keeps the latest converted reading fresh ----
_latest = {"weight_g": 0.0, "raw": 0, "ok": False, "error": None, "ts": 0}

def _loop():
    while True:
        try:
            g, raw = read_grams()
            if abs(g) < DEADZONE: g = 0.0
            _latest.update(weight_g=round(g), raw=raw, ok=True, error=None, ts=time.time())
        except Exception as e:
            _latest.update(ok=False, error=str(e), ts=time.time())
        time.sleep(0.1)

threading.Thread(target=_loop, daemon=True).start()

# ---- HTTP API (identical shape to the old service) ----
class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Private-Network", "true")
    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json")
        self._cors(); self.send_header("Content-Length", str(len(body))); self.end_headers()
        self.wfile.write(body)
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()
    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/weight": self._json(_latest)
        elif path == "/health": self._json({"ok": _latest["ok"], "link": _link_ok["v"], "cal": _cal})
        else: self._json({"error": "not found"}, 404)
    def do_POST(self):
        path = urlparse(self.path).path
        qs = parse_qs(urlparse(self.path).query)
        try:
            if path == "/tare":
                _cal["offset"] = float(read_raw()); _save_cal()
                self._json({"ok": True, "offset": _cal["offset"]})
            elif path == "/calibrate":
                grams = float(qs.get("grams", ["0"])[0])
                if grams <= 0:
                    self._json({"error": "pass ?grams=<known weight>"}, 400); return
                raw = float(read_raw())
                _cal["scale"] = (raw - _cal["offset"]) / grams; _save_cal()
                self._json({"ok": True, "scale": _cal["scale"], "offset": _cal["offset"]})
            else:
                self._json({"error": "not found"}, 404)
        except Exception as e:
            self._json({"error": str(e)}, 503)
    def log_message(self, *a): pass

if __name__ == "__main__":
    print(f"Weight service (serial) on http://127.0.0.1:{HTTP_PORT}  port={_find_port()}")
    ThreadingHTTPServer(("127.0.0.1", HTTP_PORT), Handler).serve_forever()
