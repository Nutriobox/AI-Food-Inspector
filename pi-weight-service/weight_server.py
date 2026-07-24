#!/usr/bin/env python3
"""
Nutriobox load-cell weight service (Raspberry Pi CM4, 64-bit Raspberry Pi OS).

Reads an HX711 + load cell on the Pi GPIO and serves the live weight as JSON at
http://127.0.0.1:8765/weight so the KDS page (running on the same Pi) can show it.

Setup / calibration: see README.md in this folder.
"""
import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

import lgpio  # pip install lgpio  (or: sudo apt install python3-lgpio)

# ---- Configuration ----
# Pins are auto-detected by find_pins.py and saved to hx711_pins.json.
# You normally never set these by hand. (Env vars still override if you want.)
_PINS_FILE = os.path.join(os.path.dirname(__file__), "hx711_pins.json")
_pins = {"dt": 5, "sck": 6}
if os.path.exists(_PINS_FILE):
    try:
        _pins.update(json.load(open(_PINS_FILE)))
    except Exception:
        pass

DT_PIN   = int(os.environ.get("HX711_DT",  str(_pins["dt"])))    # HX711 DOUT -> BCM GPIO
SCK_PIN  = int(os.environ.get("HX711_SCK", str(_pins["sck"])))   # HX711 SCK  -> BCM GPIO
HTTP_PORT = int(os.environ.get("WEIGHT_PORT", "8765"))
CAL_FILE = os.environ.get("WEIGHT_CAL_FILE", os.path.join(os.path.dirname(__file__), "weight_cal.json"))

# scale: grams per raw unit; offset: raw reading at zero load. Persisted to CAL_FILE.
_cal = {"offset": 0.0, "scale": 1.0}
if os.path.exists(CAL_FILE):
    try:
        _cal.update(json.load(open(CAL_FILE)))
    except Exception:
        pass

def _save_cal():
    try:
        json.dump(_cal, open(CAL_FILE, "w"))
    except Exception as e:
        print("cal save failed:", e)

# ---- HX711 driver (bit-banged via lgpio) ----
_h = lgpio.gpiochip_open(0)
lgpio.gpio_claim_input(_h, DT_PIN)
lgpio.gpio_claim_output(_h, SCK_PIN, 0)
_lock = threading.Lock()

def _read_raw_once():
    # Wait (briefly) for the chip to signal data ready (DOUT goes low).
    t0 = time.time()
    while lgpio.gpio_read(_h, DT_PIN) == 1:
        if time.time() - t0 > 0.5:
            raise TimeoutError("HX711 not ready (check wiring / pins)")
        time.sleep(0.001)
    count = 0
    for _ in range(24):
        lgpio.gpio_write(_h, SCK_PIN, 1)
        bit = lgpio.gpio_read(_h, DT_PIN)
        lgpio.gpio_write(_h, SCK_PIN, 0)
        count = (count << 1) | bit
    # 1 extra pulse -> channel A, gain 128
    lgpio.gpio_write(_h, SCK_PIN, 1)
    lgpio.gpio_write(_h, SCK_PIN, 0)
    if count & 0x800000:        # 24-bit two's complement -> signed
        count -= 0x1000000
    # A glitched read (the bit-bang clock got preempted by the OS under CPU load)
    # tends to land at the ADC rails. Reject those outright so they never enter the
    # sample set - a saturated value is never a real portion weight.
    if count <= -0x7FFFF0 or count >= 0x7FFFF0:
        raise ValueError("HX711 rail value (glitched read)")
    return count

def _median(xs):
    ys = sorted(xs); n = len(ys); m = n // 2
    return ys[m] if n % 2 else (ys[m - 1] + ys[m]) / 2

def read_raw(samples=20):
    """Median of many samples with MAD-based outlier rejection.

    The HX711 is bit-banged from Python, so when the CPU is busy (Chromium + the
    KDS running on the same Pi) the OS can preempt the read mid-clock and corrupt a
    sample. A plain mean lets one such spike wreck the reading - which showed up as
    the KDS reporting 'Scale unstable'. The median ignores spikes, and we then drop
    anything more than 5x the median absolute deviation from it before averaging the
    survivors, so the returned value reflects the real, quiet signal."""
    vals = []
    with _lock:
        # Over-sample: ask for extra so we still have plenty after rejecting glitches.
        for _ in range(samples * 2):
            try:
                vals.append(_read_raw_once())
            except (TimeoutError, ValueError):
                continue  # skip a glitched/not-ready sample, keep going
            if len(vals) >= samples:
                break
            time.sleep(0.001)
    if len(vals) < 3:
        raise TimeoutError("no clean HX711 samples")
    med = _median(vals)
    dev = _median([abs(v - med) for v in vals]) or 1.0  # MAD (never zero-divide)
    keep = [v for v in vals if abs(v - med) <= 5 * dev]
    return sum(keep) / len(keep) if keep else med

# Zero-zone: readings within +/- this many grams of zero report exactly 0.
DEADZONE = float(os.environ.get("WEIGHT_DEADZONE", "5"))

def read_grams():
    raw = read_raw(11)  # median of 11 clean samples - steady even under CPU load
    g = (raw - _cal["offset"]) / _cal["scale"]
    return g, raw

# ---- Background loop keeps the latest reading fresh ----
_latest = {"weight_g": 0.0, "raw": 0, "ok": False, "error": None, "ts": 0}

_ema = {"v": None}

def _loop():
    while True:
        try:
            g, raw = read_grams()
            if abs(g) < DEADZONE:
                g = 0.0
            # Hysteresis: only change the shown number on a real change (>=3g),
            # so a settled reading stays steady instead of flickering.
            if _ema["v"] is None or abs(g - _ema["v"]) >= 3:
                _ema["v"] = g
            _latest.update(weight_g=round(_ema["v"]), raw=raw, ok=True, error=None, ts=time.time())
        except Exception as e:
            _latest.update(ok=False, error=str(e), ts=time.time())
        time.sleep(0.05)

threading.Thread(target=_loop, daemon=True).start()

# ---- HTTP server (CORS so the Vercel-hosted KDS page can read it locally) ----
class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/weight":
            self._json(_latest)
        elif path == "/health":
            self._json({"ok": _latest["ok"], "cal": _cal})
        else:
            self._json({"error": "not found"}, 404)

    def do_POST(self):
        path = urlparse(self.path).path
        qs = parse_qs(urlparse(self.path).query)
        if path == "/tare":
            _cal["offset"] = float(read_raw())
            _save_cal()
            self._json({"ok": True, "offset": _cal["offset"]})
        elif path == "/calibrate":
            grams = float(qs.get("grams", ["0"])[0])
            if grams <= 0:
                self._json({"error": "pass ?grams=<known weight>"}, 400); return
            raw = float(read_raw())
            _cal["scale"] = (raw - _cal["offset"]) / grams
            _save_cal()
            self._json({"ok": True, "scale": _cal["scale"], "offset": _cal["offset"]})
        else:
            self._json({"error": "not found"}, 404)

    def log_message(self, *a):  # quiet
        pass

if __name__ == "__main__":
    print(f"Weight service on http://127.0.0.1:{HTTP_PORT}  (DT=GPIO{DT_PIN}, SCK=GPIO{SCK_PIN})")
    ThreadingHTTPServer(("127.0.0.1", HTTP_PORT), Handler).serve_forever()
