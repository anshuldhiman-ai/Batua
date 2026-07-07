"""v3 — tighter detection of the tile body + the B-icon content inside it,
then re-render with smaller corner radius and a perfectly centered icon."""
import os
from PIL import Image, ImageDraw

SRC = r"F:\CODING\PROJECTS\batua\dark and light.png"
OUT = r"F:\CODING\PROJECTS\batua\data\_icons"
os.makedirs(OUT, exist_ok=True)

src = Image.open(SRC).convert("RGB")
W, H = src.size
mid = W // 2
half_left = src.crop((0, 0, mid, H)).convert("RGB")
half_right = src.crop((mid, 0, W, H)).convert("RGB")


def find_tile_bounds(img, bg_is_dark: bool):
    """Tight bbox of the rounded tile.

    Strategy: use a generous row-coverage threshold for the top/bottom edges,
    and a strict horizontal threshold (any-tile-pixel) for the left/right edges.
    The wallet-clasp area on the right has sparse dark coverage, so a strict
    per-row threshold would cut it off — but as long as even one tile pixel
    exists at every y between bbox_top and bbox_bottom, that x is part of the
    tile's column range.
    """
    w, h = img.size
    px = img.load()
    is_tile = (lambda r, g, b: (r + g + b) / 3 > 100) if bg_is_dark \
              else (lambda r, g, b: (r + g + b) / 3 < 100)

    samples_per_row = max(1, w // 4)
    THRESH = samples_per_row * 0.25
    row_cov = [
        sum(1 for x in range(0, w, 4) if is_tile(*px[x, y]))
        for y in range(h)
    ]
    tile_rows = [y for y, c in enumerate(row_cov) if c > THRESH]
    if not tile_rows:
        return None
    cur = [tile_rows[0]]
    runs = []
    for y in tile_rows[1:]:
        if y - cur[-1] <= 2:
            cur.append(y)
        else:
            runs.append(cur); cur = [y]
    runs.append(cur)
    longest = max(runs, key=len)
    y_min, y_max = longest[0], longest[-1]

    # For columns, accept ANY tile pixel within the y range — that catches
    # even sparse stroke columns like the wallet clasp's right edge.
    col_has_tile = [
        any(is_tile(*px[x, y]) for y in range(y_min, y_max + 1))
        for x in range(w)
    ]
    tile_cols = [x for x, has in enumerate(col_has_tile) if has]
    cur = [tile_cols[0]]
    runs2 = []
    for x in tile_cols[1:]:
        if x - cur[-1] <= 2:
            cur.append(x)
        else:
            runs2.append(cur); cur = [x]
    runs2.append(cur)
    longest_x = max(runs2, key=len)
    x_min, x_max = longest_x[0], longest_x[-1]
    return x_min, y_min, x_max, y_max


def find_icon_bounds(tile_img, bg_is_dark: bool):
    """Bbox of the inner icon (everything that is NOT the tile-body color)."""
    rgb = tile_img.convert("RGB")
    px = rgb.load()
    w, h = rgb.size
    # Sample tile body color DEEP inside the tile.
    body_color = px[w // 2, h - 5]

    def is_icon(r, g, b):
        return abs(r - body_color[0]) + abs(g - body_color[1]) + abs(b - body_color[2]) > 50

    # Inset by ~6% of the smaller dimension to clear the rounded corners.
    # The icon strokes (white B-shape on dark tile, dark B-shape on light tile)
    # sit well inside the rounded square, so a small inset clears the corners
    # without excluding any icon content.
    inset = max(8, int(min(w, h) * 0.06))
    x_lo, y_lo = inset, inset
    x_hi, y_hi = w - inset, h - inset

    min_x, min_y, max_x, max_y = w, h, 0, 0
    found = False
    for y in range(y_lo, y_hi):
        for x in range(x_lo, x_hi):
            if is_icon(*px[x, y]):
                found = True
                if x < min_x: min_x = x
                if x > max_x: max_x = x
                if y < min_y: min_y = y
                if y > max_y: max_y = y
    if not found:
        return None
    return min_x, min_y, max_x, max_y


def render_tile(tile_img, tile_bbox, icon_bbox, size=1024, corner_radius_frac=0.16):
    """Render a square favicon canvas with smaller rounded corners and the B icon
    perfectly centered within the rounded area's visual center.

    Visual-center heuristic for a rounded square with corner radius r:
    the perceived visual weight is the same as the geometric center, so we
    place the icon at (size/2, size/2) on the canvas — but we treat the icon's
    bbox center, not its top-left, as the alignment reference.
    """
    x1, y1, x2, y2 = tile_bbox
    tile_w, tile_h = x2 - x1 + 1, y2 - y1 + 1
    # Crop the tile
    tile = tile_img.crop(tile_bbox).convert("RGBA")
    ix1, iy1, ix2, iy2 = icon_bbox
    # Adjust icon bbox from full-image coords to tile-crop coords
    icon_in_tile = (ix1 - x1, iy1 - y1, ix2 - x1, iy2 - y1)
    icon_w = icon_in_tile[2] - icon_in_tile[0] + 1
    icon_h = icon_in_tile[3] - icon_in_tile[1] + 1

    # Determine tile body color — sample near top edge of tile (well inside any rounded corners)
    body_color = tile.getpixel((tile_w // 2, 4))[:3]
    # Find tile's natural corner radius by checking where the rounded part ends
    # (scan top-left corner along the diagonal to see where dark pixels appear)
    # Simpler: read it from the tile's shape — sample the first non-bg pixel
    # along the top edge from the left, that's where the curve meets the top.
    px = tile.convert("RGB").load()
    # Find first dark pixel from left along y=4
    natural_r = 0
    for x in range(tile_w):
        if px[x, 4] != body_color:
            natural_r = x
            break
    # New radius: ~16% of size (rounded square look, but less pillow-y than the original)
    new_r = max(8, int(size * corner_radius_frac))

    # Build new canvas
    canvas = Image.new("RGBA", (size, size), body_color + (255,))
    # Scale the B icon to ~78% of canvas so it sits comfortably with even padding
    target_icon_size = int(size * 0.78)
    icon_scale = target_icon_size / max(icon_w, icon_h)
    new_icon_w = int(icon_w * icon_scale)
    new_icon_h = int(icon_h * icon_scale)
    # Crop the icon content out of the tile (with some surrounding tile body for context)
    pad = 4
    crop_box = (
        max(0, icon_in_tile[0] - pad),
        max(0, icon_in_tile[1] - pad),
        min(tile_w, icon_in_tile[2] + 1 + pad),
        min(tile_h, icon_in_tile[3] + 1 + pad),
    )
    icon_strip = tile.crop(crop_box)
    icon_resized = icon_strip.resize(
        (new_icon_w + 2 * int(pad * icon_scale),
         new_icon_h + 2 * int(pad * icon_scale)),
        Image.LANCZOS,
    )
    # Center the resized icon on the canvas
    paste_x = (size - icon_resized.size[0]) // 2
    paste_y = (size - icon_resized.size[1]) // 2
    canvas.paste(icon_resized, (paste_x, paste_y), icon_resized)

    # Apply rounded-corner mask
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=new_r, fill=255)
    canvas.putalpha(mask)

    return canvas


# Process LEFT (light mode — dark tile, light icon)
lbb = find_tile_bounds(half_left, bg_is_dark=False)
print("LEFT tile bbox:", lbb)
tile_left = half_left.crop(lbb)
libb = find_icon_bounds(tile_left, bg_is_dark=False)
print("LEFT icon bbox (in tile):", libb)
light_icon = render_tile(half_left, lbb, libb, size=1024)
light_icon.save(os.path.join(OUT, "source-left.png"))

# Process RIGHT (dark mode — light tile, dark icon)
rbb = find_tile_bounds(half_right, bg_is_dark=True)
print("RIGHT tile bbox:", rbb)
tile_right = half_right.crop(rbb)
ribb = find_icon_bounds(tile_right, bg_is_dark=True)
print("RIGHT icon bbox (in tile):", ribb)
dark_icon = render_tile(half_right, rbb, ribb, size=1024)
dark_icon.save(os.path.join(OUT, "source-right.png"))

print("Source sizes:", light_icon.size, dark_icon.size)


def emit(square_img, label):
    # Sample tile body color (alpha-aware by flat-fill first)
    bg = Image.new("RGBA", square_img.size, (255, 255, 255, 255))
    bg.paste(square_img, (0, 0), square_img)
    flat = bg.convert("RGB")
    SIZES = [16, 32, 48, 64, 180, 192, 512]
    for s in SIZES:
        out_path = os.path.join(OUT, f"{label}-{s}.png")
        flat.resize((s, s), Image.LANCZOS).save(out_path)
    ico_path = os.path.join(OUT, f"{label}.ico")
    flat.resize((256, 256), Image.LANCZOS).save(
        ico_path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (256, 256)]
    )
    print(f"Emitted set for {label}")


emit(light_icon, "light")
emit(dark_icon, "dark")
print("Done.")
