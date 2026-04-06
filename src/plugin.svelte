<div class="plugin__mobile-header">
    {title}
</div>
<section class="plugin__content">
    <div
        class="plugin__title plugin__title--chevron-back"
        on:click={() => bcast.emit('rqstOpen', 'menu')}
    >
        {title}
    </div>
    <p>Sail Router loading...</p>
</section>

<script lang="ts">
    import bcast from '@windy/broadcast';
    import { onDestroy, onMount } from 'svelte';

    import config from './pluginConfig';

    const { title } = config;

    export const onopen = (_params: unknown) => {};

    onMount(() => {});

    onDestroy(() => {});
</script>

<style lang="less">
</style>
