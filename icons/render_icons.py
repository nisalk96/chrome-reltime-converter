"""Render icons/icon.svg to PNG sizes for the Chrome extension."""
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SVG = ROOT / "icon.svg"
SVG_16 = ROOT / "icon-16.svg"
SIZES = (16, 48, 128)


def find_chrome() -> str:
    candidates = [
        Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
        Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
        Path.home() / r"AppData\Local\Google\Chrome\Application\chrome.exe",
    ]
    for p in candidates:
        if p.exists():
            return str(p)
    raise SystemExit("Chrome not found — needed to rasterize SVG icons")


def render_with_chrome(size: int, out: Path, svg: Path = SVG) -> None:
    chrome = find_chrome()
    svg_markup = svg.read_text(encoding="utf-8")
    # Force pixel size on root svg
    if 'width="' in svg_markup:
        import re

        svg_markup = re.sub(r'\bwidth="[^"]*"', f'width="{size}"', svg_markup, count=1)
        svg_markup = re.sub(r'\bheight="[^"]*"', f'height="{size}"', svg_markup, count=1)

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  html,body{{margin:0;padding:0;background:#0f172a;width:{size}px;height:{size}px;overflow:hidden}}
  svg{{display:block;width:{size}px;height:{size}px}}
</style></head>
<body>{svg_markup}</body></html>"""

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        html_path = tmp_path / "icon.html"
        shot = (tmp_path / "shot.png").resolve()
        html_path.write_text(html, encoding="utf-8")
        result = subprocess.run(
            [
                chrome,
                "--headless=new",
                "--disable-gpu",
                "--hide-scrollbars",
                "--allow-file-access-from-files",
                f"--window-size={size},{size}",
                f"--screenshot={shot}",
                html_path.resolve().as_uri(),
            ],
            capture_output=True,
            text=True,
            cwd=str(tmp_path),
        )
        # Chrome may write to cwd as shot.png
        candidates = [shot, tmp_path / "shot.png", Path.cwd() / "shot.png"]
        found = next((p for p in candidates if p.exists()), None)
        if found is None:
            raise RuntimeError(
                f"chrome exit {result.returncode}; stderr={result.stderr[-500:]!r}"
            )

        from PIL import Image

        im = Image.open(found).convert("RGBA")
        if im.size != (size, size):
            im = im.crop((0, 0, min(size, im.width), min(size, im.height)))
            if im.size != (size, size):
                im = im.resize((size, size), Image.Resampling.LANCZOS)
        im.save(out)


def render_with_pil(size: int, out: Path) -> None:
    """Fallback: gradient tile + centered white coin stacks."""
    from PIL import Image, ImageDraw

    im = Image.new("RGBA", (size, size), (15, 23, 42, 255))
    draw = ImageDraw.Draw(im)

    # Simple diagonal teal wash
    for y in range(size):
        t = y / max(1, size - 1)
        r = int(15 + (13 - 15) * t)
        g = int(23 + (148 - 23) * t)
        b = int(42 + (136 - 42) * t)
        draw.line([(0, y), (size, y)], fill=(r, g, b, 255))

    white = (255, 255, 255, 255)
    w = max(1, size // 18)
    # Front (lower) coin ellipse
    cx, cy = size // 2 + size // 10, int(size * 0.58)
    rx, ry = int(size * 0.28), int(size * 0.12)
    draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], outline=white, width=w)
    draw.arc(
        [cx - rx, cy - ry + int(size * 0.08), cx + rx, cy + ry + int(size * 0.18)],
        start=10,
        end=170,
        fill=white,
        width=w,
    )
    # Back (upper-left) coin
    cx2, cy2 = size // 2 - size // 12, int(size * 0.38)
    rx2, ry2 = int(size * 0.26), int(size * 0.11)
    draw.ellipse([cx2 - rx2, cy2 - ry2, cx2 + rx2, cy2 + ry2], outline=white, width=w)
    draw.line(
        [cx2 - rx2, cy2, cx2 - rx2, cy2 + int(size * 0.28)],
        fill=white,
        width=w,
    )
    draw.arc(
        [cx2 - rx2, cy2 + int(size * 0.18), cx2 + rx2, cy2 + int(size * 0.40)],
        start=20,
        end=160,
        fill=white,
        width=w,
    )

    im.save(out)


def main() -> None:
    for size in SIZES:
        out = ROOT / f"icon{size}.png"
        src = SVG_16 if size == 16 and SVG_16.exists() else SVG
        try:
            render_with_chrome(size, out, src)
            print(f"chrome -> {out.name} ({src.name})")
        except Exception as exc:
            print(f"chrome failed ({exc}); PIL fallback -> {out.name}")
            render_with_pil(size, out)
    print("done")


if __name__ == "__main__":
    main()
