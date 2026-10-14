"""Make a QA copy of a page whose external stylesheets and scripts point at local
files, so headless renders do not wait on the network (a full-page render drops
from ~10 minutes to ~1 minute, and --virtual-time-budget screenshots stop hanging).

  python3 qa_copy.py /abs/page.html /abs/qa-dir   ->  /abs/qa-dir/<page>.html

Every <link rel="stylesheet" href="https://..."> and <script src="https://...">
is downloaded once into <qa-dir>/assets/ (skipped if already there) and the copy
is rewritten to reference the local file. Relative url(...) references inside a
downloaded stylesheet (fonts) are rewritten to absolute URLs on the original
host, so they still resolve. Skin-agnostic: nothing here names a particular CDN.
"""
import os, re, subprocess, sys
from urllib.parse import urljoin

src, qd = sys.argv[1], sys.argv[2]
assets = os.path.join(qd, "assets"); os.makedirs(assets, exist_ok=True)
h = open(src).read()

def local_name(url):
    base = re.sub(r"[^A-Za-z0-9._-]", "_", url.split("//", 1)[1])
    return base[-120:]

def fetch(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return
    print("fetching", url)
    subprocess.run(["curl", "-sL", "--max-time", "300", "-o", dest, url], check=True)

refs = re.findall(r'<link[^>]+rel="stylesheet"[^>]+href="(https?://[^"]+)"', h)
refs += re.findall(r'<script[^>]+src="(https?://[^"]+)"', h)
for url in sorted(set(refs)):
    dest = os.path.join(assets, local_name(url))
    fetch(url, dest)
    if dest.endswith(".css"):
        css = open(dest).read()
        css = re.sub(r"url\((['\"]?)(?!https?:|data:)([^)'\"]+)\1\)", lambda m: "url(%s)" % urljoin(url, m.group(2)), css)
        open(dest, "w").write(css)
    h = h.replace(url, "assets/" + os.path.basename(dest))

out = os.path.join(qd, os.path.basename(src)); open(out, "w").write(h); print("wrote", out)
