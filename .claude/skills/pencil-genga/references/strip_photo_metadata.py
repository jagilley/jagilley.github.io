#!/usr/bin/env python3
"""Copy JPEG photos without their metadata, losslessly, so they can be committed.

Phone photos carry GPS coordinates, device details and capture times in EXIF/XMP, and this repo is a
public website. This drops every metadata segment and anything appended after the image (iPhone gain
maps), and copies the compressed image data byte for byte, so the pixels the extraction tools read are
unchanged. The colour profile is kept.

    python3 strip_photo_metadata.py OUT_DIR photo1.jpg [photo2.jpg ...]

EXIF orientation is dropped with the rest. A photo whose orientation tag is not 1 would load rotated
afterwards, so the script refuses it: rotate it upright first (e.g. `sips -r 90`), then strip.
If Pillow is importable, each copy is also decoded and compared with its source.
"""
import sys
from pathlib import Path

SOI, EOI, SOS, COM = 0xD8, 0xD9, 0xDA, 0xFE
KEEP_APP = {0xE0: None, 0xE2: b"ICC_PROFILE\x00", 0xEE: b"Adobe"}   # JFIF, colour profile, Adobe transform


def orientation(b):
    """EXIF orientation of the JPEG bytes (1 if there is none)."""
    i = b.find(b"Exif\x00\x00")
    if i < 0:
        return 1
    t = b[i + 6:]
    le = t[:2] == b"II"
    u16 = lambda o: int.from_bytes(t[o:o + 2], "little" if le else "big")
    u32 = lambda o: int.from_bytes(t[o:o + 4], "little" if le else "big")
    ifd = u32(4)
    for k in range(u16(ifd)):
        e = ifd + 2 + 12 * k
        if u16(e) == 0x0112:
            return u16(e + 8)
    return 1


def strip(b):
    if b[:2] != bytes([0xFF, SOI]):
        raise ValueError("not a JPEG")
    out = bytearray(b[:2])
    i = 2
    while True:
        if b[i] != 0xFF:
            raise ValueError(f"expected a marker at byte {i}")
        while b[i + 1] == 0xFF:          # fill bytes
            i += 1
        m = b[i + 1]
        if m == EOI:
            out += b[i:i + 2]
            return bytes(out)            # anything after the first image is dropped
        if 0xD0 <= m <= 0xD7 or m == 0x01:
            out += b[i:i + 2]
            i += 2
            continue
        n = int.from_bytes(b[i + 2:i + 4], "big")
        seg = b[i:i + 2 + n]
        i += 2 + n
        is_app = 0xE0 <= m <= 0xEF
        if is_app:
            sig = KEEP_APP.get(m, False)
            keep = sig is None or (sig is not False and seg[4:4 + len(sig)] == sig)
        else:
            keep = m != COM
        if keep:
            out += seg
        if m == SOS:                     # entropy-coded data runs to the next real marker
            j = i
            while not (b[j] == 0xFF and b[j + 1] != 0x00 and not 0xD0 <= b[j + 1] <= 0xD7 and b[j + 1] != 0xFF):
                j += 1
            out += b[i:j]
            i = j


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    out_dir = Path(sys.argv[1])
    out_dir.mkdir(parents=True, exist_ok=True)
    try:
        from PIL import Image, ImageChops
    except ImportError:
        Image = None
    for src in map(Path, sys.argv[2:]):
        raw = src.read_bytes()
        o = orientation(raw)
        if o != 1:
            sys.exit(f"{src}: EXIF orientation is {o}; rotate it upright first, then strip")
        clean = strip(raw)
        dst = out_dir / src.name
        dst.write_bytes(clean)
        note = ""
        if Image:
            a, c = Image.open(src), Image.open(dst)
            same = a.size == c.size and ImageChops.difference(a.convert("RGB"), c.convert("RGB")).getbbox() is None
            left = len(c.getexif())
            if not same or left:
                sys.exit(f"{dst}: check failed (pixels identical: {same}, EXIF tags left: {left})")
            note = ", pixels identical, no EXIF"
        print(f"{src.name}: {len(raw)} -> {len(clean)} bytes{note}")


if __name__ == "__main__":
    main()
