const crypto = require("node:crypto");

const COOKIE_NAME = "yt_studio_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;

function sendJson(res, status, value) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, private");
  res.status(status).json(value);
}

function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return null;
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (!origin || !host) return false;
  try {
    const parsedOrigin = new URL(origin);
    return parsedOrigin.host.toLowerCase() === String(host).toLowerCase()
      && parsedOrigin.protocol === "https:";
  } catch {
    return false;
  }
}

function secretMatches(candidate, expected) {
  if (typeof candidate !== "string" || candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
}

function signPayload(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

module.exports = function studioSession(req, res) {
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("Referrer-Policy", "no-referrer");

  if (req.method === "DELETE") {
    if (!sameOrigin(req)) return sendJson(res, 403, { error: "Request origin was not accepted." });
    res.setHeader(
      "Set-Cookie",
      `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=0`
    );
    return sendJson(res, 200, { ok: true });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, DELETE");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  if (!sameOrigin(req)) return sendJson(res, 403, { error: "Request origin was not accepted." });

  const linkSecret = process.env.STUDIO_LINK_SECRET;
  if (!linkSecret || linkSecret.length < 40) {
    return sendJson(res, 503, { error: "The private studio link is not configured on the server." });
  }

  const body = parseBody(req);
  if (!body || !secretMatches(body.token, linkSecret)) {
    return sendJson(res, 401, { error: "This private studio link is invalid or has expired." });
  }

  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${expiresAt}.${crypto.randomBytes(24).toString("base64url")}`;
  const signedSession = `${Buffer.from(payload).toString("base64url")}.${signPayload(payload, linkSecret)}`;

  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${signedSession}; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=${SESSION_TTL_SECONDS}`
  );
  return sendJson(res, 200, { ok: true, expiresAt });
};
