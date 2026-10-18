"""Link rugs that are the same design in different colors, for the color swatches on the product page.

Groups products by vendor + title without the last word ("... Kenso Brun" / "... Kenso Beige").
Sets metafields custom.farvevarianter (list of products) and custom.farve (color name).

Dry run by default: writes color_groups.csv. Review it, fix groups by hand in the admin if needed.
  SHOPIFY_STORE=... SHOPIFY_ADMIN_TOKEN=... python3 tools/color_groups.py [--apply]
"""
import csv
import sys
from collections import defaultdict

from mk_shopify import all_products, gql

APPLY = "--apply" in sys.argv
SET = """mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { userErrors { field message } } }"""

groups = defaultdict(list)
for p in all_products("id title handle vendor status"):
    if p["status"] != "ACTIVE":
        continue
    words = p["title"].replace(",", " ").split()
    if len(words) < 3:
        continue
    group = groups[(p["vendor"], " ".join(words[:-1]).lower())]
    # Products that share a title (a round and a rectangular version) would show as two identical swatches
    if any(o["title"].lower() == p["title"].lower() for o, _ in group):
        continue
    group.append((p, words[-1]))

rows, batch = [], []
for (vendor, base), members in groups.items():
    if len(members) < 2:
        continue
    ids = [p["id"] for p, _ in members]
    for p, color in members:
        rows.append([base, p["handle"], color, len(members)])
        batch += [
            {"ownerId": p["id"], "namespace": "custom", "key": "farvevarianter", "type": "list.product_reference", "value": str(ids).replace("'", '"')},
            {"ownerId": p["id"], "namespace": "custom", "key": "farve", "type": "single_line_text_field", "value": color},
        ]

if APPLY:
    for i in range(0, len(batch), 25):
        errs = gql(SET, {"m": batch[i : i + 25]})["metafieldsSet"]["userErrors"]
        if errs:
            print(errs)

with open("color_groups.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["group", "handle", "color", "group size"])
    w.writerows(sorted(rows))
print(f"{len({r[0] for r in rows})} groups, {len(rows)} products. {'APPLIED' if APPLY else 'Dry run'}: color_groups.csv")
