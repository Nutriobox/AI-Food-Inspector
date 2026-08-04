/*
 * NutrioBox scale reader — Arduino Nano/Uno + HX711
 * -------------------------------------------------
 * This chip does ONE job: read the load cell with proper hardware timing and stream
 * the raw value to the Raspberry Pi over USB serial. The Pi keeps the calibration
 * (offset/scale) and the HTTP API; it only needs a clean number from here.
 *
 * Why this exists: the Pi bit-banged the HX711 in Python while also running Chromium,
 * so the browser starved the timing loop and the reading jittered ~25 g. A dedicated
 * chip has nothing competing for it, so the reading is steady to ~1-2 g.
 *
 * Library: install "HX711 Arduino Library" by Bogdan Necula (Library Manager),
 * or from https://github.com/bogde/HX711
 *
 * Wiring (load cell -> HX711 -> Arduino):
 *   Load cell:  red->E+  black->E-  white->A-  green->A+   (as before)
 *   HX711 -> Arduino:  VCC->5V   GND->GND   DT(DOUT)->D3   SCK->D2
 *   Arduino -> Pi:     USB cable
 */
#include "HX711.h"

const int DT_PIN  = 3;   // HX711 DOUT -> Arduino D3
const int SCK_PIN = 2;   // HX711 SCK  -> Arduino D2

HX711 scale;

void setup() {
  Serial.begin(115200);
  scale.begin(DT_PIN, SCK_PIN);
  scale.set_gain(128);          // channel A, gain 128 (matches the Pi's old setup)
}

void loop() {
  if (scale.is_ready()) {
    // Average of 10 hardware-timed reads -> already smooth and glitch-free.
    long v = scale.read_average(10);
    Serial.print("R:");
    Serial.println(v);          // e.g. "R:-182614"
  } else {
    delay(5);
  }
  delay(40);                    // ~20 clean readings per second
}
