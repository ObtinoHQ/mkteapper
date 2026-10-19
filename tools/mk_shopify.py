"""Shared helpers for the MK data scripts (Shopify Admin GraphQL, stdlib only).

Env: SHOPIFY_STORE (e.g. mktaepper.myshopify.com), SHOPIFY_ADMIN_TOKEN (Admin API access token
with read_products/write_products).
"""
import json
import os
import re
import time
import urllib.request

API_VERSION = "2025-07"


def gql(query, variables=None):
    store = os.environ["SHOPIFY_STORE"]
    req = urllib.request.Request(
        f"https://{store}/admin/api/{API_VERSION}/graphql.json",
        data=json.dumps({"query": query, "variables": variables or {}}).encode(),
        headers={"Content-Type": "application/json", "X-Shopify-Access-Token": os.environ["SHOPIFY_ADMIN_TOKEN"]},
    )
    for attempt in range(5):
        with urllib.request.urlopen(req) as r:
            data = json.load(r)
        if any(e.get("extensions", {}).get("code") == "THROTTLED" for e in data.get("errors", [])):
            time.sleep(2 ** attempt)
            continue
        if data.get("errors"):
            raise RuntimeError(data["errors"])
        return data["data"]
    raise RuntimeError("throttled")


def all_products(fields):
    cursor = None
    while True:
        data = gql(
            f"""query($c: String) {{ products(first: 100, after: $c) {{
                pageInfo {{ hasNextPage endCursor }} nodes {{ {fields} }} }} }}""",
            {"c": cursor},
        )
        yield from data["products"]["nodes"]
        if not data["products"]["pageInfo"]["hasNextPage"]:
            return
        cursor = data["products"]["pageInfo"]["endCursor"]


def parse_size(value):
    """Same rules as snippets/mk-size-parse.liquid. Returns (a, b, shape) or None."""
    raw = str(value).lower().strip()
    shape = "round" if any(c in raw for c in ("rund", "ø", "⌀")) else "rect"
    clean = raw
    for w in ("cm", "rundt", "rund", "løber", "ø", "⌀", "ca."):
        clean = clean.replace(w, "")
    clean = clean.replace("×", "x").replace("*", "x").replace(",", ".").replace(" ", "")
    parts = clean.split("x")
    if len(parts) < 2 and shape != "round":
        return None
    try:
        a = float(re.match(r"[\d.]+", parts[0]).group())
        b = float(re.match(r"[\d.]+", parts[1]).group()) if len(parts) > 1 else a
    except (AttributeError, ValueError):
        return None
    if a < 20 or b < 20:
        return None
    a, b = sorted((round(a), round(b)))
    if shape == "rect" and b >= a * 2.5:
        shape = "runner"
    return a, b, shape


SHAPE_WORDS = ("oval", "organisk", "shape")
NOTE_MARKERS = ("(", "forudbestilling")


def canonical(value):
    """One naming scheme for the filter: '160x230 cm', 'Ø160 cm', '120x170 cm oval'."""
    p = parse_size(value)
    if not p:
        return None
    a, b, shape = p
    raw = str(value).lower()
    if shape == "round":
        name = f"Ø{a} cm" if a == b else f"{a}x{b} cm oval"
    else:
        name = f"{a}x{b} cm"
    # Shape words the size alone doesn't carry: dropping them would sell an oval as a rectangle
    for word in SHAPE_WORDS:
        if word in raw and word not in name:
            name += f" {word}"
            break
    # Keep notes such as "(FORUDBESTILLING UGE 46)" as they are
    cut = min((raw.find(m) for m in NOTE_MARKERS if m in raw), default=-1)
    if cut >= 0:
        name += " " + str(value)[cut:].strip()
    return name
