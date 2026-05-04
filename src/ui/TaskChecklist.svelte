<!-- Structured task checklist showing per-step status during routing -->
<div class="task-checklist">
    <div class="warning-banner">
        <span class="warning-icon" aria-hidden="true">&#9888;</span>
        <span class="warning-text">{t('progress.avoidWindyInteraction')}</span><span hidden>{$locale}</span>
    </div>

    <div class="steps">
        {#each steps as step (step.id)}
            <div class="step-row" class:step-active={step.status === 'active'}>
                <span class="step-icon">
                    {#if step.status === 'done'}
                        <span class="icon-done">&#10003;</span>
                    {:else if step.status === 'failed'}
                        <span class="icon-failed">&#10007;</span>
                    {:else if step.status === 'active'}
                        <span class="icon-spinner"></span>
                    {:else if step.status === 'skipped'}
                        <span class="icon-skipped">&#8211;</span>
                    {:else}
                        <span class="icon-pending">&#9675;</span>
                    {/if}
                </span>
                <span class="step-label size-s">{step.label}</span>
                {#if step.detail}
                    <span class="step-detail size-xs">{step.detail}</span>
                {/if}
            </div>
        {/each}
    </div>

    <div class="progress-bar-container">
        <div class="progress-bar-fill" style:width="{percent}%"></div>
    </div>
</div>

<script lang="ts">
    import { t, locale } from '../i18n';
    import type { PipelineStep } from '../routing/types';

    export let steps: PipelineStep[] = [];
    export let percent: number = 0;
</script>

<style lang="less">
    .task-checklist {
        padding: 8px 0;
    }

    .warning-banner {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        background: rgba(233, 196, 106, 0.18);
        border: 1.5px solid rgba(233, 196, 106, 0.55);
        border-radius: 6px;
        color: #f5d27a;
        padding: 8px 10px;
        margin-bottom: 12px;
        text-align: center;
        line-height: 1.3;
        font-size: 11.5px;
        font-weight: 600;
        white-space: nowrap;
        animation: warning-pulse 2.4s ease-in-out infinite;
    }

    .warning-icon {
        font-size: 15px;
        line-height: 1;
        flex-shrink: 0;
    }

    .warning-text {
        flex: 0 1 auto;
    }

    /* Subtle attention pulse — colour and border breathe, no scale change
       so the banner doesn't shift the layout below it. */
    @keyframes warning-pulse {
        0%, 100% {
            background: rgba(233, 196, 106, 0.18);
            border-color: rgba(233, 196, 106, 0.55);
            box-shadow: 0 0 0 0 rgba(233, 196, 106, 0);
        }
        50% {
            background: rgba(233, 196, 106, 0.28);
            border-color: rgba(233, 196, 106, 0.85);
            box-shadow: 0 0 8px 0 rgba(233, 196, 106, 0.25);
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .warning-banner { animation: none; }
    }

    .steps {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-bottom: 10px;
    }

    .step-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 8px;
        border-radius: 4px;
        transition: background 0.2s ease;

        &.step-active {
            background: rgba(255, 255, 255, 0.08);
        }
    }

    .step-icon {
        width: 16px;
        height: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    .icon-done {
        color: #2ecc71;
        font-size: 14px;
        font-weight: bold;
    }

    .icon-failed {
        color: #e74c3c;
        font-size: 14px;
        font-weight: bold;
    }

    .icon-pending {
        color: rgba(255, 255, 255, 0.3);
        font-size: 12px;
    }

    .icon-skipped {
        color: rgba(255, 255, 255, 0.3);
        font-size: 14px;
    }

    .icon-spinner {
        width: 12px;
        height: 12px;
        border: 2px solid rgba(255, 255, 255, 0.15);
        border-top-color: #e9c46a;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    .step-label {
        opacity: 0.9;
    }

    .step-detail {
        margin-left: auto;
        opacity: 0.5;
    }

    .progress-bar-container {
        height: 3px;
        background: rgba(255, 255, 255, 0.08);
        border-radius: 2px;
        overflow: hidden;
    }

    .progress-bar-fill {
        height: 100%;
        background: #e9c46a;
        border-radius: 2px;
        transition: width 0.3s ease;
    }
</style>
