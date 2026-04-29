# Backend Identity & Disclaimer Implementation Plan (Sub-project A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a minimal Firebase backend that records install, heartbeat, and disclaimer-acknowledgement events; wire the plugin client to emit those events fire-and-forget; gate the Calculate button behind a disclaimer modal on first use.

**Architecture:** Client generates a local `deviceId` (UUID in localStorage), sends JSON POSTs to three HTTPS Cloud Functions (`/install`, `/heartbeat`, `/disclaimer-ack`) in region `australia-southeast1`. Cloud Functions write to Firestore collections `devices/{deviceId}` and `events/{autoId}`. Firestore rules deny all direct client access. Client queues failed POSTs in localStorage for retry on next open.

**Tech Stack:** Firebase (Firestore + HTTPS Cloud Functions), `firebase-admin`, `firebase-functions`, `zod` for request validation. Plugin-side uses plain `fetch`. Disclaimer modal is a new Svelte component.

**Spec reference:** `docs/superpowers/specs/2026-04-19-v0.3-overhaul-design.md` §A.

**Commands:**
- Plugin tests: `npm test -- tests/path/file.test.ts`
- Full plugin suite: `npm test`
- Functions tests: `cd firebase/functions && npm test`
- Deploy functions: `cd firebase && firebase deploy --only functions`
- Local Firestore emulator: `cd firebase && firebase emulators:start`

**Prerequisite (done manually by the project owner before implementation begins):**
- `firebase login` done.
- Firebase project created (e.g. `windysail-prod`) in Firebase console.
- Region `australia-southeast1` selected when creating Firestore.
- Firebase CLI installed: `npm install -g firebase-tools`.

---

## File Plan

**New files (plugin):**
- `src/backend/deviceId.ts` — read/generate localStorage UUID.
- `src/backend/client.ts` — `postInstall`, `postHeartbeat`, `postDisclaimerAck` with fire-and-forget + retry queue.
- `src/backend/eventQueue.ts` — localStorage-backed FIFO queue of failed POSTs.
- `src/backend/config.ts` — `BACKEND_BASE_URL` constant + `DISCLAIMER_VERSION` constant.
- `src/ui/DisclaimerModal.svelte` — the modal UI.
- `tests/backend/deviceId.test.ts`, `tests/backend/eventQueue.test.ts`, `tests/backend/client.test.ts`.

**New files (backend):**
- `firebase/firebase.json`, `firebase/.firebaserc`, `firebase/firestore.rules`, `firebase/firestore.indexes.json`.
- `firebase/functions/package.json`, `firebase/functions/tsconfig.json`.
- `firebase/functions/src/index.ts` — Express-style router.
- `firebase/functions/src/schemas.ts` — zod schemas.
- `firebase/functions/src/install.ts`, `firebase/functions/src/heartbeat.ts`, `firebase/functions/src/disclaimer.ts`.
- `firebase/functions/test/schemas.test.ts`, `firebase/functions/test/install.test.ts`, etc. (vitest).

**Modified files:**
- `src/plugin.svelte` — call `postInstall`/`postHeartbeat` at startup; mount DisclaimerModal; gate Calculate handler.
- `src/ui/RoutingPanel.svelte` — wire Calculate to the disclaimer check before routing kicks off.
- `src/routing/types.ts` — no changes expected.

---

## Task 1: Firebase scaffolding

**Files:**
- Create: `firebase/firebase.json`, `firebase/.firebaserc`, `firebase/firestore.rules`, `firebase/firestore.indexes.json`, `firebase/functions/package.json`, `firebase/functions/tsconfig.json`.

- [ ] **Step 1: Create the `firebase/` directory layout**

```bash
mkdir -p firebase/functions/src firebase/functions/test
```

- [ ] **Step 2: Write `firebase/.firebaserc`**

```json
{
  "projects": {
    "default": "windysail-prod"
  }
}
```

Replace `windysail-prod` with the actual Firebase project ID if different.

