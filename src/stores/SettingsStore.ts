import { readable } from 'svelte/store';
import type { UserSettings } from '../routing/types';
import { DEFAULT_SETTINGS } from '../routing/types';
import { pullSettings, pushSettings, isSyncEnabled } from '../backend/sync';

const STORAGE_KEY = 'windysail-settings';

type SettingsCallback = (settings: UserSettings) => void;

/**
 * localStorage-backed settings store with pub/sub for change notification.
 * Merges loaded settings with defaults so new settings added later get defaults.
 */
export class SettingsStore {
    private settings: UserSettings;
    private callbacks: Set<SettingsCallback> = new Set();

    constructor() {
        this.settings = this.load();
    }

    /**
     * Load settings from localStorage and merge with defaults.
     * New settings added later will get their default values.
     */
    private load(): UserSettings {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (!stored) {
                return { ...DEFAULT_SETTINGS };
            }
            const parsed = JSON.parse(stored) as Partial<UserSettings>;
            // Merge with defaults to ensure all keys exist
            return {
                ...DEFAULT_SETTINGS,
                ...parsed,
            };
        } catch {
            // On parse error or other issues, return defaults
            return { ...DEFAULT_SETTINGS };
        }
    }

    /**
     * Persist current settings to localStorage.
     */
    private save(): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
        } catch {
            // Silently fail if localStorage is unavailable
            // (e.g., in private browsing or quota exceeded)
        }
    }

    /**
     * Get a single setting by key with type safety.
     */
    get<K extends keyof UserSettings>(key: K): UserSettings[K] {
        return this.settings[key];
    }

    /**
     * Get all settings (returns a copy to prevent external mutation).
     */
    getAll(): UserSettings {
        return { ...this.settings };
    }

    /**
     * Set a single setting, persist to localStorage, and notify subscribers.
     */
    set<K extends keyof UserSettings>(key: K, value: UserSettings[K]): void {
        this.settings[key] = value;
        this.save();
        this.notifySubscribers();
        pushSettings(this.settings as unknown as Record<string, unknown>);
    }

    /**
     * Pull settings from the cloud and merge. Remote overrides local when the
     * remote copy is newer; defaults back-fill any keys the remote didn't have.
     * No-op unless the user is signed in with an email.
     */
    async syncFromRemote(): Promise<void> {
        if (!isSyncEnabled()) return;
        const remote = await pullSettings<Partial<UserSettings> & { updatedAt?: number }>();
        if (!remote) {
            // First device to sign in — push what we have locally so the cloud copy exists.
            pushSettings(this.settings as unknown as Record<string, unknown>);
            return;
        }
        const remoteUpdated = remote.updatedAt ?? 0;
        // Tracked local updatedAt for comparison; unknown means "old".
        const localUpdated = (this.settings as any).updatedAt ?? 0;
        if (remoteUpdated <= localUpdated) return;
        const { updatedAt: _ignore, ...remoteFields } = remote;
        // Merge: defaults + remote (remote authoritative when newer).
        this.settings = { ...DEFAULT_SETTINGS, ...remoteFields } as UserSettings;
        (this.settings as any).updatedAt = remoteUpdated;
        this.save();
        this.notifySubscribers();
    }

    /**
     * Register a callback to be notified on settings changes.
     */
    subscribe(cb: SettingsCallback): void {
        this.callbacks.add(cb);
    }

    /**
     * Unregister a callback from change notifications.
     */
    unsubscribe(cb: SettingsCallback): void {
        this.callbacks.delete(cb);
    }

    /**
     * Notify all subscribers with current settings.
     */
    private notifySubscribers(): void {
        const settingsCopy = { ...this.settings };
        this.callbacks.forEach(cb => cb(settingsCopy));
    }
}

export const settingsStore = new SettingsStore();

/**
 * Reactive Svelte store mirroring `settingsStore`. Components can subscribe
 * via the `$settings` shorthand to react to any settings change, e.g.
 * `$settings.distanceUnit`. Always emits a fresh copy.
 */
export const settings = readable<UserSettings>(settingsStore.getAll(), set => {
    const cb = (s: UserSettings) => set(s);
    settingsStore.subscribe(cb);
    return () => settingsStore.unsubscribe(cb);
});
