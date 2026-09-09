// src/services/geolocation.ts
// Resolves a public IP to a rough city/region/country, so vague
// location-dependent questions ("what's the weather today") can be enriched
// with the requesting user's actual location before being sent to search —
// without this, a web crawl has no way to know where "today" even means and
// silently resolves to wherever the crawling server itself is hosted, not
// the user (verified: an unqualified weather query returned results for the
// VPS's own US hosting region, not Lagos where the actual users are).
import { logger } from "../config/logger";

export type GeoLocation = { city: string; region: string; country: string };

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — an IP's rough location rarely changes faster than this
const REQUEST_TIMEOUT_MS = 3000;

const cache = new Map<string, { location: GeoLocation | null; expiresAt: number }>();

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^::1$/,
  /^::ffff:127\./,
  /^::ffff:10\./,
  /^::ffff:192\.168\./,
];

function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(ip));
}

export async function geolocateIp(ip: string): Promise<GeoLocation | null> {
  if (!ip || isPrivateIp(ip)) return null;

  const cached = cache.get(ip);
  if (cached && cached.expiresAt > Date.now()) return cached.location;

  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,regionName,country`,
      { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    );

    if (!res.ok) {
      cache.set(ip, { location: null, expiresAt: Date.now() + CACHE_TTL_MS });
      return null;
    }

    const data = (await res.json()) as {
      status: string;
      city?: string;
      regionName?: string;
      country?: string;
    };

    const location: GeoLocation | null =
      data.status === "success" && data.city
        ? { city: data.city, region: data.regionName ?? "", country: data.country ?? "" }
        : null;

    cache.set(ip, { location, expiresAt: Date.now() + CACHE_TTL_MS });
    return location;
  } catch (err) {
    logger.debug({ ip, err: (err as Error).message }, "IP geolocation failed");
    // Deliberately not cached — a transient network failure shouldn't lock
    // this IP out of a real answer for the next 6 hours.
    return null;
  }
}

export function formatLocation(location: GeoLocation): string {
  return [location.city, location.region, location.country].filter(Boolean).join(", ");
}
