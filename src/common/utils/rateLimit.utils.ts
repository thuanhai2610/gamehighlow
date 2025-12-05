import {
  ReqHttpRateLimit,
  WsClientRateLimit,
} from 'src/common/interfaces/rateLimit.interface';

export const getHeaderValue = (v?: string | string[]): string | undefined => {
  if (Array.isArray(v)) return v[0];
  return v;
};

export const getIpFromHeaders = (
  headers?: ReqHttpRateLimit,
): string | undefined => {
  if (!headers) return undefined;
  const xff = getHeaderValue(headers['x-forwarded-for']);
  const cf = getHeaderValue(headers['cf-connecting-ip']);
  const realIp = getHeaderValue(headers['x-real-ip']);
  return xff?.split(',')[0].trim() || cf || realIp;
};

export const formatIp = (ip?: string): string | undefined => {
  if (!ip) return undefined;
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  if (ip === '::1') return '127.0.0.1';
  return ip;
};

export const getHttpIp = (req: ReqHttpRateLimit): string => {
  return (
    formatIp(getIpFromHeaders(req.headers)) ||
    formatIp(req.ip) ||
    formatIp(req.connection?.remoteAddress) ||
    formatIp(req.socket?.remoteAddress) ||
    'unknown'
  );
};

export const getWsIp = (client: WsClientRateLimit): string => {
  const hdrIp =
    getIpFromHeaders(client.handshake?.headers) ||
    getIpFromHeaders(client.handshakeHeaders) ||
    getIpFromHeaders(client.headers) ||
    getIpFromHeaders(client.upgradeReq?.headers);

  return (
    formatIp(hdrIp) ||
    formatIp(client.conn?.remoteAddress) ||
    formatIp(client.upgradeReq?.socket?.remoteAddress) ||
    client.ip ||
    'unknown'
  );
};
