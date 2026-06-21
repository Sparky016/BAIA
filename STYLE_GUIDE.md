# Style Guide: Scale Inspiration (Dark Mode)

This document serves as the official design specification for the BAIA project. It is based on a **High-Contrast Swiss Modernist** aesthetic, defined by monumental typography, a monochrome foundation with surgical accent use, and large rounded geometries, now optimized for **Dark Mode**.

---

## 1. Design Philosophy

The core of the visual language is **Scale over Weight**. We do not use bolding to create emphasis; instead, we use dramatic size differences and tight tracking to command attention. In dark mode, we maintain this gravity using stark white-on-black contrast.

### Visual Pillars:
- **Monumental Minimalism**: Stark white typography and high-contrast slabs against deep black space.
- **Aeonik Character**: Clean, neutral, but impactful grotesque typography.
- **Surgical Color**: Reserved accents (`green`, `beige`, `forest`) for semantic or editorial emphasis only.

---

## 2. Design Tokens

### 2.1 Colors
Our palette is rooted in absolute contrast. 

| Token | Hex | Role | Usage |
| :--- | :--- | :--- | :--- |
| **`primary`** | `#ffffff` | High Contrast | Fills for hero slabs, primary button backgrounds, main headlines. |
| **`on-primary`**| `#050505` | Brand Ink | Text on light backgrounds. |
| **`surface`** | `#050505` | Canvas | Main page background. |
| **`surface-secondary`**| `#1a1a1a` | Neutral | Eyebrow blocks, secondary sections. |
| **`surface-card`**| `#111111` | Container | Card backgrounds, subtle containment. |
| **`on-surface`** | `#ffffff` | Typography | Default text color. |
| **`on-surface-muted`**| `#a9a9b2` | Muted | Secondary copy, metadata, timestamps. |
| **`green`** | `#72ce7b` | Focus | "Get Started" contexts, emphasis words in headlines. |
| **`forest`** | `#1f3d2e` | Editorial | Dark editorial panels; usually paired with beige. |
| **`beige`** | `#b3a18d` | Editorial | Second clause of two-tone headlines. |
| **`hairline`** | `#2a2a2a` | Utility | 1px borders, dividers, outline buttons. |

### 2.2 Typography
We use **Aeonik** (or neutral grotesque alternatives like Inter/Hanken Grotesk). The signature style is **Regular (400) weight** even at massive sizes, with **tight tracking**.

| Token | Size | Weight | Tracking | Usage |
| :--- | :--- | :--- | :--- | :--- |
| **`display`** | 116px | 400 | -1.16px | Hero block primary headlines. |
| **`headline-lg`** | 64px | 400 | -0.64px | Major section headers. |
| **`headline-md`** | 32px | 400 | -0.32px | Sub-headings, green emphasis statements. |
| **`title`** | 24px | 500 | -0.24px | Cards, sub-titles (slight weight bump). |
| **`body-lg`** | 18px | 400 | 0 | Lead paragraphs, intro copy. |
| **`body-md`** | 16px | 400 | 0 | Standard body copy. |
| **`label`** | 14px | 400 | +0.14px | Buttons, chips, small UI metadata. |

### 2.3 Radius & Spacing
Shapes are soft but monumental.

- **`radius-sm` (8px)**: Interactive elements (Buttons, Chips).
- **`radius-md` (16px)**: Information containers (Cards).
- **`radius-lg` (24px)**: Structural blocks (Light/White Hero Slabs on Dark).
- **`spacing-base`**: 8px (increments: 4, 8, 16, 24, 48, 96, 128).

---

## 3. Component Guidelines

### 3.1 Hero Slabs
- **Structure**: Full-width or large centered containers with `#ffffff` (White) or light grey background.
- **Typography**: Dark (`#050505`) `display` or `headline-lg` text.
- **Padding**: Generous internal whitespace is mandatory to maintain the "monumental" feel.

### 3.2 Two-Tone Headlines
Headlines often split into two clauses:
1. **Primary**: White (`on-surface`).
2. **Emphasis**: Green (`green`) or Beige (`beige`).

### 3.3 Buttons
- **Primary**: Background `#ffffff`, Text `#050505`, 8px radius.
- **Outline**: 1px `#2a2a2a` border, Text `#ffffff`.
- **Light**: Not used on white slabs; use primary buttons.

---

## 4. Imagery & Iconography

- **Imagery**: Leans into technical/AI visuals (brain scans, data flows).
- **Annotations**: Use small bracket `[...]` markers or square "data labeling" frames as decorative motifs.
- **Icons**: Minimalist 24px outline icons in `#ffffff`.

---

## 5. Do's and Don'ts

### ✅ Do:
- Use **scale** instead of weight for hierarchy.
- Anchor pages with large rounded white slabs on the dark surface.
- Left-align massive headlines.
- Maintain absolute flatness (no shadows).

### ❌ Don't:
- Bold large display text.
- Use saturated primary colors (keep it monochrome + accents).
- Add drop shadows or glows.
- Crowd the margins; let the design breathe.
