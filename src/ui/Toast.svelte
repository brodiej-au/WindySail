<script lang="ts">
    export let message: string | null = null;
    export let durationMs: number = 2000;

    let timeout: ReturnType<typeof setTimeout> | null = null;
    $: if (message != null) {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => { message = null; }, durationMs);
    }
</script>

{#if message}
    <div class="toast">{message}</div>
{/if}

<style>
    .toast {
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(15, 23, 32, 0.92);
        color: #e6eef8;
        padding: 8px 14px;
        border-radius: 6px;
        font-size: 12px;
        z-index: 5000;
        pointer-events: none;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    }
</style>
