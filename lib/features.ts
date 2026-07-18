// Weight capture is currently OFF.
//
// The outlets now run this app as an installable PWA on a dedicated Android phone
// instead of the Raspberry Pi + HX711 load-cell station, so there is no scale
// attached. With this false the app hides the weight UI, does not poll the local
// weight service, and stores weight_g as null rather than a meaningless number.
//
// Every dish keeps its expected_grams in the database, so flipping this back to
// true is all that is needed to bring the weight check back when a scale exists.
export const WEIGHT_ENABLED: boolean = false;
