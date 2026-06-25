#!/usr/bin/env python3
"""
Nutriobox - HX711 pin auto-detector (Raspberry Pi CM4, 64-bit Raspberry Pi OS).

You DO NOT need to open the box, touch any wires, or know anything about the
hardware. The load cell + HX711 are already wired to the Pi. This script simply
listens to every possible pin pair and figures out, by itself, which two GPIO
pins the HX711's DATA (DT) and CLOCK (SCK) lines are connected to.

How it works (you just follow the prompts):
  1. Take everything OFF the weighing platform.  -> it scans (empty reading)
  2. Put something heavy on the platform (a full water bottle, a packet, etc.)
  3. It re-scans and picks the ONE pin pair whose reading changed the most.
     That pair is your real wiring.

It then saves the answer to hx711_pins.json, which weight_server.py reads
automatically. Done. No further hardware work.

Run:   sudo python3 find_pins.py
"""
import json
import os
import sys
import time

try:
    import lgpio
except ImportError:
    sys.exit("lgpio not installed. Run:  sudo apt install -y python3-lgpio")

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_FILE = os.path.join(HERE, "hx711_pins.json")

# BCM GPIO numbers exposed on the 40-pin header. We skip nothing risky here -
# the script only ever drives one candidate clock pin at a time, briefly.
CANDIDATES = [2, 3, 4, 17, 27, 22, 10, 9, 11, 5, 6, 13, 19, 26,
              14, 15, 18, 23, 24, 25, 8, 7, 12, 16, 20, 21]

READY_TIMEOUT = 0.12   # seconds to wait for "data ready" before giving up on a pair


def _read_pair(h, dt, sck):
    """Try to read one 24-bit HX711 sample assuming DT=dt, SCK=sck.
    Returns a signed int, or None if this pair doesn't behave like an HX711."""
    try:
        lgpio.gpio_claim_input(h, dt)
        lgpio.gpio_claim_output(h, sck, 0)
    except Exception:
        try: lgpio.gpio_free(h, dt)
        except Exception: pass
        try: lgpio.gpio_free(h, sck)
        except Exception: pass
        return None
    val = None
    try:
        # Pulse clock low and wait for DOUT (dt) to fall = data ready
        lgpio.gpio_write(h, sck, 0)
        t0 = time.time()
        while lgpio.gpio_read(h, dt) == 1:
            if time.time() - t0 > READY_TIMEOUT:
                raise TimeoutError
        count = 0
        for _ in range(24):
            lgpio.gpio_write(h, sck, 1)
            bit = lgpio.gpio_read(h, dt)
            lgpio.gpio_write(h, sck, 0)
            count = (count << 1) | bit
        lgpio.gpio_write(h, sck, 1)   # 25th pulse -> channel A gain 128
        lgpio.gpio_write(h, sck, 0)
        if count & 0x800000:
            count -= 0x1000000
        # Reject the two "dead line" giveaways: stuck at 0 or stuck at full-scale.
        if count == 0 or count == -1 or count == 0x7FFFFF or count == -0x800000:
            val = None
        else:
            val = count
    except TimeoutError:
        val = None
    finally:
        try: lgpio.gpio_free(h, dt)
        except Exception: pass
        try: lgpio.gpio_free(h, sck)
        except Exception: pass
    return val


def scan(h):
    """Return {(dt,sck): median_value} for every pair that looks like a live HX711."""
    live = {}
    for dt in CANDIDATES:
        for sck in CANDIDATES:
            if dt == sck:
                continue
            samples = []
            for _ in range(5):
                v = _read_pair(h, dt, sck)
                if v is None:
                    break
                samples.append(v)
            if len(samples) >= 4:        # consistently readable = real candidate
                samples.sort()
                live[(dt, sck)] = samples[len(samples) // 2]
    return live


def main():
    h = lgpio.gpiochip_open(0)
    try:
        input("STEP 1 of 2 — make sure the platform is EMPTY, then press Enter...")
        print("  scanning (empty)...")
        empty = scan(h)
        if not empty:
            sys.exit(
                "\nNo HX711-like signal found on any pin.\n"
                "Check that the machine/Pi is powered and the load-cell board has power.\n"
                "If it still fails, the HX711 may use an unusual pin - tell Claude."
            )
        print(f"  found {len(empty)} candidate pair(s).")

        input("\nSTEP 2 of 2 — now PLACE A HEAVY ITEM on the platform, then press Enter...")
        print("  scanning (loaded)...")
        loaded = scan(h)

        # Pick the pair present in both scans whose reading changed the most.
        best = None
        best_delta = -1
        for pair, e in empty.items():
            if pair in loaded:
                delta = abs(loaded[pair] - e)
                if delta > best_delta:
                    best_delta = delta
                    best = pair

        if best is None or best_delta < 500:
            print("\nCouldn't confirm a pair by weight change.")
            print("Candidate pairs seen while empty (DT, SCK): ",
                  ", ".join(f"({d},{s})" for d, s in empty))
            sys.exit("Try again with a heavier item, or send this output to Claude.")

        dt, sck = best
        json.dump({"dt": dt, "sck": sck}, open(OUT_FILE, "w"))
        print("\n========================================")
        print(f"  FOUND IT  ->  DT (data) = GPIO {dt}   |   SCK (clock) = GPIO {sck}")
        print(f"  reading changed by {best_delta} when you added weight (good).")
        print(f"  saved to {OUT_FILE}")
        print("========================================")
        print("\nNothing else to set. Just start the service:")
        print("    python3 weight_server.py")
    finally:
        lgpio.gpiochip_close(h)


if __name__ == "__main__":
    main()
