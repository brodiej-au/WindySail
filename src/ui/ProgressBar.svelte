<div class="progress-container">
    <div class="progress-bar" style:width="{percent}%"></div>
</div>
<div class="progress-text size-xs">{statusText}</div>

<script lang="ts">
    export let percent: number = 0;
    export let statusText: string = '';
</script>

<style lang="less">
    .progress-container {
        height: 6px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 3px;
        overflow: hidden;
        margin: 10px 0 4px;
    }
    .progress-bar {
        height: 100%;
        background: #457b9d;
        border-radius: 3px;
        transition: width 0.3s ease;
    }
    .progress-text {
        opacity: 0.7;
        margin-bottom: 10px;
    }
</style>
