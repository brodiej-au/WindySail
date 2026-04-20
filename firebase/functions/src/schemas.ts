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

export type InstallPayload = z.infer<typeof installSchema>;
export type HeartbeatPayload = z.infer<typeof heartbeatSchema>;
export type DisclaimerPayload = z.infer<typeof disclaimerSchema>;
export type RoutePayload = z.infer<typeof routeSchema>;
