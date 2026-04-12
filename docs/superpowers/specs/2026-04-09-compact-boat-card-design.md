# Compact Two-Row Boat Card

## Problem

The current boat/polar section in RoutingPanel uses a stacked column layout with a 180px centered polar diagram inside a card. In a ~320px sidebar, this dominates the panel — a section the user interacts with infrequently (pick a boat once, rarely change) takes more visual weight than waypoints or the Calculate button.

## Design

Replace the stacked column card with a compact two-row card.

### Layout

```
┌────────────────────────────────────────┐
│ [Beneteau First 40          ▾]  (●40px)│  ← Row 1
│ [Edit] [New]                           │  ← Row 2
└────────────────────────────────────────┘
```

- **Card container**: `background: rgba(255,255,255,0.05)`, `border-radius: 6px`, `padding: 8px 10px`
- **Row 1**: `display: flex; align-items: center; gap: 8px`
  - `<select>` dropdown: `flex: 1`, existing `.input` styles
  - Polar thumbnail: 40px circle, `border-radius: 50%`, `overflow: hidden`, `flex-shrink: 0`. Renders `<PolarDiagram width={80} mini={true}>` inside. Clickable — opens PolarViewEditModal in view mode.
- **Row 2**: `display: flex; gap: 5px`
  - Edit, New buttons (existing `.btn` styles)
  - Delete button: only rendered when `isCustomPolar` is true

### Thumbnail Interaction

The 40px polar thumbnail replaces the current hidden `polar-modal-wrap` hack. Clicking it calls a new `handleViewPolar()` function that opens the PolarViewEditModal in view mode. This requires exposing a new `openInViewMode()` method on PolarViewEditModal (the existing `openModal()` is internal, not exported).

### PolarViewEditModal Change

Add one exported method:
```ts
export function openInViewMode(): void {
    showModal = true;
    isEditing = false;
}
```

Keep the existing `polar-modal-wrap` with `height:0; overflow:hidden` to suppress PolarViewEditModal's built-in "Polar Diagram" button (the fixed-position modal still renders through the overflow clip). The thumbnail click calls `polarModal.openInViewMode()` to open the full diagram.

### Files to Change

**`src/ui/RoutingPanel.svelte`** — template + CSS only:
- Template: Replace boat-section markup with two-row layout, add click handler on thumbnail div
- CSS: Replace `.boat-section` (column → rows), `.boat-preview` (centered 180px → 40px circle clip), keep `.boat-buttons`, `.btn` as-is

**`src/ui/PolarViewEditModal.svelte`** — add one exported function:
- `openInViewMode()`: sets `showModal = true`, `isEditing = false`

### What Does NOT Change

- All polar management handlers (handlePolarChange, handleEditPolar, handleNewPolar, handleDeletePolar, handlePolarSave) — no logic changes
- SettingsModal — already cleaned up, no boat tab
- plugin.svelte — already cleaned up, no polarName prop
- Gear icon next to departure — stays as-is
- Store subscription / reactivity — stays as-is
