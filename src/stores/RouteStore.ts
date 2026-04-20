import type { SavedRoute, LatLon, WindModelId } from '../routing/types';
import { pushRoute, deleteRemoteRoute, pullRoutes, isSyncEnabled } from '../backend/sync';

const STORAGE_KEY = 'windysail-routes';
const LAST_ROUTE_KEY = 'windysail-last-route';

type RouteCallback = (routes: SavedRoute[]) => void;

export type LastRouteData = Omit<SavedRoute, 'id' | 'name' | 'createdAt'>;

function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export class RouteStore {
    private routes: SavedRoute[] = [];
    private callbacks: Set<RouteCallback> = new Set();

    constructor() {
        this.routes = this.load();
    }

    private load(): SavedRoute[] {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (!stored) return [];
            const parsed = JSON.parse(stored);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    private save(): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.routes));
        } catch {
            // Silently fail if localStorage is unavailable
        }
    }

    getAll(): SavedRoute[] {
        return [...this.routes];
    }

    get(id: string): SavedRoute | undefined {
        return this.routes.find(r => r.id === id);
    }

    save_route(route: SavedRoute): void {
        const idx = this.routes.findIndex(r => r.id === route.id);
        if (idx >= 0) {
            this.routes[idx] = route;
        } else {
            this.routes.push(route);
        }
        this.save();
        this.notifySubscribers();
        pushRoute(route);
    }

    delete(id: string): void {
        this.routes = this.routes.filter(r => r.id !== id);
        this.save();
        this.notifySubscribers();
        deleteRemoteRoute(id);
    }

    rename(id: string, name: string): void {
        const route = this.routes.find(r => r.id === id);
        if (route) {
            route.name = name;
            this.save();
            this.notifySubscribers();
            pushRoute(route);
        }
    }

    /**
     * Pull remote routes and merge by id — remote is authoritative. Only runs
     * when the user is signed in with an email; otherwise no-ops.
     */
    async syncFromRemote(): Promise<void> {
        if (!isSyncEnabled()) return;
        const remote = await pullRoutes();
        if (!remote) return;
        // Merge: remote overrides local for matching ids, local-only routes kept
        // and pushed up so the server picks up anything created before sign-in.
        const byId = new Map<string, SavedRoute>();
        for (const r of this.routes) byId.set(r.id, r);
        for (const r of remote) byId.set(r.id, r);
        this.routes = Array.from(byId.values());
        this.save();
        this.notifySubscribers();
        // Push any local-only routes the server didn't have yet.
        const remoteIds = new Set(remote.map(r => r.id));
        for (const r of this.routes) {
            if (!remoteIds.has(r.id)) pushRoute(r);
        }
    }

    saveLastRoute(data: LastRouteData): void {
        try {
            localStorage.setItem(LAST_ROUTE_KEY, JSON.stringify(data));
        } catch {
            // Silently fail
        }
    }

    getLastRoute(): LastRouteData | null {
        try {
            const stored = localStorage.getItem(LAST_ROUTE_KEY);
            if (!stored) return null;
            return JSON.parse(stored);
        } catch {
            return null;
        }
    }

    createRoute(
        name: string,
        start: LatLon,
        end: LatLon,
        waypoints: LatLon[],
        departureTime: number,
        polarName: string,
        selectedModels: WindModelId[],
        routingOptions: SavedRoute['routingOptions'],
    ): SavedRoute {
        const route: SavedRoute = {
            id: generateId(),
            name,
            createdAt: Date.now(),
            start,
            end,
            waypoints,
            departureTime,
            polarName,
            selectedModels,
            routingOptions,
        };
        this.save_route(route);
        return route;
    }

    subscribe(cb: RouteCallback): void {
        this.callbacks.add(cb);
    }

    unsubscribe(cb: RouteCallback): void {
        this.callbacks.delete(cb);
    }

    private notifySubscribers(): void {
        const copy = [...this.routes];
        this.callbacks.forEach(cb => cb(copy));
    }
}

export const routeStore = new RouteStore();