- [ ] **Step 3: Write `firebase/firebase.json`**

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "runtime": "nodejs20",
      "ignore": ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log"]
    }
  ],
  "emulators": {
    "firestore": { "port": 8080 },
    "functions": { "port": 5001 },
    "ui": { "enabled": true, "port": 4000 }
  }
}
```

- [ ] **Step 4: Write `firebase/firestore.rules` (deny all client access)**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // All client access denied. Writes come only from Cloud Functions using
    // the Admin SDK which bypasses these rules.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

- [ ] **Step 5: Write `firebase/firestore.indexes.json`**

```json
{ "indexes": [], "fieldOverrides": [] }
```

- [ ] **Step 6: Write `firebase/functions/package.json`**

```json
{
  "name": "windysail-functions",
  "private": true,
  "version": "1.0.0",
  "main": "lib/index.js",
  "engines": { "node": "20" },
  "scripts": {
    "build": "tsc",
    "serve": "npm run build && firebase emulators:start --only functions",
    "deploy": "firebase deploy --only functions",
    "test": "vitest run"
  },
  "dependencies": {
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^5.0.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.0.0",
    "@types/node": "^20.0.0"
  }
}
```

- [ ] **Step 7: Write `firebase/functions/tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "es2022",
    "moduleResolution": "node",
    "strict": true,
    "outDir": "lib",
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["test/**/*.ts", "lib/**/*"]
}
```

- [ ] **Step 8: Install dependencies**

```bash
cd firebase/functions && npm install && cd ../..
```

- [ ] **Step 9: Commit**

```bash
git add firebase/
git commit -m "chore(firebase): scaffold functions project and firestore rules"
```

---

## Task 2: Zod request schemas with tests

**Files:**
- Create: `firebase/functions/src/schemas.ts`, `firebase/functions/test/schemas.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `firebase/functions/test/schemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
    installSchema,
    heartbeatSchema,
    disclaimerSchema,
} from '../src/schemas';

describe('installSchema', () => {
    const valid = {
        deviceId: '5c8f6b2a-9e1c-4e5a-a9f3-02b4c9d8f7a1',
        email: 'user@example.com',
        pluginVersion: '0.3.0',
        usedLang: 'en',
        userAgent: 'Mozilla/5.0',
    };
    it('accepts valid payload', () => { expect(installSchema.parse(valid)).toEqual(valid); });
    it('accepts missing email (nullable)', () => {
        const r = installSchema.parse({ ...valid, email: null });
        expect(r.email).toBeNull();
    });
    it('rejects missing deviceId', () => {
        expect(() => installSchema.parse({ ...valid, deviceId: undefined })).toThrow();
    });
    it('rejects non-UUID deviceId', () => {
        expect(() => installSchema.parse({ ...valid, deviceId: 'not-a-uuid' })).toThrow();
    });
    it('truncates userAgent over 200 chars', () => {
        const long = 'x'.repeat(500);
        const r = installSchema.parse({ ...valid, userAgent: long });
        expect(r.userAgent.length).toBeLessThanOrEqual(200);
    });
});

describe('heartbeatSchema', () => {
    it('accepts minimal payload', () => {
        const r = heartbeatSchema.parse({
            deviceId: '5c8f6b2a-9e1c-4e5a-a9f3-02b4c9d8f7a1',
            pluginVersion: '0.3.0',
            usedLang: 'en',
        });
        expect(r.email).toBeNull();
    });
});

describe('disclaimerSchema', () => {
    it('accepts valid payload with acceptedAt', () => {
        const r = disclaimerSchema.parse({
            deviceId: '5c8f6b2a-9e1c-4e5a-a9f3-02b4c9d8f7a1',
            pluginVersion: '0.3.0',
            disclaimerVersion: '2026-04',
            acceptedAt: new Date().toISOString(),
        });
        expect(r.acceptedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
    });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd firebase/functions && npm test
```

Expected: FAIL — module `../src/schemas` does not exist.

- [ ] **Step 3: Implement `firebase/functions/src/schemas.ts`**

```ts
import { z } from 'zod';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const baseFields = {
    deviceId: z.string().regex(uuidRegex, 'deviceId must be a UUID'),
    pluginVersion: z.string().min(1).max(20),
    usedLang: z.string().min(2).max(10).default('en'),
};

export const installSchema = z.object({
    ...baseFields,
    email: z.string().email().nullable().default(null),
    userAgent: z.string().max(2000).transform(s => s.slice(0, 200)),
});

export const heartbeatSchema = z.object({
    ...baseFields,
    email: z.string().email().nullable().default(null),
});

export const disclaimerSchema = z.object({
    ...baseFields,
    email: z.string().email().nullable().default(null),
    disclaimerVersion: z.string().min(1).max(30),
    acceptedAt: z.string().datetime(),
});

export type InstallPayload = z.infer<typeof installSchema>;
export type HeartbeatPayload = z.infer<typeof heartbeatSchema>;
export type DisclaimerPayload = z.infer<typeof disclaimerSchema>;
```

