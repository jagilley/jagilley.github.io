"""One-time assembly: inject generated SVG files and data into a page template.
After this the HTML in the repo is the source of truth (QA fixes go there, not here).

  python3 assemble.py TEMPLATE OUT KEY=FILE [KEY=FILE ...]

Each KEY=FILE replaces every `{{KEY}}` in the template with FILE's contents.
Files are inserted as-is; add attributes to an inserted <svg> tag with
KEY=FILE@ATTRS, e.g.  HERO_SVG=svgs/hero.svg@class="reveal d2"
Fails if a placeholder is missing from the template or left unfilled.
"""
import sys

tpl, out, *pairs = sys.argv[1:]
h = open(tpl).read()
for pair in pairs:
    key, spec = pair.split("=", 1)
    path, _, attrs = spec.partition("@")
    body = open(path).read().strip()
    if attrs and body.startswith("<svg "):
        body = "<svg " + attrs + " " + body[5:]
    tag = "{{" + key + "}}"
    if tag not in h:
        sys.exit("placeholder not found in template: " + tag)
    h = h.replace(tag, body)
if "{{" in h:
    i = h.index("{{")
    sys.exit("unfilled placeholder near: " + h[i:i + 40])
open(out, "w").write(h)
print("wrote", out, len(h), "bytes")
