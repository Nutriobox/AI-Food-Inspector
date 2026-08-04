#!/usr/bin/env python3
# Adds automatic zero-tracking to the NutrioBox weight service so the scale cancels
# its own drift and never needs a daily re-tare. Zero-tracking only acts when the
# reading is within ZERO_TRACK_BAND grams of zero, so a real dish (far outside the
# band) is never zeroed. Safe pattern: backs up, validates, restarts only if valid.
import io, os, sys, py_compile, shutil, subprocess

P = "/home/admin/pi-weight-service/weight_server.py"
BAK = P + ".bak_zerotrack"
s = io.open(P, encoding="utf-8").read()
orig = s

# 1) constants: add right after the DEADZONE definition
dz = 'DEADZONE = float(os.environ.get("WEIGHT_DEADZONE", "5"))'
if dz in s and "ZERO_TRACK_BAND" not in s:
    s = s.replace(dz, dz +
        '\n# Auto-zero tracking: cancels slow drift so the scale never needs a daily tare.'
        '\nZERO_TRACK_BAND = float(os.environ.get("ZERO_TRACK_BAND", "30"))  # only track within +/- this many g of zero'
        '\nZERO_TRACK_RATE = float(os.environ.get("ZERO_TRACK_RATE", "0.015"))  # correction speed (fraction/cycle)', 1)
    print("ok: constants added")
elif "ZERO_TRACK_BAND" in s:
    print("skip: constants already present")
else:
    print("ERROR: DEADZONE anchor not found"); sys.exit(1)

# 2) insert the tracking step in the background loop, right after read_grams()
loop_anchor = ("            g, raw = read_grams()\n"
               "            if abs(g) < DEADZONE:")
loop_new = ("            g, raw = read_grams()\n"
            "            # Zero-tracking: when the platform is near-empty, nudge the offset\n"
            "            # toward the live raw value so slow drift cancels itself. A real dish\n"
            "            # sits far outside the band, so it is never affected; after a dish is\n"
            "            # removed the reading falls back through the band and re-zeros.\n"
            "            if abs(g) < ZERO_TRACK_BAND:\n"
            "                _cal['offset'] += ZERO_TRACK_RATE * (raw - _cal['offset'])\n"
            "                g = (raw - _cal['offset']) / _cal['scale']\n"
            "            if abs(g) < DEADZONE:")
if loop_new.split(chr(10))[1].strip() in s:
    print("skip: zero-tracking already in loop")
elif loop_anchor in s:
    s = s.replace(loop_anchor, loop_new, 1)
    print("ok: zero-tracking added to loop")
else:
    print("ERROR: loop anchor not found"); sys.exit(1)

if s == orig:
    print("nothing to change - already patched."); sys.exit(0)

shutil.copyfile(P, BAK)
io.open(P, "w", encoding="utf-8").write(s)
try:
    py_compile.compile(P, doraise=True)
    print("ok: compiles")
except Exception as e:
    shutil.copyfile(BAK, P)
    print("FAILED compile, restored backup:", e); sys.exit(1)

subprocess.run(["pkill", "-f", "weight_server.py"])  # systemd respawns it (keeps RT priority)
print("done. service restarting with auto zero-tracking. no more daily tare needed.")
