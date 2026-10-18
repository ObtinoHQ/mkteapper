"""Cleanup list for MK: live products with the same title, and products still on a copy's web address.

Reads the public storefront catalog, so no admin token is needed and nothing is changed in the store.
Writes duplicates.csv:
- "same title": two or more live products share a title (a round and a rectangular version, or a
  copy that was never renamed). Shoppers see identical cards, and color swatches can't tell them apart.
- "copy address": the product was made by duplicating another one and kept its handle
  ("...-kopi", "...-copy", "kopi-af-..."), but it is a different product. Only the URL needs fixing.

  SHOPIFY_STORE=mk-taepper.myshopify.com python3 tools/find_duplicates.py
"""
import csv
import json
import os
import re
import urllib.request
from collections import defaultdict

COPY = re.compile(r"^(kopi-af-)?(.+?)(-(kopi|copy)(-\d+)?)?$")


def storefront_products(store):
    page = 1
    while True:
        url = f"https://{store}/products.json?limit=250&page={page}&_fd=0"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req) as r:
            products = json.load(r)["products"]
        if not products:
            return
        yield from products
        page += 1


products = {p["handle"]: p for p in storefront_products(os.environ["SHOPIFY_STORE"])}
rows = []
by_title = defaultdict(list)
for p in products.values():
    by_title[p["title"].strip().lower()].append(p)
for group in by_title.values():
    if len(group) > 1:
        for p in group:
            rows.append(["same title", p["handle"], p["title"], ", ".join(o["handle"] for o in group if o is not p)])
for handle, p in sorted(products.items()):
    m = COPY.match(handle)
    if m.group(1) or m.group(3):
        rows.append(["copy address", handle, p["title"], ""])

with open("duplicates.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["issue", "handle", "title", "same title as"])
    w.writerows(rows)
print(f"{sum(r[0] == 'same title' for r in rows)} products share a title, "
      f"{sum(r[0] == 'copy address' for r in rows)} are on a copy's address: duplicates.csv")
