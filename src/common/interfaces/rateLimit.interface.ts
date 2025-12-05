export type HeadersRateLimit = Record<string, string | string[] | undefined>;

export type ReqHttpRateLimit = {
  headers?: HeadersRateLimit;
  ip?: string;
  connection?: { remoteAddress?: string };
  socket?: { remoteAddress?: string };
};

export type WsClientRateLimit = {
  conn?: { remoteAddress?: string; request?: { headers?: HeadersRateLimit } };
  handshake?: { address?: string; headers?: HeadersRateLimit };
  handshakeHeaders?: HeadersRateLimit;
  headers?: HeadersRateLimit;
  upgradeReq?: {
    headers?: HeadersRateLimit;
    socket?: { remoteAddress?: string };
  };
  ip?: string;
};
