import type { UserSettings } from '../routing/types';
import { DEFAULT_SETTINGS } from '../routing/types';

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
