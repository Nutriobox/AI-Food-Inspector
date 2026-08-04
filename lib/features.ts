// Weight capture is ON.
//
// This outlet runs the Raspberry Pi + HX711 load-cell station. The cell, mounting,
// wiring and calibration are verified good (a known 224 g weight reads correctly).
//
// Note on accuracy: the Pi bit-bangs the HX711 timing in software, and running
// Chromium + the KDS on the same Pi disturbs that loop, so the live reading can
// wobble by ~25 g under browser load. The stability guard on the evaluate screen is
// therefore set to tolerate that (see SCALE_MAX_SPREAD_G) so the weight shows instead
// of blocking. Treat the displayed weight as accurate to ~25 g, not to the gram. The
// permanent fix for gram-accuracy is a dedicated microcontroller reading the HX711
// off-CPU; until then this is the working compromise.
//
// To run on a phone with no scale, set this to false: the weight UI hides, the service
// is not polled, and weight_g is stored as null. expected_grams is kept per dish either
// way, so this flag is the only switch.
export const WEIGHT_ENABLED: boolean = true;
