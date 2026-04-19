<script lang="ts">
    export let visible: boolean = false;
    export let title: string = 'Before you go';
    export let body: string = 'This tool is a planning aid. It is NOT for navigation. Verify with official charts and your own judgement. Conditions can change rapidly; always maintain a safe watch.';
    export let checkboxLabel: string = 'I understand this is not for navigation.';
    export let acceptLabel: string = 'Accept & Calculate';
    export let onAccept: () => void;

    let checked = false;
</script>

{#if visible}
    <div class="disclaimer-backdrop">
        <div class="disclaimer-card">
            <h3 class="size-m">{title}</h3>
            <p class="size-s body">{body}</p>
            <label class="size-s check-row">
                <input type="checkbox" bind:checked />
                <span>{checkboxLabel}</span>
            </label>
            <button
                class="button button-primary"
                disabled={!checked}
                on:click={() => { if (checked) onAccept(); }}
            >{acceptLabel}</button>
        </div>
    </div>
{/if}

<style>
    .disclaimer-backdrop {
        position: absolute; inset: 0; background: rgba(0,0,0,0.55);
        display: flex; align-items: center; justify-content: center; z-index: 1000;
    }
    .disclaimer-card {
        background: var(--color-bg, #1b2433); color: #e6eef8;
        padding: 18px; border-radius: 14px; max-width: 360px; border: 1px solid #2a3547;
    }
    .body { margin: 8px 0 14px; line-height: 1.4; }
    .check-row { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 14px; }
    button[disabled] { opacity: 0.4; cursor: not-allowed; }
</style>
