"""Generate PWA icons for North Shore Minis Sunday Rugby from the source logo.

Produces four PNGs in docs/assets/:
  icon-192.png             — manifest icon, purpose: any (192x192)
  icon-512.png             — manifest icon, purpose: any (512x512)
  icon-512-maskable.png    — manifest icon, purpose: maskable (512x512)
  apple-touch-icon-180.png — iOS home-screen icon (180x180, opaque RGB)

Source: docs/assets/sunday-minis-logo-on-navy.png (the circular badge on a
navy background). The badge is already roughly square and self-contained, so
we just resize and centre it on a navy canvas. Maskable uses a tighter scale
so the badge stays inside Android's 80% safe-zone circle.

Run:  python3 scripts/generate-icons.py
"""
from PIL import Image
from pathlib import Path

NAVY = (6, 22, 62)  # #06163e — matches docs/index.html --navy-dark

ROOT = Path(__file__).parent.parent
ASSETS = ROOT / "docs" / "assets"
SOURCE = ASSETS / "sunday-minis-logo-b-bg.png"


def render_icon(badge: Image.Image, size: int, *, scale: float) -> Image.Image:
    """Centre-paste `badge` onto a navy canvas of `size`px, fitted to `scale`."""
    canvas = Image.new("RGBA", (size, size), NAVY + (255,))
    cw, ch = badge.size
    target = int(size * scale)
    if cw >= ch:
        new_w = target
        new_h = max(1, round(ch * target / cw))
    else:
        new_h = target
        new_w = max(1, round(cw * target / ch))
    resized = badge.resize((new_w, new_h), Image.LANCZOS)
    x = (size - new_w) // 2
    y = (size - new_h) // 2
    canvas.paste(resized, (x, y), resized if resized.mode == "RGBA" else None)
    return canvas


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(
            f"missing source logo: {SOURCE}\n"
            "Drop the navy-background variant of the Sunday Minis logo at\n"
            "docs/assets/sunday-minis-logo-b-bg.png (PNG, RGBA, ≥512px). The\n"
            "cream/light variant lives alongside as\n"
            "docs/assets/sunday-minis-logo-w-bg.png and is used in the browser\n"
            "header against the white background.")

    badge = Image.open(SOURCE).convert("RGBA")
    targets = [
        ("icon-512.png",             512, 0.92),
        ("icon-192.png",             192, 0.92),
        ("icon-512-maskable.png",    512, 0.72),
        ("apple-touch-icon-180.png", 180, 0.92),
    ]
    ASSETS.mkdir(parents=True, exist_ok=True)
    for name, size, scale in targets:
        img = render_icon(badge, size, scale=scale)
        if name.startswith("apple-touch"):
            img = img.convert("RGB")
        out = ASSETS / name
        img.save(out, "PNG", optimize=True)
        print(f"wrote {out.relative_to(ROOT)}  ({size}x{size}, scale={scale})")


if __name__ == "__main__":
    main()
