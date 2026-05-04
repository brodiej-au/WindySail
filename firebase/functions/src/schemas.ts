import { z } from 'zod';

// --- Identity model ---------------------------------------------------------
// Per Windy's data-handling policy, we never accept raw `email` or persistent
// `deviceId` from clients. The only optional user identifier is `emailHash`,
// a one-way SHA-256 the client computes from the user's Windy email. Server
// stores the hash; server cannot reverse it back to an email address.
//
// Anonymous users (not signed into Windy) send `emailHash: null` — these
// events are recorded with no user pointer at all.

const emailHashRegex = /^[0-9a-f]{32}$/i;
const emailHashField = z.string().regex(emailHashRegex);
const emailHashOrNull = z.string().regex(emailHashRegex).nullable().default(null);

const baseFields = {
    emailHash: emailHashOrNull,
    pluginVersion: z.string().min(1).max(20),
    usedLang: z.string().min(2).max(10).default('en'),
};

export const installSchema = z.object({
    ...baseFields,
    userAgent: z.string().max(2000).transform(s => s.slice(0, 200)),
});

export const disclaimerSchema = z.object({
    ...baseFields,
    disclaimerVersion: z.string().min(1).max(30),
    acceptedAt: z.string().datetime(),
});

const latLonSchema = z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    name: z.string().max(120).optional(),
});

const modelResultSchema = z.object({
    model: z.string().max(20),
    durationHours: z.number().nonnegative(),
    totalDistanceNm: z.number().nonnegative(),
    avgSpeedKt: z.number().nonnegative(),
    maxTws: z.number().nonnegative(),
    etaMs: z.number().nonnegative(),
});

export const routeSchema = z.object({
    ...baseFields,
    mode: z.enum(['single', 'departure']),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
    departureTime: z.string().datetime(),
    polarName: z.string().max(60),
    motorboatMode: z.boolean().default(false),
    selectedModels: z.array(z.string().max(20)).max(10),
    start: latLonSchema,
    end: latLonSchema,
    waypointCount: z.number().int().nonnegative(),
    waypoints: z.array(latLonSchema).max(20),
    results: z.array(modelResultSchema).max(10),
    failedReason: z.string().max(200).nullable().default(null),
});

// --- Cross-device sync payloads -------------------------------------------
// All sync endpoints require an emailHash (sync is a no-op for anonymous
// users). No raw email or deviceId is accepted.

export const savedRouteSchema = z.object({
    id: z.string().min(1).max(64),
    name: z.string().max(120),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative().default(() => Date.now()),
    start: latLonSchema,
    end: latLonSchema,
    waypoints: z.array(latLonSchema).max(20),
    departureTime: z.number().int().nonnegative(),
    polarName: z.string().max(60),
    selectedModels: z.array(z.string().max(20)).max(10),
    routingOptions: z.record(z.any()),
});

export const syncListSchema = z.object({
    emailHash: emailHashField,
});

export const syncRouteUpsertSchema = z.object({
    emailHash: emailHashField,
    route: savedRouteSchema,
});

export const syncRouteDeleteSchema = z.object({
    emailHash: emailHashField,
    routeId: z.string().min(1).max(64),
});

export const customPolarSchema = z.object({
    name: z.string().min(1).max(60),
    twaAngles: z.array(z.number()).max(60),
    twsSpeeds: z.array(z.number()).max(40),
    speeds: z.array(z.array(z.number()).max(40)).max(60),
    updatedAt: z.number().int().nonnegative().default(() => Date.now()),
});

export const syncPolarUpsertSchema = z.object({
    emailHash: emailHashField,
    polar: customPolarSchema,
});

export const syncPolarDeleteSchema = z.object({
    emailHash: emailHashField,
    polarName: z.string().min(1).max(60),
});

const lastRouteDataSchema = z.object({
    start: latLonSchema,
    end: latLonSchema,
    waypoints: z.array(latLonSchema).max(20),
    departureTime: z.number().int().nonnegative(),
    polarName: z.string().max(60),
    selectedModels: z.array(z.string().max(20)).max(10),
    routingOptions: z.record(z.any()),
    updatedAt: z.number().int().nonnegative().default(() => Date.now()),
});

export const syncLastRouteSetSchema = z.object({
    emailHash: emailHashField,
    lastRoute: lastRouteDataSchema,
});

const userSettingsBlob = z.record(z.any()).and(z.object({
    updatedAt: z.number().int().nonnegative().default(() => Date.now()),
}));

export const syncSettingsSetSchema = z.object({
    emailHash: emailHashField,
    settings: userSettingsBlob,
});

export type InstallPayload = z.infer<typeof installSchema>;
export type DisclaimerPayload = z.infer<typeof disclaimerSchema>;
export type RoutePayload = z.infer<typeof routeSchema>;
export type SavedRouteDoc = z.infer<typeof savedRouteSchema>;
export type CustomPolarDoc = z.infer<typeof customPolarSchema>;
