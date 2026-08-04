# Permanent scale fix — dedicated Arduino reads the HX711

## Why
The Pi bit-banged the HX711's timing in Python while also running Chromium + the KDS.
The browser starves that timing loop, so the reading jitters ~25 g under load (fine in
a quiet terminal, jumpy on the KDS). Moving the timing-critical read onto a dedicated
Arduino — which does nothing else — removes the starvation and gives a steady ~1-2 g
reading. This is the real fix, not a filter.

## What to buy (ONE part — reuse your existing load cell + HX711)
- **Arduino Nano** (or Uno), ~Rs300-500. A Nano is smallest and fits in the box.
  A CH340 clone is fine. Get one with the USB cable.
- Nothing else. The 5 kg load cell and HX711 you already have are reused.

## Wiring
Load cell -> HX711 (unchanged):  red->E+  black->E-  white->A-  green->A+
HX711 -> Arduino:                VCC->5V   GND->GND   DT(DOUT)->D3   SCK->D2
Arduino -> Pi:                   USB cable (any Pi USB port)

## Flash the Arduino (once, from any laptop with the Arduino IDE)
1. Install the Arduino IDE.
2. Library Manager -> install "HX711 Arduino Library" by Bogdan Necula.
3. Open `arduino/nutriobox_scale.ino` from this repo.
4. Select board = Arduino Nano (and the right processor/port), click Upload.
5. Open Serial Monitor at 115200 baud — you should see lines like `R:-182614`.

## Switch the Pi over to the serial service
On the Pi:
```bash
sudo apt install -y python3-serial          # pyserial
cd ~/pi-weight-service
# stop the old GPIO service (auto-respawns, so also disable its autostart - see note)
pkill -f weight_server.py
# test the new one in the foreground first (Arduino plugged in):
python3 weight_server_serial.py
```
In another terminal, confirm it works:
```bash
curl http://127.0.0.1:8765/health     # expect "link": true
curl http://127.0.0.1:8765/weight
```
Then calibrate exactly as before (weight is 224 g here):
```bash
curl -X POST http://127.0.0.1:8765/tare                    # empty platform
curl -X POST "http://127.0.0.1:8765/calibrate?grams=224"   # 224 g on
```
The KDS needs NO change — same endpoints, same calibration file.

## Make it permanent (replace the old autostart)
The old `weight_server.py` auto-starts on boot and respawns when killed. Point that
autostart at the new file instead. Easiest: rename so the existing autostart runs the
new code:
```bash
cd ~/pi-weight-service
cp weight_server.py weight_server_gpio_backup.py     # keep the old one
cp weight_server_serial.py weight_server.py          # autostart now runs the serial version
sudo reboot
```
After reboot: `curl http://127.0.0.1:8765/health` should show `"link": true`.

## Result
Steady, gram-level weight on the KDS regardless of browser load. The frontend stability
guard (now a short recent window) will simply show a solid number. Re-taring each
morning is still good practice but drift will be far smaller.
