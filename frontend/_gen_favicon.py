"""Generate transparent-background favicon SVGs from the app's Logo component.

Reads frontend/src/components/Logo.tsx, extracts the exact path geometry and
emits two standalone SVGs (light/dark variants for the browser tab favicon) with
concrete colours and NO background tile -- matching the in-app transparent logo.

All <path> elements in Logo.tsx are glyph paths (the mask uses <circle>/<rect>
and the coin rings use <circle>), so a plain scan is reliable: the first 4 are
the "B" glyph, the last (5th) is the small coin-stack.
"""
import os
import re

SRC = os.path.join(os.path.dirname(__file__), "src", "components", "Logo.tsx")
OUT = os.path.join(os.path.dirname(__file__), "public")

text = open(SRC, encoding="utf-8").read()
paths = re.findall(r'<path\s+d="([^"]+)"', text)
if len(paths) != 5:
    raise SystemExit(f"expected 5 glyph paths, got {len(paths)}")
big, small_path = paths[:4], paths[4]

W = H = 973
COIN_HOLES = (
    '<circle cx="338.7" cy="239.0" r="42" fill="#000" />\n      '
    '<circle cx="481.5" cy="364.9" r="42" fill="#000" />\n      '
    '<circle cx="339.0" cy="426.8" r="42" fill="#000" />\n      '
    '<circle cx="629.5" cy="684.2" r="22" fill="#000" />\n      '
    '<rect x="355" y="578" width="175" height="228" fill="#000" />'
)


def make_svg(glyph, ring):
    big_paths = "\n".join(f'      <path d="{d}" />' for d in big)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
  <defs>
    <mask id="logo-holes" maskUnits="userSpaceOnUse">
      <rect x="0" y="0" width="{W}" height="{H}" fill="#fff" />
      {COIN_HOLES}
    </mask>
  </defs>
  <g mask="url(#logo-holes)">
    <g transform="scale(0.25) translate(0.000000,3892.000000) scale(0.100000,-0.100000)" fill="{glyph}" stroke="none">
{big_paths}
    </g>
  </g>
  <circle cx="338.7" cy="239.0" r="28.4" fill="none" stroke="{ring}" stroke-width="22" />
  <circle cx="481.5" cy="364.9" r="28.4" fill="none" stroke="{ring}" stroke-width="22" />
  <circle cx="339.0" cy="426.8" r="28.4" fill="none" stroke="{ring}" stroke-width="22" />
  <circle cx="629.5" cy="684.2" r="18.6" fill="{glyph}" />
  <g transform="translate(377.95,595) scale(0.08703)">
    <g transform="translate(0,2172) scale(0.1,-0.1)">
      <path d="{small_path}" fill="{glyph}" />
    </g>
  </g>
</svg>
"""

variants = {
    "b_logo_light.svg": ("#1F2A31", "#176B5C"),  # dark glyph for light browser tabs
    "b_logo_dark.svg": ("#F2F1EE", "#3EC28A"),   # light glyph for dark browser tabs
}
for name, (glyph, ring) in variants.items():
    svg = make_svg(glyph, ring)
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        f.write(svg)
    print(f"wrote {name} ({len(svg)} bytes)")