- [ ] **Step 4: Run the test**

```bash
cd firebase/functions && npm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add firebase/functions/src/schemas.ts firebase/functions/test/schemas.test.ts
git commit -m "feat(functions): zod schemas for install/heartbeat/disclaimer"
```

---

## Task 3: Cloud Function router

**Files:**
- Create: `firebase/functions/src/index.ts`, `firebase/functions/src/install.ts`, `firebase/functions/src/heartbeat.ts`, `firebase/functions/src/disclaimer.ts`.

- [ ] **Step 1: Write `firebase/functions/src/index.ts`**

```ts
import { onRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { handleInstall } from './install';
import { handleHeartbeat } from './heartbeat';
import { handleDisclaimer } from './disclaimer';

admin.initializeApp();
setGlobalOptions({ region: 'australia-southeast1' });

const ALLOWED_ORIGINS = new Set([
    'https://www.windy.com',
    'https://embed.windy.com',
]);

function setCors(req: any, res: any): boolean {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.has(origin)) {
        res.set('Access-Control-Allow-Origin', origin);
    }
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return true;
    }
    return false;
}

export const api = onRequest(
    { cors: false, maxInstances: 10 },
    async (req, res) => {
        if (setCors(req, res)) return;
        if (req.method !== 'POST') {
            res.status(405).json({ error: 'method not allowed' });
            return;
        }
        try {
            switch (req.path) {
                case '/install':
                    await handleInstall(req, res);
                    return;
                case '/heartbeat':
                    await handleHeartbeat(req, res);
                    return;
                case '/disclaimer-ack':
                    await handleDisclaimer(req, res);
                    return;
                default:
                    res.status(404).json({ error: 'not found' });
            }
        } catch (err) {
            console.error('handler error', err);
            res.status(500).json({ error: 'internal' });
        }
    },
);
```

- [ ] **Step 2: Write a shared handler helper `firebase/functions/src/_shared.ts`**

```ts
import * as admin from 'firebase-admin';
import { createHash } from 'crypto';

const IP_HASH_SALT = process.env.IP_HASH_SALT ?? 'windysail-default-salt';

export function hashIp(ip: string): string {
    return createHash('sha256').update(IP_HASH_SALT + ip).digest('hex').slice(0, 32);
}

export function extractIp(req: any): string {
    return (req.headers['x-forwarded-for']?.split(',')[0] ?? req.ip ?? '').trim();
}

export function db() {
    return admin.firestore();
}

export function serverTimestamp() {
    return admin.firestore.FieldValue.serverTimestamp();
}

export async function recordEvent(
    type: 'install' | 'heartbeat' | 'disclaimer-ack' | 'coffee',
    deviceId: string,
    payload: Record<string, unknown>,
    ipHash: string,
): Promise<void> {
    await db().collection('events').add({
        deviceId,
        type,
        payload,
        receivedAt: serverTimestamp(),
        ipHash,
    });
}
```

- [ ] **Step 3: Write `firebase/functions/src/install.ts`**

```ts
import { installSchema } from './schemas';
import { db, extractIp, hashIp, recordEvent, serverTimestamp } from './_shared';

export async function handleInstall(req: any, res: any): Promise<void> {
    const parsed = installSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'invalid payload', details: parsed.error.flatten() });
        return;
    }
    const data = parsed.data;
    const ipHash = hashIp(extractIp(req));

    await db().collection('devices').doc(data.deviceId).set({
        email: data.email,
        firstSeenAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(),
        lastVersion: data.pluginVersion,
        lastLang: data.usedLang,
        installUserAgent: data.userAgent,
        disclaimerVersion: null,
        disclaimerAcceptedAt: null,
    }, { merge: true });

    await recordEvent('install', data.deviceId, data, ipHash);
    res.status(200).json({ ok: true });
}
```

- [ ] **Step 4: Write `firebase/functions/src/heartbeat.ts`**

```ts
import { heartbeatSchema } from './schemas';
import { db, extractIp, hashIp, recordEvent, serverTimestamp } from './_shared';

export async function handleHeartbeat(req: any, res: any): Promise<void> {
    const parsed = heartbeatSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'invalid payload', details: parsed.error.flatten() });
        return;
    }
    const data = parsed.data;
    const ipHash = hashIp(extractIp(req));

    await db().collection('devices').doc(data.deviceId).set({
        email: data.email ?? null,
        lastSeenAt: serverTimestamp(),
        lastVersion: data.pluginVersion,
        lastLang: data.usedLang,
    }, { merge: true });

    await recordEvent('heartbeat', data.deviceId, data, ipHash);
    res.status(200).json({ ok: true });
}
```

