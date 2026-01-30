import ipaddr from 'ipaddr.js';

const normalizeIp = (rawIp) => {
  if (!rawIp) return null;
  let ip = rawIp;
  if (ip.includes(',')) {
    ip = ip.split(',')[0].trim();
  }
  if (ip.startsWith('::ffff:')) {
    ip = ip.replace('::ffff:', '');
  }
  return ip;
};

const normalizeCidrEntry = (rawEntry) => {
  const entry = (rawEntry || '').trim();
  if (!entry) return null;
  if (entry.includes('/')) {
    return entry;
  }
  try {
    const addr = ipaddr.parse(entry);
    return addr.kind() === 'ipv6' ? `${entry}/128` : `${entry}/32`;
  } catch (error) {
    return null;
  }
};

export const getAllowedIpRangesFromEnv = () => {
  const raw = process.env.OFFICE_ALLOWED_IPS || '';
  if (!raw) return [];
  return raw
    .split(',')
    .map(normalizeCidrEntry)
    .filter(Boolean);
};

export const isIpInRanges = (rawIp, ranges = []) => {
  try {
    const ip = normalizeIp(rawIp);
    if (!ip) return false;
    const addr = ipaddr.parse(ip);
    return ranges.some((range) => {
      try {
        const [rangeAddr, prefix] = ipaddr.parseCIDR(range);
        if (addr.kind() !== rangeAddr.kind()) {
          return false;
        }
        return addr.match([rangeAddr, prefix]);
      } catch (err) {
        return false;
      }
    });
  } catch (error) {
    return false;
  }
};

export const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return normalizeIp(ip || req.ip || req.connection?.remoteAddress || '');
};
