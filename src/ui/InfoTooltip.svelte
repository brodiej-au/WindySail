<script lang="ts">
    /** Short explanatory text shown when the user hovers/focuses the icon. */
    export let text: string;

    let anchor: HTMLElement;
    let visible = false;
    let x = 0;
    let y = 0;
    let placeBelow = false;

    const BUBBLE_WIDTH = 230;
    const BUBBLE_GAP = 10;
    const VIEWPORT_PADDING = 8;

    function show(): void {
        if (!anchor) return;
        const r = anchor.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const half = BUBBLE_WIDTH / 2;
        const centreX = r.left + r.width / 2;
        // Clamp horizontally so the bubble can't clip off either modal edge
        // or the viewport edge.
        x = Math.max(VIEWPORT_PADDING + half, Math.min(vw - VIEWPORT_PADDING - half, centreX));
        // Prefer above; flip below when there's no room up top.
        placeBelow = r.top < 120;
        y = placeBelow ? r.bottom + BUBBLE_GAP : r.top - BUBBLE_GAP;
        visible = true;
    }

    function hide(): void {
        visible = false;
    }
</script>

<span
    class="info-wrap"
    role="button"
    tabindex="0"
    aria-label={text}
    bind:this={anchor}
    on:mouseenter={show}
    on:mouseleave={hide}
    on:focus={show}
    on:blur={hide}
>
    <span class="info-glyph" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="12" height="12">
            <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.2" />
            <circle cx="8" cy="4.5" r="0.9" fill="currentColor" />
            <rect x="7.3" y="6.5" width="1.4" height="5.2" rx="0.5" fill="currentColor" />
        </svg>
    </span>
</span>

{#if visible}
    <div
        class="info-bubble"
        class:below={placeBelow}
        style="left: {x}px; top: {y}px;"
        role="tooltip"
    >
        {text}
    </div>
{/if}

<style>
    .info-wrap {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-left: 4px;
        width: 14px;
        height: 14px;
        color: #6b7a90;
        cursor: help;
        outline: none;
        vertical-align: middle;
    }
    .info-wrap:hover,
    .info-wrap:focus {
        color: #e6eef8;
    }
    .info-glyph {
        display: inline-flex;
        pointer-events: none;
    }

    .info-bubble {
        position: fixed;
        transform: translate(-50%, -100%);
        width: 230px;
        max-width: calc(100vw - 16px);
        padding: 8px 10px;
        background: #0b131c;
        color: #e6eef8;
        border: 1px solid #2a3547;
        border-radius: 8px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
        font-size: 11px;
        line-height: 1.45;
        text-align: left;
        white-space: normal;
        pointer-events: none;
        z-index: 6000;
    }
    .info-bubble.below {
        transform: translate(-50%, 0);
    }
    .info-bubble::after {
        content: '';
        position: absolute;
        left: 50%;
        transform: translateX(-50%) rotate(45deg);
        width: 8px;
        height: 8px;
        background: #0b131c;
        border-right: 1px solid #2a3547;
        border-bottom: 1px solid #2a3547;
    }
    .info-bubble:not(.below)::after {
        bottom: -5px;
    }
    .info-bubble.below::after {
        top: -5px;
        transform: translateX(-50%) rotate(-135deg);
    }
</style>
