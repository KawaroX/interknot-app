const cache = new Map<string, { value: string; expiresAt: number }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const normalizeIp = (ip: string) => ip.replace(/^::ffff:/, '').trim();

const isPrivateIpv4 = (ip: string) => {
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('127.')) return true;
  if (ip.startsWith('169.254.')) return true;
  if (ip.startsWith('172.')) {
    const second = Number(ip.split('.')[1] ?? -1);
    return second >= 16 && second <= 31;
  }
  return false;
};

const isPrivateIpv6 = (ip: string) => {
  const normalized = ip.toLowerCase();
  if (normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('fe80')) return true;
  return false;
};

const isPrivateIp = (ip: string) => {
  if (!ip) return true;
  if (ip.includes(':')) return isPrivateIpv6(ip);
  return isPrivateIpv4(ip);
};

const readHeaderRegion = (request: Request) => {
  return (
    request.headers.get('x-geo-region') ||
    request.headers.get('x-geo-city') ||
    request.headers.get('x-geo-country') ||
    request.headers.get('cf-ipcountry') ||
    request.headers.get('x-vercel-ip-country') ||
    ''
  ).trim();
};

const formatRegion = (parts: Array<string | undefined>) => {
  const cleaned = parts.map((part) => part?.trim()).filter(Boolean) as string[];
  return cleaned.join(' ');
};

export const resolveClientIp = (request: Request, getClientAddress: () => string) => {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const forwardedIp = forwardedFor?.split(',')[0]?.trim();
  const raw = forwardedIp || realIp?.trim() || getClientAddress();
  return normalizeIp(raw);
};

export const lookupIpRegion = async (ip: string, request: Request) => {
  const headerRegion = readHeaderRegion(request);
  const normalizedIp = normalizeIp(ip);
  if (!normalizedIp || isPrivateIp(normalizedIp)) {
    return headerRegion;
  }

  const cached = cache.get(normalizedIp);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value || headerRegion;
  }

  const url = `http://ip-api.com/json/${encodeURIComponent(
    normalizedIp,
  )}?fields=status,message,country,regionName,city&lang=zh-CN`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error('ip_region_lookup_failed', res.status);
      cache.set(normalizedIp, { value: '', expiresAt: Date.now() + CACHE_TTL_MS });
      return headerRegion;
    }
    const data = (await res.json()) as {
      status?: string;
      message?: string;
      country?: string;
      regionName?: string;
      city?: string;
    };
    if (data.status !== 'success') {
      const value = '';
      cache.set(normalizedIp, { value, expiresAt: Date.now() + CACHE_TTL_MS });
      return headerRegion;
    }
    const value = formatRegion([data.country, data.regionName, data.city]);
    cache.set(normalizedIp, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value || headerRegion;
  } catch (err) {
    console.error('ip_region_lookup_error', err);
    cache.set(normalizedIp, { value: '', expiresAt: Date.now() + CACHE_TTL_MS });
    return headerRegion;
  }
};