- [ ] **Step 5: Write `firebase/functions/src/disclaimer.ts`**

```ts
import { disclaimerSchema } from './schemas';
import { db, extractIp, hashIp, recordEvent, serverTimestamp } from './_shared';

export async function handleDisclaimer(req: any, res: any): Promise<void> {
    const parsed = disclaimerSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'invalid payload', details: parsed.error.flatten() });
        return;
    }
    const data = parsed.data;
    const ipHash = hashIp(extractIp(req));

    await db().collection('devices').doc(data.deviceId).set({
        email: data.email ?? null,
        disclaimerVersion: data.disclaimerVersion,
        disclaimerAcceptedAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(),
    }, { merge: true });

    await recordEvent('disclaimer-ack', data.deviceId, data, ipHash);
    res.status(200).json({ ok: true });
}
```

- [ ] **Step 6: TypeScript compile check**

```bash
cd firebase/functions && npm run build
```

Expected: succeeds without errors.

- [ ] **Step 7: Commit**

```bash
git add firebase/functions/src/
git commit -m "feat(functions): install, heartbeat, disclaimer handlers"
```

---

## Task 4: Client `deviceId` module with tests

**Files:**
- Create: `src/backend/deviceId.ts`, `tests/backend/deviceId.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/backend/deviceId.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getOrCreateDeviceId } from '../../src/backend/deviceId';

describe('getOrCreateDeviceId', () => {
    beforeEach(() => {
        const store: Record<string, string> = {};
        vi.stubGlobal('localStorage', {
            getItem: (k: string) => store[k] ?? null,
            setItem: (k: string, v: string) => { store[k] = v; },
            removeItem: (k: string) => { delete store[k]; },
        });
    });

    it('generates and persists a UUID on first call', () => {
        const id1 = getOrCreateDeviceId();
        expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        const id2 = getOrCreateDeviceId();
        expect(id2).toBe(id1);
    });

    it('falls back to in-memory id when localStorage throws', () => {
        vi.stubGlobal('localStorage', {
            getItem: () => { throw new Error('denied'); },
            setItem: () => { throw new Error('denied'); },
            removeItem: () => {},
        });
        const id1 = getOrCreateDeviceId();
        const id2 = getOrCreateDeviceId();
        // In-memory fallback is stable within a single module load
        expect(id1).toBe(id2);
        expect(id1).toMatch(/^[0-9a-f]{8}/);
    });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
npm test -- tests/backend/deviceId.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `src/backend/deviceId.ts`:

```ts
const STORAGE_KEY = 'windysail-device-id';
let memoryFallback: string | null = null;

