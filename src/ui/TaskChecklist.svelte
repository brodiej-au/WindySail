<!-- Structured task checklist showing per-step status during routing -->
<div class="task-checklist">
    <div class="warning-banner size-xs">
        Avoid interacting with Windy while data is being captured
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
    import type { PipelineStep } from '../routing/types';

    export let steps: PipelineStep[] = [];
    export let percent: number = 0;
</script>

<style lang="less">
    .task-checklist {
        padding: 8px 0;
    }

    .warning-banner {
        background: rgba(233, 196, 106, 0.12);
        border: 1px solid rgba(233, 196, 106, 0.25);
        border-radius: 4px;
        color: #e9c46a;
        padding: 6px 10px;
        margin-bottom: 10px;
        text-align: center;
        line-height: 1.4;
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
