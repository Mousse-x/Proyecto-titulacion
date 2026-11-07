from __future__ import annotations

import math
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw


def page_number(path: Path) -> int:
    match = re.search(r"(\d+)$", path.stem)
    return int(match.group(1)) if match else 0


def main() -> None:
    source = Path(sys.argv[1])
    destination = Path(sys.argv[2])
    destination.mkdir(parents=True, exist_ok=True)

    pages = sorted(source.glob("page-*.png"), key=page_number)
    columns, rows = 4, 5
    thumb_w, thumb_h = 280, 396
    label_h, gap = 28, 16
    sheet_w = columns * thumb_w + (columns + 1) * gap
    sheet_h = rows * (thumb_h + label_h) + (rows + 1) * gap

    for sheet_index in range(math.ceil(len(pages) / (columns * rows))):
        batch = pages[sheet_index * columns * rows : (sheet_index + 1) * columns * rows]
        canvas = Image.new("RGB", (sheet_w, sheet_h), "#d9d9d9")
        draw = ImageDraw.Draw(canvas)

        for index, page_path in enumerate(batch):
            row, column = divmod(index, columns)
            x = gap + column * thumb_w
            y = gap + row * (thumb_h + label_h)
            with Image.open(page_path) as page:
                page = page.convert("RGB")
                page.thumbnail((thumb_w, thumb_h), Image.Resampling.LANCZOS)
                px = x + (thumb_w - page.width) // 2
                py = y + (thumb_h - page.height) // 2
                canvas.paste(page, (px, py))
            label = f"Página {page_number(page_path)}"
            draw.rectangle((x, y + thumb_h, x + thumb_w, y + thumb_h + label_h), fill="white")
            draw.text((x + 8, y + thumb_h + 6), label, fill="black")

        first_page = page_number(batch[0])
        last_page = page_number(batch[-1])
        output = destination / f"contact_{first_page:03d}_{last_page:03d}.jpg"
        canvas.save(output, quality=90, optimize=True)

    print(f"Created {math.ceil(len(pages) / (columns * rows))} contact sheets from {len(pages)} pages")


if __name__ == "__main__":
    main()
