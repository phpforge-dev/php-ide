# SPEC-04 — Design system

## Goal and principles

Create a coherent visual and interaction language for a dense desktop IDE. Prioritize readable code, recognizable state, precise selection, accessible focus and immediate visual feedback. Familiar IDE organization may guide the layout, but components and assets must be original or publicly licensed.

This specification defines product-owned tokens and components. It does not assert exact visual or behavioral equivalence with PhpStorm.

## Token architecture

Separate primitive values, semantic roles and component-specific tokens. Components must consume semantic roles rather than embedding unrelated palette values. Keep one authoritative theme definition and derive Monaco and terminal themes from it.

| Category | Required semantic roles |
|---|---|
| Surfaces | Window, editor, panel, elevated popup, input, selected row |
| Text | Primary, secondary, muted, disabled, inverse, link |
| Interaction | Hover, pressed, active, selection, focus ring |
| Boundaries | Subtle divider, input border, active border |
| Feedback | Information, success, warning, error and their backgrounds |
| Code | Syntax categories, diagnostics, diff insertion/deletion, current line |
| Geometry | Spacing scale, row heights, control heights, radii, panel bounds |
| Typography | UI family, editor family, size, line height, weight |
| Layers | Workbench, panels, popovers, modal backdrop, modal and notifications |

- **DS-01:** Use an initial spacing scale of 4, 8, 12, 16, 24 and 32 CSS pixels. Provide compact and comfortable control/row density presets. These are proposed product defaults and must be checked at actual window scale.
- **DS-02:** Start UI typography at 13 px and editor typography at 14 px, both adjustable. Use licensed sans-serif and monospace fonts with system fallbacks. Verify missing glyphs and platform rendering.
- **DS-03:** Define icon sizing/alignment and selected/disabled variants. Use one consistent icon source where possible, with license notices. File types and semantic symbols must remain recognizable without requiring exact upstream product assets.

## Theme model and live settings

- **DS-04:** Offer Light, Dark and Follow System; default to Follow System for a new profile. Store the selected mode separately from the effective light/dark palette.
- **DS-05:** Apply persisted appearance before rendering the main workbench to minimize flashes. Follow system changes only while system mode is selected. Synchronize the native window appearance where the platform supports it.
- **DS-06:** Provide a non-modal appearance panel with clickable theme samples, selected state, effective theme, density and font controls. Changes must immediately affect the actual workbench and save automatically. Closing the panel preserves the selected settings; Reset restores documented defaults.
- **DS-07:** Theme changes must update Welcome, tree, tabs, popups, dialogs, editor widgets, syntax, diffs, database grid and terminal. Preserve editor models and terminal sessions while updating colors.
- **DS-08:** A rapid appearance toggle must make its resulting explicit mode visible. It must not silently continue following the system after a deliberate explicit choice.

## Component library

Build reusable behavior and styling for buttons, icon buttons, inputs, selects, checkboxes, segmented controls, tabs, tree rows, menus, tooltips, result lists, popovers, dialogs, banners, progress indicators and tables/grids.

Each component must define default, hover, pressed, focus, selected, disabled, loading and error states where applicable. Provide concise usage rules: primary actions per surface, destructive-action treatment, label placement and when an inline message should replace a modal.

- **DS-09:** Dialogs must have visible titles, labels and a predictable action order. Do not use placeholders as the only field label. Preserve invalid input and explain how to correct it.
- **DS-10:** Lists and grids must distinguish selected item from keyboard focus and hover. Empty and loading states must preserve the surrounding layout.
- **DS-11:** Popover placement must stay inside the viewport; z-index follows named layers. Hidden components must be absent from hit testing and tab navigation.
- **DS-12:** Maintain a development component showcase with representative light/dark, density, error, disabled and keyboard-focus states. It must use the same implementation as the product.

## Accessibility and validation targets

Use a minimum contrast target of 4.5:1 for normal text, 3:1 for large text and meaningful control boundaries/focus indicators against adjacent backgrounds. These are acceptance targets, not a claim of a complete accessibility audit. Measure rendered semantic pairs and inspect syntax, terminal ANSI colors and disabled states separately.

- **DS-13:** Ensure every interactive component has an accessible name and visible keyboard focus. Convey error and success with text/iconography as well as color.
- **DS-14:** Support 200% zoom and user-adjusted font sizes without clipping primary actions. Honor reduced motion and avoid animation that delays editing.
- **DS-15:** Keep translated labels flexible in width. Check at least English and Portuguese examples in core dialogs and menus.

## Construction and acceptance

Define tokens first, implement Light/Dark and the theme controller, create the component showcase, integrate Monaco/xterm, then apply components to the workbench and database dialog.

Acceptance requires switching themes while an unsaved file and terminal session stay intact; observing all visible surfaces update; verifying Follow System versus explicit modes; restarting to confirm persistence; testing keyboard focus and zoom; measuring contrast; and capturing both palettes for representative components. Record any unthemed or inaccessible surface as a specific limitation rather than marking the complete design system validated.
