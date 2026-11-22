# E-book design system — Warm Paper

**Status:** approved visual direction  
**Applies to:** standalone E-book module (web and Android WebView)  
**Scope:** visual identity only; existing product capabilities and behavior remain unchanged.

## Design intent

The E-book module has its own independent visual identity. It must not inherit the Grapes neon palette, dark navy/blue surfaces, blue borders, or high-saturation glow effects. The experience should feel like a calm, carefully designed digital library: warm, readable, tactile, and approachable.

## Color tokens

| Token | Hex | Usage |
|---|---|---|
| Background | `#F7F5EE` | Warm off-white page background |
| Surface / card | `#FFFFFF` | Main cards, panels, dialogs |
| Border | `#E3DECF` | Subtle warm beige outlines and dividers |
| Text | `#2E2A24` | Primary text and headings |
| Secondary text | `#756F64` | Descriptions, helper text, metadata |
| Primary accent | `#6B8F4E` | Main actions, active navigation, key controls |
| Success | `#88B97A` | Positive status and confirmation |
| Copper accent | `#A6734D` | Rare secondary accent; optional, never a dominant surface |
| Soft accent surface | `#E8EEDC` | Selected navigation and icon backgrounds |

## Component rules

- **Page:** use the warm off-white background; avoid pure gray or blue-black page backgrounds.
- **Cards:** white surfaces, rounded corners, fine beige borders, and only a very soft neutral shadow.
- **Borders:** warm beige only; never saturated blue or neon.
- **Primary buttons:** olive green with high-contrast text. Secondary actions use white or warm neutral surfaces.
- **Navigation:** light surface; selected item uses a pale olive background and olive icon/text.
- **Icons:** charcoal by default; olive for active or action-related states.
- **Typography:** system sans-serif, clear hierarchy, comfortable line-height, readable mobile sizing.
- **Touch targets:** maintain comfortable mobile hit areas; do not shrink controls to fit dense layouts.
- **Status colors:** success may use the success token; do not use accent colors as decoration.

## Explicit exclusions

- No Grapes neon colors or glow effects.
- No dark navy/blue page backgrounds, blue card surfaces, or blue borders.
- No gradients as a substitute for hierarchy.
- No decorative color blocks without a functional meaning.
- Do not add product features as part of a visual redesign. Keep existing function areas and their behavior.

## Functional integrity

The design system does not authorize changing existing element IDs, event handlers, storage behavior, Google Drive integration, EPUB editing, transfer/pairing, reader handoff, or device-sync capability. Visual restructuring must preserve existing functionality. In particular, USB sync limitations on Android WebView must remain accurately communicated.

## Reference palette

```css
:root {
  color-scheme: light;
  --ebook-bg: #F7F5EE;
  --ebook-surface: #FFFFFF;
  --ebook-border: #E3DECF;
  --ebook-text: #2E2A24;
  --ebook-muted: #756F64;
  --ebook-accent: #6B8F4E;
  --ebook-success: #88B97A;
  --ebook-copper: #A6734D;
  --ebook-accent-soft: #E8EEDC;
}
```
