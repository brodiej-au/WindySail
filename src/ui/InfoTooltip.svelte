<script lang="ts">
    /** Short explanatory text shown when the user hovers/focuses the icon. */
    export let text: string;
    /** Tooltip placement relative to the icon. */
    export let placement: 'top' | 'bottom' = 'top';
</script>

<span class="info-wrap" tabindex="0" aria-label={text}>
    <span class="info-glyph" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="12" height="12">
            <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.2" />
            <circle cx="8" cy="4.5" r="0.9" fill="currentColor" />
            <rect x="7.3" y="6.5" width="1.4" height="5.2" rx="0.5" fill="currentColor" />
        </svg>
    </span>
    <span class="info-bubble" class:top={placement === 'top'} class:bottom={placement === 'bottom'}>
        {text}
    </span>
</span>

<style>
    .info-wrap {
        position: relative;
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
        position: absolute;
        left: 50%;
        transform: translateX(-50%) translateY(-4px);
        min-width: 180px;
        max-width: 240px;
        padding: 8px 10px;
        background: #0f1720;
        color: #e6eef8;
        border: 1px solid #2a3547;
        border-radius: 8px;
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.55);
        font-size: 11px;
        line-height: 1.45;
        text-align: left;
        white-space: normal;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.12s ease, transform 0.12s ease;
        z-index: 4000;
    }
    .info-bubble.top { bottom: 100%; }
    .info-bubble.bottom { top: 100%; transform: translateX(-50%) translateY(4px); }

    .info-bubble::after {
        content: '';
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        width: 8px;
        height: 8px;
        background: #0f1720;
        border-right: 1px solid #2a3547;
        border-bottom: 1px solid #2a3547;
    }
    .info-bubble.top::after {
        bottom: -5px;
        transform: translateX(-50%) rotate(45deg);
    }
    .info-bubble.bottom::after {
        top: -5px;
        transform: translateX(-50%) rotate(-135deg);
    }

    .info-wrap:hover .info-bubble,
    .info-wrap:focus .info-bubble {
        opacity: 1;
        transform: translateX(-50%) translateY(-8px);
    }
    .info-wrap:hover .info-bubble.bottom,
    .info-wrap:focus .info-bubble.bottom {
        transform: translateX(-50%) translateY(8px);
    }
</style>
