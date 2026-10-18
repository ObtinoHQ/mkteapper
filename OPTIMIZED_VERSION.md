# MK Tæpper: optimized version (A/B test)

This branch is the "optimized version" from the analysis of 12 October 2026. It is meant to run as a
**separate, unpublished theme** against the live theme. Do not merge it into `main`: `main` is synced to the
live theme.

## Run the test

1. Shopify admin > Online Store > Themes > Add theme > Connect from GitHub > `ObtinoHQ/mkteapper`, branch `optimized-version`.
2. Fill in Theme settings > **MK optimering** (see below) and pick the underlay products.
3. Shoplift (already installed, `snippets/shoplift.liquid`): create a **theme test**, live theme vs. this theme, 50/50.
   Primary metric: revenue per visitor. Segment: device, Facebook/Instagram in-app browser, country SE.
   Before starting, copy any admin edits made on the live theme since this branch was cut (banners, cart drawer,
   homepage collections): the GitHub sync on `main` lags behind the live theme, so the two arms drift apart otherwise.
4. Run at least four weeks. Avoid starting in the middle of Black Week: the traffic mix changes and both arms
   get the same campaign, but a start or stop inside it distorts the baseline.

## What is in it

| Analysis item | Where |
| --- | --- |
| Cookie banner as bottom bar on mobile, same choices | `layout/theme.liquid` (CSS on Cookiebot's dialog, setting `mk_cookie_bottom_bar`) |
| Newsletter popup on 2nd page view or after 30 s | `assets/mk-optimized.js` opens the Klaviyo form; waits until the cookie banner is answered |
| Homepage: choose size or room | `sections/mk-size-room-finder.liquid`, first section in `templates/index.json` |
| Collection: size chooser, card price for the chosen size | `sections/mk-collection-size-bar.liquid`, `snippets/card-product.liquid` |
| One shared set of size names | `tools/normalize_sizes.py` (product data, needs MK's approval) |
| Product: sizes as buttons, smallest to largest, price on each | `snippets/mk-size-picker.liquid` (block setting "Størrelsesvælger") |
| Best-selling size selected when the page opens | setting `mk_bestseller_sizes`; a size chosen on a collection page wins |
| Line under the buy button: returns, delivery, showroom | block "MK: Tryghedslinje", `snippets/mk-trust-line.liquid` |
| Color swatches with photos (like taeppeunivers.dk) | `snippets/mk-color-siblings.liquid`, data via `tools/color_groups.py` |
| Cart opens after "Læg i kurv" | already the theme's behaviour (`cart_type = drawer`), unchanged |
| Underlay in the matching size in the cart | `snippets/mk-cart-underlay.liquid` |
| Delivery date and return policy by the checkout button | `snippets/mk-cart-assurance.liquid` |
| Swedish customers see distance to free shipping | setting `mk_free_shipping_se` in `sections/cart-drawer.liquid` and `main-cart.liquid` |

Wall fans (Sensu) in the cart: set them in the cart drawer's existing "Anbefalede produkter" list in the theme editor.

## Data and access needed from MK Tæpper

- **Cookiebot**: nothing to change in Cookiebot. The bar is CSS in this theme only, so the live theme is untouched.
- **Klaviyo**: duplicate the current popup form, set the copy's display to *Custom trigger only*, and put its form ID in
  `mk_klaviyo_form_id`. Leave the original form as it is, but exclude visitors on this theme from it
  (targeting rule on a URL/cookie, or Shoplift's audience). Changing the original form changes both test arms.
- **Best-selling sizes** (`mk_bestseller_sizes`) and approval to rename sizes. Then:
  `SHOPIFY_STORE=… SHOPIFY_ADMIN_TOKEN=… python3 tools/normalize_sizes.py` (dry run, writes a CSV), review, run with `--apply`.
  After that, turn on "Filtrér også kollektionen på størrelsen" in the size chooser section.
- **Delivery times per warehouse**: theme settings for the default, product metafields
  `custom.leveringstid_min` / `custom.leveringstid_max` (integer) per product where it differs.
- **Return wording**: block "MK: Tryghedslinje" and `mk_return_text`. Today's policy is 30 days, customer pays the return.
- **Free shipping to Sweden**: the policy text says "over 999 kr." without a currency. Confirm DKK or SEK. The setting is in DKK.
- **Color groups**: `python3 tools/color_groups.py` (dry run) groups products whose title differs only in the last word.
  Products that share a title show as one swatch.
- **Product cleanup list**: `SHOPIFY_STORE=… python3 tools/find_duplicates.py` (read-only) lists live products that
  share a title, and products still on a copied web address ("-kopi", "-copy"). Those are real, different products:
  only their title or URL needs fixing (tick "create URL redirect" when changing a handle).
- **Size matching on collection pages**: a size within 10 cm on each side counts as the chosen size and shows its
  real measurements (`SIZE_TOLERANCE_CM` in `assets/mk-optimized.js`). The optional collection filter still
  matches exact size names only.

The data scripts change the shared catalog, so they affect **both** test arms. Run them before the test starts.

## Metafields used

| Owner | Key | Type |
| --- | --- | --- |
| Product | `custom.farvevarianter` | list.product_reference |
| Product | `custom.farve` | single_line_text_field |
| Product | `custom.swatch_billede` | file_reference (image), optional |
| Product | `custom.leveringstid_min`, `custom.leveringstid_max` | number_integer, optional |
