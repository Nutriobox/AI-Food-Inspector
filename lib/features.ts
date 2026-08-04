// Weight capture is OFF (paused, not abandoned).
//
// The load cell, mounting, wiring and calibration are all good: in a quiet terminal
// the scale reads a known 224 g weight correctly. The blocker is architectural - the
// Raspberry Pi bit-bangs the HX711's timing in software, and running Chromium + the
// KDS on the same Pi starves that loop, so the reading wobbles ~25 g under browser
// load. That is too noisy to drive a pass/fail quality decision, so weight is paused
// rather than fed unreliable data into the evaluations.
//
// The permanent fix is a dedicated microcontroller (Arduino/ESP32, ~Rs200) that reads
// the HX711 with hardware timing and sends the weight to the Pi over USB - nothing
// competing for its CPU. When that is in place, flip this back to true.
//
// With this false the KDS hides the weight UI, does not poll the weight service, and
// stores weight_g as null. Every dish keeps its expected_grams, and the Pi keeps its
// calibration (weight_cal.json), so re-enabling is a one-line change.
export const WEIGHT_ENABLED: boolean = false;
