# Nutriobox weight service (Raspberry Pi CM4)

Reads the load cell (via the HX711 chip) and serves the live weight at
`http://127.0.0.1:8765/weight` so the KDS page on the same Pi can show it.

## 1. Copy this folder to the Pi
e.g. to `/home/pi/pi-weight-service`.

## 2. Install the GPIO library
```
sudo apt update
sudo apt install -y python3-lgpio    # or: pip3 install lgpio
```

## 3. Set the GPIO pins your HX711 is wired to
The HX711 has two signal pins, **DOUT (data)** and **SCK (clock)**. Find which
Pi GPIO pins they connect to (ask the hardware vendor, or trace the wires on the
carrier board) and set them — defaults are GPIO5 (DT) and GPIO6 (SCK):
```
export HX711_DT=5
export HX711_SCK=6
```

## 4. Run it
```
python3 weight_server.py
```
Open `http://127.0.0.1:8765/weight` on the Pi — you should get JSON like
`{"weight_g": 0.0, "raw": 123456, "ok": true, ...}`.
If `ok` is false / `error` mentions "not ready", the DT/SCK pins are wrong.

## 5. Calibrate (do this once)
1. Empty the scale, then **tare** (zero it):
   ```
   curl -X POST http://127.0.0.1:8765/tare
   ```
2. Put a known weight on it (e.g. a 200 g item) and tell the service the weight:
   ```
   curl -X POST "http://127.0.0.1:8765/calibrate?grams=200"
   ```
   Now `/weight` reports real grams. Calibration is saved to `weight_cal.json`.

## 6. Run on boot (systemd)
```
sudo cp weight.service /etc/systemd/system/nutriobox-weight.service
# edit the file if your path/user differ, then:
sudo systemctl daemon-reload
sudo systemctl enable --now nutriobox-weight.service
sudo systemctl status nutriobox-weight.service
```

## Notes
- The KDS capture screen automatically reads this endpoint; if it's unreachable
  the app falls back to a simulated weight, so nothing breaks.
- A temperature sensor can be added to the same service later (returns
  `temperature_c` in the same JSON).
