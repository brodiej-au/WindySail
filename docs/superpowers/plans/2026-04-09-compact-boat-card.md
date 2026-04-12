# Compact Two-Row Boat Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the oversized stacked boat/polar section with a compact two-row card — dropdown + 40px thumbnail on row 1, action buttons on row 2.

**Architecture:** Pure template/CSS refactor of the boat section in RoutingPanel.svelte, plus one exported method added to PolarViewEditModal.svelte. No logic changes to polar management handlers, store subscriptions, or settings modal.

**Tech Stack:** Svelte 3, Less CSS

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/ui/PolarViewEditModal.svelte` | Modify (line 116) | Add `openInViewMode()` export |
| `src/ui/RoutingPanel.svelte` | Modify (lines 69-98, 768-814) | Template: two-row layout + thumbnail click. CSS: compact card styles |

---

### Task 1: Add `openInViewMode` to PolarViewEditModal

**Files:**
- Modify: `src/ui/PolarViewEditModal.svelte:116-121`

- [ ] **Step 1: Add the exported method**

In `src/ui/PolarViewEditModal.svelte`, add `openInViewMode` right after the existing `openInEditMode` method (after line 121):

```ts
    export function openInViewMode(): void {
        showModal = true;
        isEditing = false;
    }
```

This is identical to the internal `openModal()` function but exported so RoutingPanel can call it from the thumbnail click.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build, no errors. This is an additive change — nothing calls it yet.

- [ ] **Step 3: Commit**

```bash
git add src/ui/PolarViewEditModal.svelte
git commit -m "feat: export openInViewMode on PolarViewEditModal"
```

---

### Task 2: Rewrite boat section template to two-row layout

**Files:**
- Modify: `src/ui/RoutingPanel.svelte:69-98`

- [ ] **Step 1: Replace boat section template**

Replace lines 69-98 in `src/ui/RoutingPanel.svelte` (everything from `<!-- Boat / Polar selection -->` through the closing `</div>` of `polar-modal-wrap`) with:

```svelte
    <!-- Boat / Polar selection -->
    <div class="section mb-10 boat-section">
        <!-- Row 1: dropdown + polar thumbnail -->
        <div class="boat-row">
            <select class="input size-s" value={selectedPolarName} on:change={handlePolarChange}>
                {#each allPolars as p}
                    <option value={p.name}>{p.name}</option>
                {/each}
            </select>
            {#if currentPolar}
                <div class="boat-thumb" on:click={handleViewPolar} title="View polar diagram">
                    <PolarDiagram polar={currentPolar} width={80} mini={true} />
                </div>
            {/if}
        </div>
        <!-- Row 2: action buttons -->
        <div class="boat-buttons">
            <button class="btn size-xs" on:click={handleEditPolar}>Edit</button>
            <button class="btn size-xs" on:click={handleNewPolar}>New</button>
            {#if isCustomPolar}
                <button class="btn size-xs btn--danger" on:click={handleDeletePolar}>Delete</button>
            {/if}
        </div>
    </div>
    <div class="polar-modal-wrap">
        {#if currentPolar}
            <PolarViewEditModal
                polar={currentPolar}
                isCustom={isCustomPolar}
                onSave={handlePolarSave}
                bind:this={polarModal}
            />
        {/if}
    </div>
```

- [ ] **Step 2: Add the `handleViewPolar` handler**

In the script section of `src/ui/RoutingPanel.svelte`, add this function in the `// --- Polar management ---` section (after `handlePolarChange`, before `handleEditPolar`):

```ts
    function handleViewPolar(): void {
        if (polarModal) {
            polarModal.openInViewMode();
        }
    }
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean build. The template compiles but styling will look wrong until Task 3.

- [ ] **Step 4: Commit**

```bash
git add src/ui/RoutingPanel.svelte
git commit -m "feat: two-row boat section template with thumbnail click"
```

---

### Task 3: Replace boat section CSS with compact card styles

**Files:**
- Modify: `src/ui/RoutingPanel.svelte:768-814`

- [ ] **Step 1: Replace boat section CSS**

Replace the `/* Boat / Polar section */` block (from `.boat-section` through `.polar-modal-wrap`, lines 768-814) with:

```less
    /* Boat / Polar section */
    .boat-section {
        display: flex;
        flex-direction: column;
        gap: 6px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 6px;
        padding: 8px 10px;
    }

    .boat-row {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .boat-thumb {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        overflow: hidden;
        flex-shrink: 0;
        cursor: pointer;
        border: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: border-color 0.15s ease;

        &:hover {
            border-color: rgba(255, 255, 255, 0.3);
        }
    }

    .boat-buttons {
        display: flex;
        gap: 5px;
    }

    .btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        color: inherit;
        padding: 3px 10px;
        cursor: pointer;
        opacity: 0.85;
        transition: all 0.15s ease;

        &:hover {
            background: rgba(255, 255, 255, 0.14);
            opacity: 1;
        }

        &--danger:hover {
            background: rgba(231, 76, 60, 0.2);
            border-color: rgba(231, 76, 60, 0.4);
        }
    }

    .polar-modal-wrap {
        height: 0;
        overflow: hidden;
    }
```

Key differences from current CSS:
- `.boat-section`: `padding: 8px 10px` (was `10px`), `gap: 6px` (was `8px`) — tighter
- New `.boat-row`: horizontal flex for dropdown + thumbnail
- New `.boat-thumb`: 40px circle with overflow clip, hover border highlight
- Removed `.boat-preview` (replaced by `.boat-thumb`)
- `.boat-buttons`: `justify-content` removed (was `center`, now left-aligned)
- `.btn` padding: `3px 10px` (was `5px 14px`) — slightly smaller buttons

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 3: Visual verification**

Run `npm start` and open the plugin. Verify:
1. Boat section shows dropdown + 40px circular polar thumbnail on one row
2. Edit/New buttons sit below, left-aligned
3. Clicking the thumbnail opens the full polar diagram modal
4. Dropdown changes the polar and the thumbnail updates
5. The section is compact — roughly 70-80px tall total
6. Delete button appears only for custom polars

- [ ] **Step 4: Commit**

```bash
git add src/ui/RoutingPanel.svelte
git commit -m "style: compact two-row boat card layout"
```
