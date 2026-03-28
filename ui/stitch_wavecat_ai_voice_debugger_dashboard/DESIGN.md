# Design System Document: The Precision Observatory

## 1. Overview & Creative North Star
The visual language of this design system is built upon the concept of **"The Precision Observatory."** In a world of cluttered, generic technical tools, this system prioritizes extreme data density balanced by a sophisticated, editorial "quietness." It is designed for the technical expert who requires high-fidelity information without the fatigue of traditional "grid-heavy" layouts.

The design breaks the standard template look by utilizing **intentional asymmetry** and **tonal depth**. Instead of defining the UI through rigid lines, we define it through light and shadow. We treat the interface as a physical console carved from obsidian, where information is illuminated from within, rather than painted on top.

## 2. Colors & Surface Philosophy
The palette is rooted in a deep, nocturnal foundation, punctuated by high-energy technical accents.

### Color Tokens
- **Background (Foundation):** `#0e141b` (The base "Obsidian" surface).
- **Primary (Teal/Cyan):** `primary: #a4e6ff` | `primary_container: #00d1ff`. Use for active waveforms, playheads, and successful connection states.
- **Tertiary (Orange/Amber):** `tertiary: #ffd3b4` | `tertiary_container: #ffae6d`. Reserved for warnings, critical data highlights, and speech marker highlights.
- **Surface Tiers:** Use `surface_container_lowest` (#090f16) through `surface_container_highest` (#2f353d) to create architectural depth.

### The "No-Line" Rule
Standard 1px solid borders are strictly prohibited for sectioning. To separate a data tree from a waveform view, use a background shift. For example, place a `surface_container_lowest` panel against the `surface` background. This creates "wells" and "plateaus" rather than "boxes."

### The "Glass & Gradient" Rule
To add visual "soul" to the technical environment:
- **Floating HUDs:** Use `surface_container_highest` with a 20px backdrop-blur and 60% opacity to create a frosted glass effect for temporary status overlays.
- **Interactive CTAs:** Apply a subtle linear gradient from `primary` to `primary_container` (top-to-bottom) to give buttons a machined, three-dimensional feel.

## 3. Typography
The typography strategy blends the technical precision of a geometric sans-serif with the readability of a modern humanist face.

- **Display & Headlines (Space Grotesk):** This font provides a "monospaced-adjacent" character that feels engineered. Use `display-sm` for large, decorative version numbers or time-code indicators to create an editorial texture.
- **UI & Data (Inter):** Used for all functional labels, data trees, and telemetry. Inter’s high x-height ensures that even at `label-sm` (0.6875rem), the debugger’s high-density data remains legible.
- **Hierarchy as Identity:** Use `title-lg` in uppercase with 0.05em letter-spacing for panel headers to establish an authoritative, "command-center" tone.

## 4. Elevation & Depth
In this design system, elevation is conveyed through **Tonal Layering**, not structural lines.

- **The Layering Principle:** 
    - The deepest layer (e.g., the Waveform background) should use `surface_container_lowest`.
    - Content cards or list items should sit on `surface_container_low`.
    - Active or "lifted" items use `surface_container_high`.
- **Ambient Shadows:** When a panel must float (e.g., a detail pop-over), use a massive, soft shadow: `blur: 40px`, `spread: -10px`, `color: rgba(0, 0, 0, 0.4)`. Avoid hard, high-contrast shadows.
- **The "Ghost Border" Fallback:** If a boundary is required for accessibility, use the `outline_variant` token at 15% opacity. It should be felt, not seen.

## 5. Components

### Connection Status Bars
Instead of a simple LED dot, use a full-width `primary_container` horizontal bar at the very top of a panel, utilizing a 2px height. It should have a subtle outer glow (bloom) of the same color to suggest "active power."

### Waveforms & Data Visualization
- **Waveform:** Use `primary_container` with a vertical gradient. The "center-line" of the waveform should be the brightest point, fading slightly toward the top and bottom.
- **Highlights:** Use `tertiary_container` (Orange) for speech markers. These should be semi-transparent overlays that "tint" the waveform behind them rather than obscuring it.

### Detailed Data Trees (JSON/Telemetry)
- **Forbid Dividers:** Do not use lines between rows.
- **Indentation:** Use `spacing-4` (0.9rem) for nesting. 
- **Active State:** Instead of a border, an active row should use a `surface_container_highest` background with a `primary_fixed` (Teal) vertical 2px "indicator" on the far left edge.

### Draggable Splitters
Splitters should be invisible by default. On hover, they should reveal a subtle `surface_bright` vertical or horizontal line. The cursor should change to `col-resize`, providing functional feedback without visual clutter.

### Buttons & Inputs
- **Primary Button:** `on_primary_container` text on a `primary_container` background. 
- **Input Fields:** Use `surface_container_lowest` for the field background. The "focus" state is indicated by the `outline` token at 40% opacity—never a solid, bright ring.

## 6. Do's and Don'ts

### Do:
- **Embrace Density:** Use `spacing-1` and `spacing-2` to pack data tightly. Professionals prefer seeing more data at once over "breathing room."
- **Use Tonal Shifting:** Always ask, "Can I separate these two areas with a color shift instead of a line?"
- **Respect the Playhead:** The playhead is the "hero" of the debugger. Give it a subtle glow using the `primary` token to ensure it is always the highest-contrast element on screen.

### Don't:
- **Don't use Pure Black:** Never use `#000000`. Always use the `surface` or `surface_container_lowest` tokens to maintain the "Obsidian" depth.
- **Don't use High-Contrast Dividers:** Avoid white or light-grey lines. They shatter the immersive dark-theme experience.
- **Don't Over-Animate:** Transitions should be near-instant (150ms-200ms) and use a "linear" or "ease-out" curve to feel like a high-performance machine.