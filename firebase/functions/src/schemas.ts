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
    email: z.string().email().nullable().default(null),
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

// Cross-device sync payloads ------------------------------------------------
const emailHashRegex = /^[0-9a-f]{32}$/i;
const emailField = z.string().email();

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

export const syncRouteUpsertSchema = z.object({
    emailHash: z.string().regex(emailHashRegex),
    email: emailField,
    deviceId: z.string().regex(/^[0-9a-f-]{36}$/i),
    route: savedRouteSchema,
});

export const syncRouteDeleteSchema = z.object({
    emailHash: z.string().regex(emailHashRegex),
    email: emailField,
    deviceId: z.string().regex(/^[0-9a-f-]{36}$/i),
    routeId: z.string().min(1).max(64),
});

export const syncListSchema = z.object({
    emailHash: z.string().regex(emailHashRegex),
    email: emailField,
    deviceId: z.string().regex(/^[0-9a-f-]{36}$/i),
});

export const customPolarSchema = z.object({
    name: z.string().min(1).max(60),
    twaAngles: z.array(z.number()).max(60),
    twsSpeeds: z.array(z.number()).max(40),
    speeds: z.array(z.array(z.number()).max(40)).max(60),
    updatedAt: z.number().int().nonnegative().default(() => Date.now()),
});

export const syncPolarUpsertSchema = z.object({
    emailHash: z.string().regex(emailHashRegex),
    email: emailField,
    deviceId: z.string().regex(/^[0-9a-f-]{36}$/i),
    polar: customPolarSchema,
});

export const syncPolarDeleteSchema = z.object({
    emailHash: z.string().regex(emailHashRegex),
    email: emailField,
    deviceId: z.string().regex(/^[0-9a-f-]{36}$/i),
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
    emailHash: z.string().regex(emailHashRegex),
    email: emailField,
    deviceId: z.string().regex(/^[0-9a-f-]{36}$/i),
    lastRoute: lastRouteDataSchema,
});

export type InstallPayload = z.infer<typeof installSchema>;
export type HeartbeatPayload = z.infer<typeof heartbeatSchema>;
export type DisclaimerPayload = z.infer<typeof disclaimerSchema>;
export type RoutePayload = z.infer<typeof routeSchema>;
export type SavedRouteDoc = z.infer<typeof savedRouteSchema>;
export type CustomPolarDoc = z.infer<typeof customPolarSchema>;
