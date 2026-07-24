// Weight capture is ON.
//
// This outlet runs the Raspberry Pi + HX711 load-cell station. The cell was
// replaced and recalibrated on 2026-07-22 (scale ~391 counts/g, empty reads a
// stable 0), so the weight check is enabled again.
//
// With this true the KDS shows the live weight, polls the local weight service,
// applies the +/-15% tolerance against each dish's expected_grams, and refuses to
// save a reading while the scale is unstable (see the evaluate screen's scale guard).
//
// To run on a phone with no scale, set this back to false: the weight UI hides, the
// service is not polled, and weight_g is stored as null. expected_grams is retained
// per dish either way, so this flag is the only switch.
export const WEIGHT_ENABLED: boolean = true;