function uuidv4(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // Fallback for environments without crypto.randomUUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

export function getOrCreateDeviceId(): string {
    try {
        const existing = localStorage.getItem(STORAGE_KEY);
        if (existing) return existing;
        const fresh = uuidv4();
        localStorage.setItem(STORAGE_KEY, fresh);
        return fresh;
    } catch {
        if (memoryFallback) return memoryFallback;
        memoryFallback = uuidv4();
        return memoryFallback;
    }
}

export function hasPersistedDeviceId(): boolean {
    try { return localStorage.getItem(STORAGE_KEY) !== null; } catch { return false; }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/backend/deviceId.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/backend/deviceId.ts tests/backend/deviceId.test.ts
git commit -m "feat(backend): deviceId generator with localStorage persistence"
```

---

## Task 5: Client event queue with tests

**Files:**
- Create: `src/backend/eventQueue.ts`, `tests/backend/eventQueue.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/backend/eventQueue.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { enqueue, drain, peekAll, MAX_QUEUE_SIZE } from '../../src/backend/eventQueue';

describe('eventQueue', () => {
    beforeEach(() => {
        const store: Record<string, string> = {};
        vi.stubGlobal('localStorage', {
            getItem: (k: string) => store[k] ?? null,
            setItem: (k: string, v: string) => { store[k] = v; },
            removeItem: (k: string) => { delete store[k]; },
        });
    });

    it('enqueues and peeks events', () => {
        enqueue({ path: '/install', body: { a: 1 } });
        enqueue({ path: '/heartbeat', body: { b: 2 } });
        expect(peekAll()).toHaveLength(2);
    });

    it('drains by calling the sender for each and removes on success', async () => {
        enqueue({ path: '/install', body: { a: 1 } });
        enqueue({ path: '/heartbeat', body: { b: 2 } });
        const sender = vi.fn().mockResolvedValue(undefined);
        await drain(sender);
        expect(sender).toHaveBeenCalledTimes(2);
        expect(peekAll()).toHaveLength(0);
    });

    it('keeps failed sends in the queue', async () => {
        enqueue({ path: '/install', body: { a: 1 } });
        enqueue({ path: '/heartbeat', body: { b: 2 } });
        const sender = vi.fn()
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('net'));
        await drain(sender);
        expect(peekAll()).toHaveLength(1);
        expect(peekAll()[0].path).toBe('/heartbeat');
    });

    it(`trims to MAX_QUEUE_SIZE (${MAX_QUEUE_SIZE}) on overflow`, () => {
        for (let i = 0; i < MAX_QUEUE_SIZE + 10; i++) {
            enqueue({ path: '/heartbeat', body: { i } });
        }
        expect(peekAll()).toHaveLength(MAX_QUEUE_SIZE);
        // Oldest entries dropped
        expect(peekAll()[0].body.i).toBe(10);
    });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/backend/eventQueue.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/backend/eventQueue.ts`:

```ts
const STORAGE_KEY = 'windysail-pending-events';
export const MAX_QUEUE_SIZE = 50;

export interface QueuedEvent {
    path: '/install' | '/heartbeat' | '/disclaimer-ack';
    body: Record<string, unknown>;
    queuedAt: number;
}

function read(): QueuedEvent[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function write(events: QueuedEvent[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    } catch {
        // Quota or private browsing — silently drop.
    }
}

export function enqueue(event: Omit<QueuedEvent, 'queuedAt'>): void {
    const all = read();
    all.push({ ...event, queuedAt: Date.now() });
    while (all.length > MAX_QUEUE_SIZE) all.shift();
    write(all);
}

export function peekAll(): QueuedEvent[] {
    return read();
}

export async function drain(
    send: (e: QueuedEvent) => Promise<void>,
): Promise<void> {
    const all = read();
    const remaining: QueuedEvent[] = [];
    for (const event of all) {
        try {
            await send(event);
        } catch {
            remaining.push(event);
        }
    }
    write(remaining);
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/backend/eventQueue.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/backend/eventQueue.ts tests/backend/eventQueue.test.ts
git commit -m "feat(backend): localStorage-backed event queue for failed POSTs"
```

---

## Task 6: Client `backend/client.ts` with tests

**Files:**
- Create: `src/backend/config.ts`, `src/backend/client.ts`, `tests/backend/client.test.ts`.

- [ ] **Step 1: Write `src/backend/config.ts`**

```ts
export const BACKEND_BASE_URL = 'https://australia-southeast1-windysail-prod.cloudfunctions.net/api';
export const DISCLAIMER_VERSION = '2026-04';
export const POST_TIMEOUT_MS = 5_000;
export const HEARTBEAT_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;
```

Replace the URL with the real Cloud Functions URL after first deploy. For now the constant is placeholder-free — the module compiles and points at the expected production URL.

- [ ] **Step 2: Write the failing test**

Create `tests/backend/client.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { postInstall, postHeartbeat, postDisclaimerAck, shouldSendHeartbeat } from '../../src/backend/client';
import { peekAll } from '../../src/backend/eventQueue';
import { HEARTBEAT_MIN_INTERVAL_MS } from '../../src/backend/config';

describe('backend/client', () => {
    beforeEach(() => {
        const store: Record<string, string> = {};
        vi.stubGlobal('localStorage', {
            getItem: (k: string) => store[k] ?? null,
            setItem: (k: string, v: string) => { store[k] = v; },
            removeItem: (k: string) => { delete store[k]; },
        });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    });
    afterEach(() => vi.unstubAllGlobals());

    it('postInstall resolves when fetch succeeds', async () => {
        await postInstall({ deviceId: '5c8f6b2a-9e1c-4e5a-a9f3-02b4c9d8f7a1', email: null, pluginVersion: '0.3.0', usedLang: 'en', userAgent: 'UA' });
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/install'), expect.any(Object));
    });

    it('postInstall queues on network failure', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net')));
        await postInstall({ deviceId: '5c8f6b2a-9e1c-4e5a-a9f3-02b4c9d8f7a1', email: null, pluginVersion: '0.3.0', usedLang: 'en', userAgent: 'UA' });
        expect(peekAll()).toHaveLength(1);
    });

    it('shouldSendHeartbeat returns true when no prior timestamp', () => {
        expect(shouldSendHeartbeat()).toBe(true);
    });

    it('shouldSendHeartbeat returns false when last heartbeat is recent', () => {
        localStorage.setItem('windysail-last-heartbeat', new Date().toISOString());
        expect(shouldSendHeartbeat()).toBe(false);
    });

    it('shouldSendHeartbeat returns true when last heartbeat is older than interval', () => {
        const old = new Date(Date.now() - HEARTBEAT_MIN_INTERVAL_MS - 1000).toISOString();
        localStorage.setItem('windysail-last-heartbeat', old);
        expect(shouldSendHeartbeat()).toBe(true);
    });

    it('postHeartbeat marks last heartbeat on success', async () => {
        await postHeartbeat({ deviceId: '5c8f6b2a-9e1c-4e5a-a9f3-02b4c9d8f7a1', email: null, pluginVersion: '0.3.0', usedLang: 'en' });
        expect(localStorage.getItem('windysail-last-heartbeat')).toBeTruthy();
    });

    it('postDisclaimerAck posts with correct path', async () => {
        await postDisclaimerAck({ deviceId: '5c8f6b2a-9e1c-4e5a-a9f3-02b4c9d8f7a1', email: null, pluginVersion: '0.3.0', disclaimerVersion: '2026-04', acceptedAt: new Date().toISOString() });
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/disclaimer-ack'), expect.any(Object));
    });
});
```

- [ ] **Step 3: Run test to confirm failure**

```bash
npm test -- tests/backend/client.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement `src/backend/client.ts`**

```ts
import { BACKEND_BASE_URL, POST_TIMEOUT_MS, HEARTBEAT_MIN_INTERVAL_MS } from './config';
import { enqueue, drain } from './eventQueue';
import type { QueuedEvent } from './eventQueue';

const HEARTBEAT_KEY = 'windysail-last-heartbeat';

export interface InstallBody {
    deviceId: string; email: string | null; pluginVersion: string; usedLang: string; userAgent: string;
}
export interface HeartbeatBody {
    deviceId: string; email: string | null; pluginVersion: string; usedLang: string;
}
export interface DisclaimerBody {
    deviceId: string; email: string | null; pluginVersion: string; disclaimerVersion: string; acceptedAt: string;
}

async function send(path: QueuedEvent['path'], body: unknown): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), POST_TIMEOUT_MS);
    try {
        const res = await fetch(BACKEND_BASE_URL + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
    } finally {
        clearTimeout(timer);
    }
}

async function sendOrQueue(path: QueuedEvent['path'], body: Record<string, unknown>): Promise<void> {
    try {
        await send(path, body);
    } catch {
        enqueue({ path, body });
    }
}

export async function postInstall(body: InstallBody): Promise<void> {
    return sendOrQueue('/install', body);
}

export async function postHeartbeat(body: HeartbeatBody): Promise<void> {
    try {
        await send('/heartbeat', body);
        try { localStorage.setItem(HEARTBEAT_KEY, new Date().toISOString()); } catch {}
    } catch {
        enqueue({ path: '/heartbeat', body });
    }
}

export async function postDisclaimerAck(body: DisclaimerBody): Promise<void> {
    return sendOrQueue('/disclaimer-ack', body);
}

export function shouldSendHeartbeat(): boolean {
    try {
        const last = localStorage.getItem(HEARTBEAT_KEY);
        if (!last) return true;
        const lastMs = new Date(last).getTime();
        if (Number.isNaN(lastMs)) return true;
        return (Date.now() - lastMs) >= HEARTBEAT_MIN_INTERVAL_MS;
    } catch {
        return true;
    }
}

export async function flushPendingEvents(): Promise<void> {
    await drain(e => send(e.path, e.body));
}
```

- [ ] **Step 5: Run tests**

```bash
npm test -- tests/backend/client.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/backend/config.ts src/backend/client.ts tests/backend/client.test.ts
git commit -m "feat(backend): HTTPS client with timeout, queueing, heartbeat debounce"
```

---

## Task 7: Disclaimer modal component

**Files:**
- Create: `src/ui/DisclaimerModal.svelte`.

- [ ] **Step 1: Implement the modal**

Create `src/ui/DisclaimerModal.svelte`:

```svelte
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
```

No TDD for the Svelte component — the behaviour is trivial. Integration wiring in Task 8 is the important test.

- [ ] **Step 2: Commit**

```bash
git add src/ui/DisclaimerModal.svelte
git commit -m "feat(ui): DisclaimerModal component"
```

---

## Task 8: Wire install + heartbeat at plugin startup

**Files:**
- Modify: `src/plugin.svelte`.

- [ ] **Step 1: Import the backend helpers at the top of `<script>`**

Open `src/plugin.svelte`. Below the existing imports, add:

```ts
import { getOrCreateDeviceId, hasPersistedDeviceId } from './backend/deviceId';
import { postInstall, postHeartbeat, shouldSendHeartbeat, flushPendingEvents } from './backend/client';
import store from '@windy/store';
```

(If `store` is already imported, skip the last line.)

- [ ] **Step 2: Add an `onMount`-style startup hook**

Near the top-level of the `<script>` block in `plugin.svelte`, after the existing variable declarations, add a startup effect using Svelte's `onMount`:

```ts
import { onMount } from 'svelte';

onMount(async () => {
    const freshInstall = !hasPersistedDeviceId();
    const deviceId = getOrCreateDeviceId();
    const email = (store.get('user') as any)?.email ?? null;
    const pluginVersion = config.version;
    const usedLang = (store.get('usedLang') as string) ?? 'en';
    const userAgent = navigator.userAgent;

    // Fire-and-forget, never await
    if (freshInstall) {
        postInstall({ deviceId, email, pluginVersion, usedLang, userAgent });
    } else if (shouldSendHeartbeat()) {
        postHeartbeat({ deviceId, email, pluginVersion, usedLang });
    }
    flushPendingEvents();
});
```

**Important:** do not `await` these calls. Plugin UX must never block on backend.

- [ ] **Step 3: Verify `config.version` is available**

Check that `pluginConfig.ts` is imported in `plugin.svelte` and that the `config` object exposes `version`. It does — the existing config already has `version: '0.2.1'`. (E-5 later wires this to `package.json` but for A it's fine to read the current value.)

- [ ] **Step 4: Build the plugin**

```bash
npm run build
```

Expected: compiles cleanly.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/plugin.svelte
git commit -m "feat(plugin): fire install/heartbeat on startup"
```

---

## Task 9: Gate Calculate Route behind disclaimer modal

**Files:**
- Modify: `src/plugin.svelte` (primarily) and/or `src/ui/RoutingPanel.svelte`.

- [ ] **Step 1: Add disclaimer state to `plugin.svelte`**

In `plugin.svelte`'s `<script>` block add:

```ts
import DisclaimerModal from './ui/DisclaimerModal.svelte';
import { DISCLAIMER_VERSION } from './backend/config';
import { postDisclaimerAck } from './backend/client';

const DISCLAIMER_ACK_KEY = 'windysail-disclaimer-ack';

let disclaimerVisible = false;
let pendingCalculate: (() => void) | null = null;

function hasAcknowledgedDisclaimer(): boolean {
    try {
        const raw = localStorage.getItem(DISCLAIMER_ACK_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return parsed?.version === DISCLAIMER_VERSION;
    } catch { return false; }
}

function markDisclaimerAccepted(): void {
    try {
        localStorage.setItem(DISCLAIMER_ACK_KEY, JSON.stringify({
            version: DISCLAIMER_VERSION,
            acceptedAt: new Date().toISOString(),
        }));
    } catch {}
}
```

- [ ] **Step 2: Wrap `handleCalculate` with the disclaimer check**

Find the existing `handleCalculate` function in `plugin.svelte`. Rename it to `performCalculate` (unchanged body). Then define a new `handleCalculate` that intercepts:

```ts
function handleCalculate(...args: any[]) {
    if (hasAcknowledgedDisclaimer()) {
        performCalculate(...args);
        return;
    }
    pendingCalculate = () => performCalculate(...args);
    disclaimerVisible = true;
}

function onDisclaimerAccept() {
    markDisclaimerAccepted();
    const deviceId = getOrCreateDeviceId();
    const email = (store.get('user') as any)?.email ?? null;
    postDisclaimerAck({
        deviceId,
        email,
        pluginVersion: config.version,
        disclaimerVersion: DISCLAIMER_VERSION,
        acceptedAt: new Date().toISOString(),
    });
    disclaimerVisible = false;
    pendingCalculate?.();
    pendingCalculate = null;
}
```

**Note:** the `RoutingPanel` already receives `onCalculate={handleCalculate}` as a prop — that reference now points at the wrapper, no further template changes needed.

- [ ] **Step 3: Mount the modal in the template**

In `plugin.svelte`'s markup block, immediately after the `</section>` of the existing template, add:

```svelte
<DisclaimerModal
    visible={disclaimerVisible}
    onAccept={onDisclaimerAccept}
/>
```

- [ ] **Step 4: Build and run tests**

```bash
npm run build
npm test
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/plugin.svelte
git commit -m "feat(plugin): gate Calculate Route behind first-use disclaimer"
```

---

## Task 10: Deploy functions and wire real backend URL

**Files:**
- Modify: `src/backend/config.ts`.

- [ ] **Step 1: Deploy functions**

```bash
cd firebase && firebase deploy --only firestore:rules,functions
```

Expected output: function URL `https://australia-southeast1-<projectId>.cloudfunctions.net/api` printed at the end.

- [ ] **Step 2: Confirm URL matches the constant**

If the deployed URL differs from `BACKEND_BASE_URL` in `src/backend/config.ts`, update that constant to the actual URL.

- [ ] **Step 3: Smoke-test the endpoints**

```bash
curl -i -X POST https://australia-southeast1-windysail-prod.cloudfunctions.net/api/install \
  -H "Origin: https://www.windy.com" \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"5c8f6b2a-9e1c-4e5a-a9f3-02b4c9d8f7a1","email":null,"pluginVersion":"0.3.0","usedLang":"en","userAgent":"test"}'
```

Expected: `200 OK` with body `{"ok":true}`.

Verify CORS header: `Access-Control-Allow-Origin: https://www.windy.com`.

- [ ] **Step 4: Verify the document landed in Firestore**

Open the Firebase console → Firestore → `devices` collection → `5c8f6b2a-9e1c-4e5a-a9f3-02b4c9d8f7a1`. The document should have `firstSeenAt` and a null `email`.

Clean up the test document after verification (delete from console).

- [ ] **Step 5: Commit any URL change**

```bash
git add src/backend/config.ts
git commit -m "chore(backend): point client at deployed Cloud Functions URL"
```

If no URL change, skip.

---

## Task 11: Manual end-to-end smoke test

**Files:** none.

- [ ] **Step 1: Start the plugin in dev mode**

```bash
npm start
```

- [ ] **Step 2: Open in Windy, clear localStorage, reload**

In DevTools console: `localStorage.clear(); location.reload();`

Expected console network tab: one `POST /install` → `200`.

Expected Firestore: a new document in `devices/` with your deviceId.

- [ ] **Step 3: Reload without clearing**

Expected: one `POST /heartbeat` → `200` (if >24h since last) OR no request (if within debounce window). The first reload after install will show a heartbeat.

- [ ] **Step 4: Plot a route and press Calculate**

Expected: disclaimer modal appears. Ticking the checkbox enables the Accept button. Clicking Accept closes the modal AND kicks off routing AND fires `POST /disclaimer-ack` → `200`.

- [ ] **Step 5: Press Calculate again on a new route**

Expected: no modal, no network call — the ack is remembered locally.

---

## Self-Review

Spec coverage (§A):
- **A-1 stack (Firebase + region)**: Tasks 1, 3.
- **A-2 client identity (deviceId, email, version, lang, UA)**: Tasks 4, 8.
- **A-3 endpoints + fire-and-forget + 5s timeout + retry queue**: Tasks 3, 5, 6.
- **A-3 heartbeat debounce**: Task 6 `shouldSendHeartbeat`.
- **A-4 Firestore schema**: Task 3 handlers write the listed fields.
- **A-5 repo layout**: Task 1.
- **A-6 disclaimer UX**: Tasks 7, 9.
- **Deploy + smoke test**: Tasks 10, 11.
- **CORS restricted to Windy origins**: Task 3 `ALLOWED_ORIGINS`.
- **Deny-all firestore rules**: Task 1 Step 4.

Placeholder scan: clean — every step has concrete code.

Type consistency: `QueuedEvent['path']` from Task 5 re-used in Task 6. Body interfaces (`InstallBody`, `HeartbeatBody`, `DisclaimerBody`) defined in Task 6. Tests in Task 6 use the same field shapes.

Known deferred: Buy Me a Coffee endpoint (spec §A-7) is out of scope. Admin dashboard is out of scope.
