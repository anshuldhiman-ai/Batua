"""
Re-extract clean logo tiles from the marketing spec image, with:
  - tight crops (no extra background)
  - transparent outer area (so only the rounded square tile is visible)
  - correctly named (LEFT half = dark-tile design = batua-logo-dark.png,
    used in LIGHT UI. RIGHT half = light-tile design = batua-logo-light.png,
    used in DARK UI.)
"""

from PIL import Image

SRC = r"F:\CODING\PROJECTS\batua\dark and light.png"
DST_DARK = r"F:\CODING\PROJECTS\batua\frontend\public\batua-logo-dark.png"
DST_LIGHT = r"F:\CODING\PROJECTS\batua\frontend\public\batua-logo-light.png"

# How close (Euclidean distance) a pixel must be to a background color to be
# considered background. Threshold handles antialiasing gradients on edges.
THRESHOLD = 32

WHITE_BG = (255, 255, 255)
DARK_BG = (24, 28, 32)  # matches the dark navy bg of the source's right half


def color_dist(c1, c2):
    return ((c1[0] - c2[0]) ** 2 + (c1[1] - c2[1]) ** 2 + (c1[2] - c2[2]) ** 2) ** 0.5


def is_bg(rgb, target, threshold=THRESHOLD):
    return color_dist(rgb, target) <= threshold


def find_tile_bbox(img, x_min, x_max, bg_test, y_limit):
    """Find the bounding box of non-background pixels in [x_min, x_max) x [0, y_limit).
    Cap at y_limit so the bottom-of-image text labels don't bloat the bbox."""
    px = img.load()
    w, h = img.size
    min_x, max_x = w, 0
    min_y, max_y = h, 0
    found = False
    for y in range(min(y_limit, h)):
        for x in range(x_min, x_max):
            rgb = px[x, y][:3]
            if not bg_test(rgb):
                found = True
                if x < min_x:
                    min_x = x
                if x > max_x:
                    max_x = x
                if y < min_y:
                    min_y = y
                if y > max_y:
                    max_y = y
    if not found:
        raise RuntimeError("No non-background pixels found in column range")
    return min_x, min_y, max_x + 1, max_y + 1


def square_crop_rect(bbox, padding=20):
    """Return a square rect centered on the bbox, with optional padding."""
    x1, y1, x2, y2 = bbox
    cx = (x1 + x2) / 2
    cy = (y1 + y2) / 2
    half = max(x2 - x1, y2 - y1) // 2 + padding
    return (
        max(0, int(cx - half)),
        max(0, int(cy - half)),
        min(2 * half, min(cx + half, 1e9)),
    )


def make_bg_transparent(img, bg_test):
    """Set alpha=0 on background-color pixels, keep alpha=255 elsewhere."""
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if bg_test((r, g, b)):
                px[x, y] = (r, g, b, 0)
    return img


def extract_tile(src_path, x_min, x_max, bg_color, out_path, out_size=512):
    src = Image.open(src_path).convert("RGBA")
    w, h = src.size
    # Skip the bottom 25% — that's where the "LIGHT MODE ICON DISPLAY" /
    # "DARK MODE ICON DISPLAY" labels live. We only want the icon area.
    y_limit = int(h * 0.80)
    bbox = find_tile_bbox(src, x_min, x_max, lambda c: is_bg(c, bg_color), y_limit)
    x1, y1, x2, y2 = bbox

    # Center the bbox and build a square crop from it.
    cx = (x1 + x2) // 2
    cy = (y1 + y2) // 2
    tile_w = x2 - x1
    tile_h = y2 - y1
    side = max(tile_w, tile_h)
    pad = 40  # breathing room around the tile
    half = side // 2 + pad

    # Build rect clamped to source bounds
    rx1 = max(0, cx - half)
    ry1 = max(0, cy - half)
    rx2 = min(w, cx + half)
    ry2 = min(y_limit, cy + half)
    rect = (rx1, ry1, rx2, ry2)

    tile = src.crop(rect)
    # Make remaining background pixels transparent
    make_bg_transparent(tile, lambda c: is_bg(c, bg_color))
    # Final resize for a sane size + bit of antialias smoothing
    tile = tile.resize((out_size, out_size), Image.LANCZOS)
    tile.save(out_path, "PNG", optimize=True)
    print(f"saved {out_path}  (final {tile.size[0]}x{tile.size[1]})")
    return tile.size


# Source is 2752x1536. The seam between the white-bg left half and dark-bg
# right half is at approximately x=1376.
w, h = Image.open(SRC).size
print(f"source: {w}x{h}")
seam = w // 2

# LEFT half: dark-tile design on white background
#   - search for non-white pixels in x=[0, seam) to find tile bounds
#   - save as batua-logo-dark.png (used in LIGHT UI)
print("Extracting LEFT half (dark tile)...")
extract_tile(SRC, 0, seam, WHITE_BG, DST_DARK)

# RIGHT half: light-tile design on dark background
print("Extracting RIGHT half (light tile)...")
extract_tile(SRC, seam, w, DARK_BG, DST_LIGHT)

print("done")
