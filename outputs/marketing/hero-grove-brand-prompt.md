# Brand palette revision

Edited with the built-in image generation tool using `apps/web/public/marketing/hero-grove.webp` as the edit target.

## Edit prompt

Use case: style-transfer. Edit target: the supplied watercolor grove illustration. Change ONLY its color palette to match the existing AuroSignal brand. Preserve the original wide composition, exact tree shapes and placement, asymmetric left and right canopies, delicate branches, watercolor pigment texture, paper grain, airy light, distant meadow and central negative space. This is a recoloring, not a new composition. AuroSignal's logo palette is cyan #00b0ff through royal blue #0043ff to violet #6d22f8; the marketing CTA accent is #165de5, the ink is #102c46, and the pale surface tint is #f0f5fb. Translate all olive green, yellow and ochre foliage into gentle layered cornflower blue, periwinkle, pale cyan and soft lavender, with a small amount of deeper blue-violet for natural watercolor depth. Recolor brown branches to restrained blue-gray ink. Change the cream-yellow paper and golden haze to an almost-white pale blue/lavender ground closely matching #f0f5fb, with the top and the central 70 percent nearly white. Retain the warm welcoming emotional quality through soft diffused daylight and handmade watercolor texture, without yellow, gold, green, brown, or a separate warm color scheme. Keep saturation moderate and lighter than the actual blue CTA; the background supports the brand and must not compete with the buttons or headline. Soft lavender should be subtle and atmospheric, with blue as the dominant hue. Keep the top large negative space and center clean. No new objects, no text, no logos, no user interface, no artificial neon glow, no glossy 3D, no watermark. Keep the same aspect ratio and opaque background.

## Delivered assets

- Full illustration: `apps/web/public/marketing/hero-grove-brand.webp`, 1586 × 992.
- Left crop: `apps/web/public/marketing/hero-grove-brand-left.webp`, 460 × 812, crop origin (0, 180).
- Right crop: `apps/web/public/marketing/hero-grove-brand-right.webp`, 460 × 812, crop origin (1126, 180).

Converted to WebP with Sharp, quality 85. The homepage consumes the brand versions. The CSS background uses the existing `--service-tint` surface and the same cyan/blue/violet tokens as the brand gradient.
