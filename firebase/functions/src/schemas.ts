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
