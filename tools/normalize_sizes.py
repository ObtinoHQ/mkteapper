"""Give every rug one size option named 'Størrelse' with values like '160x230 cm' and 'Ø160 cm'.

Dry run by default: writes size_changes.csv and changes nothing.
  SHOPIFY_STORE=... SHOPIFY_ADMIN_TOKEN=... python3 tools/normalize_sizes.py
  ... python3 tools/normalize_sizes.py --apply
Only run --apply after MK Tæpper has approved the CSV. Check feeds/apps that read variant titles.
"""
import csv
import sys

from mk_shopify import all_products, canonical, gql

SIZE_NAMES = {"størrelse", "size", "title", "str.", "mål", "storlek"}
APPLY = "--apply" in sys.argv

UPDATE = """mutation($p: ID!, $o: OptionUpdateInput!, $v: [OptionValueUpdateInput!]) {
  productOptionUpdate(productId: $p, option: $o, optionValuesToUpdate: $v) { userErrors { field message } } }"""

rows = []
for prod in all_products("id title handle options { id name optionValues { id name } }"):
    for opt in prod["options"]:
        values = opt["optionValues"]
        if values and values[0]["name"] == "Default Title":
            continue
        looks_like_size = opt["name"].lower() in SIZE_NAMES or canonical(values[0]["name"])
        if not looks_like_size:
            continue
        updates, seen = [], set()
        for v in values:
            new = canonical(v["name"])
            if not new:
                rows.append([prod["handle"], opt["name"], v["name"], "", "NOT A SIZE, left as is"])
                continue
            if new in seen:
                rows.append([prod["handle"], opt["name"], v["name"], new, "DUPLICATE after rename, left as is"])
                continue
            seen.add(new)
            if new != v["name"]:
                updates.append({"id": v["id"], "name": new})
            rows.append([prod["handle"], opt["name"], v["name"], new, "rename" if new != v["name"] else "ok"])
        rename_option = opt["name"] != "Størrelse"
        if APPLY and (updates or rename_option):
            res = gql(UPDATE, {"p": prod["id"], "o": {"id": opt["id"], "name": "Størrelse"}, "v": updates})
            errs = res["productOptionUpdate"]["userErrors"]
            if errs:
                print(prod["handle"], errs)
        break

with open("size_changes.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["handle", "option", "old value", "new value", "action"])
    w.writerows(rows)
print(f"{len(rows)} values, {sum(r[4] == 'rename' for r in rows)} renamed. {'APPLIED' if APPLY else 'Dry run'}: size_changes.csv")
