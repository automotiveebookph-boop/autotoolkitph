# Images for inspection-kit

Put this product's images here. File names must match the product YAML:

- preview-1.webp — Module 2 checklist page
- preview-2.webp — Flood guide page
- preview-3.webp — Papeles checklist page
- preview-4.webp — Negotiation scripts page
- og.jpg (optional, 1200×630) — then set `seo.ogImage: og.jpg` in the YAML

Accepted formats: .webp, .png, .jpg, .jpeg, .avif (e.g. preview-1.png is fine).
Portrait pages (about 3:4) look best; phone screenshots work as-is. Astro
converts them to compressed WebP at build time.

While this product is active, the build FAILS if any of the four is missing.
