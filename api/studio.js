const crypto = require("node:crypto");

const COOKIE_NAME = "yt_studio_session";
const ITEM_STATUSES = new Set(["Made to order", "Available to request", "Inspiration"]);
const INQUIRY_STATUSES = new Set(["New", "In discussion", "Accepted", "Declined", "Completed"]);
const CATEGORIES = new Set(["Accessories", "Wearables", "Home", "Playful"]);
const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function sendJson(res, status, value) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("Referrer-Policy", "no-referrer");
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

function cookieValue(req, name) {
  const cookieHeader = req.headers.cookie || "";
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return "";
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

function verifySession(req, secret) {
  const value = cookieValue(req, COOKIE_NAME);
  const separator = value.lastIndexOf(".");
  if (!value || separator < 0) return false;

  const encodedPayload = value.slice(0, separator);
  const suppliedSignature = value.slice(separator + 1);
  let payload;
  try {
    payload = Buffer.from(encodedPayload, "base64url").toString("utf8");
  } catch {
    return false;
  }

  const expectedSignature = crypto.createHmac("sha256", secret).update(payload).digest();
  let actualSignature;
  try {
    actualSignature = Buffer.from(suppliedSignature, "base64url");
  } catch {
    return false;
  }
  if (actualSignature.length !== expectedSignature.length
      || !crypto.timingSafeEqual(actualSignature, expectedSignature)) return false;

  const expiry = Number(payload.split(".", 1)[0]);
  return Number.isSafeInteger(expiry) && expiry > Math.floor(Date.now() / 1000);
}

function supabaseCredentials() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("The private database connection is not configured.");
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "https:" || !parsedUrl.hostname.endsWith(".supabase.co")) {
    throw new Error("The configured Supabase project URL is invalid.");
  }
  return { url: parsedUrl.origin, key };
}

async function supabaseFetch(path, options = {}) {
  const { url, key } = supabaseCredentials();
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    const message = typeof data?.message === "string" ? data.message : "The database request failed.";
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
}

function encodedStoragePath(path) {
  return path.split("/").map(segment => encodeURIComponent(segment)).join("/");
}

function validateItem(body) {
  const item = body.item;
  if (!item || typeof item !== "object") throw badRequest("A crochet piece is required.");
  if (typeof item.title !== "string" || item.title.trim().length < 1 || item.title.trim().length > 100) {
    throw badRequest("Piece name must be between 1 and 100 characters.");
  }
  if (!CATEGORIES.has(item.category)) throw badRequest("Choose a valid piece category.");
  if (typeof item.description !== "string" || item.description.trim().length < 1 || item.description.trim().length > 1000) {
    throw badRequest("Piece description must be between 1 and 1000 characters.");
  }
  if (!ITEM_STATUSES.has(item.status)) throw badRequest("Choose a valid piece status.");
  if (typeof item.published !== "boolean") throw badRequest("Piece visibility setting is invalid.");
  if (typeof item.image_path !== "string" || item.image_path.length > 1000) {
    throw badRequest("A valid image is required.");
  }
  const imageIsHttp = /^https?:\/\/\S+$/i.test(item.image_path);
  const imageIsStored = /^gallery\/[A-Za-z0-9._-]+\.(jpg|png|webp)$/.test(item.image_path);
  const imageIsSeed = /^site:images\/[A-Za-z0-9%._-]+\.png$/.test(item.image_path);
  if (!imageIsHttp && !imageIsStored && !imageIsSeed) throw badRequest("The image must be a valid gallery photo or HTTPS image URL.");
  return {
    title: item.title.trim(),
    category: item.category,
    description: item.description.trim(),
    status: item.status,
    image_path: item.image_path,
    published: item.published
  };
}

async function getDashboard() {
  const [items, inquiries, settings] = await Promise.all([
    supabaseFetch("/rest/v1/crochet_items?select=id,title,category,description,status,image_path,published,created_at&order=created_at.desc"),
    supabaseFetch("/rest/v1/order_inquiries?select=id,name,contact,description,design_title,reference_path,status,created_at&order=created_at.desc"),
    supabaseFetch("/rest/v1/site_settings?select=value&key=eq.availability")
  ]);

  const gallery = await Promise.all(items.map(async item => {
    if (!item.image_path || item.image_path.startsWith("site:") || /^https?:\/\//i.test(item.image_path)) {
      return { ...item, image_url: item.image_path?.startsWith("site:") ? item.image_path.slice(5) : item.image_path };
    }
    const signed = await supabaseFetch(
      `/storage/v1/object/sign/gallery-images/${encodedStoragePath(item.image_path)}`,
      { method: "POST", body: JSON.stringify({ expiresIn: 3600 }) }
    );
    return { ...item, image_url: new URL(signed.signedURL, supabaseCredentials().url).toString() };
  }));

  const orderInquiries = await Promise.all(inquiries.map(async inquiry => {
    if (!inquiry.reference_path) return { ...inquiry, reference_url: "" };
    const signed = await supabaseFetch(
      `/storage/v1/object/sign/order-references/${encodedStoragePath(inquiry.reference_path)}`,
      { method: "POST", body: JSON.stringify({ expiresIn: 3600 }) }
    );
    return {
      ...inquiry,
      reference_url: new URL(signed.signedURL, supabaseCredentials().url).toString()
    };
  }));

  return {
    items: gallery,
    inquiries: orderInquiries,
    availability: settings[0]?.value === "available" || settings[0]?.value === "full"
      ? settings[0].value
      : null
  };
}

module.exports = async function studio(req, res) {
  const linkSecret = process.env.STUDIO_LINK_SECRET;
  if (!linkSecret || linkSecret.length < 40) {
    return sendJson(res, 503, { error: "The private studio link is not configured on the server." });
  }
  if (!verifySession(req, linkSecret)) return sendJson(res, 401, { error: "Open the private studio link to continue." });

  try {
    if (req.method === "GET") {
      return sendJson(res, 200, await getDashboard());
    }
    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return sendJson(res, 405, { error: "Method not allowed." });
    }
    if (!sameOrigin(req)) return sendJson(res, 403, { error: "Request origin was not accepted." });

    const body = parseBody(req);
    if (!body || typeof body.action !== "string") return sendJson(res, 400, { error: "A valid action is required." });

    if (body.action === "upload-url") {
      if (!IMAGE_TYPES.has(body.contentType)) return sendJson(res, 400, { error: "Choose a PNG, JPG, or WEBP image." });
      const path = `gallery/${crypto.randomUUID()}.${IMAGE_TYPES.get(body.contentType)}`;
      const signed = await supabaseFetch(
        `/storage/v1/object/upload/sign/gallery-images/${encodedStoragePath(path)}`,
        { method: "POST", body: JSON.stringify({ upsert: false }) }
      );
      return sendJson(res, 200, { path, token: signed.token });
    }

    if (body.action === "save-item") {
      const item = validateItem(body);
      if (body.id) {
        if (typeof body.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id)) {
          return sendJson(res, 400, { error: "Piece identifier is invalid." });
        }
        await supabaseFetch(`/rest/v1/crochet_items?id=eq.${encodeURIComponent(body.id)}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(item)
        });
        return sendJson(res, 200, { ok: true });
      }
      const created = await supabaseFetch("/rest/v1/crochet_items", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(item)
      });
      return sendJson(res, 201, { item: created[0] });
    }

    if (body.action === "delete-item") {
      if (typeof body.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id)) {
        return sendJson(res, 400, { error: "Piece identifier is invalid." });
      }
      const rows = await supabaseFetch(
        `/rest/v1/crochet_items?select=image_path&id=eq.${encodeURIComponent(body.id)}`
      );
      await supabaseFetch(`/rest/v1/crochet_items?id=eq.${encodeURIComponent(body.id)}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" }
      });
      const imagePath = rows[0]?.image_path;
      if (imagePath && /^gallery\/[A-Za-z0-9._-]+\.(jpg|png|webp)$/.test(imagePath)) {
        try {
          await supabaseFetch("/storage/v1/object/gallery-images", {
            method: "DELETE",
            body: JSON.stringify({ prefixes: [imagePath] })
          });
        } catch (error) {
          console.error("Piece removed, but its stored photo could not be deleted.", error);
        }
      }
      return sendJson(res, 200, { ok: true });
    }

    if (body.action === "delete-item-image") {
      if (typeof body.path !== "string" || !/^gallery\/[A-Za-z0-9._-]+\.(jpg|png|webp)$/.test(body.path)) {
        return sendJson(res, 400, { error: "Gallery image path is invalid." });
      }
      await supabaseFetch("/storage/v1/object/gallery-images", {
        method: "DELETE",
        body: JSON.stringify({ prefixes: [body.path] })
      });
      return sendJson(res, 200, { ok: true });
    }

    if (body.action === "availability") {
      if (body.value !== "available" && body.value !== "full") {
        return sendJson(res, 400, { error: "Choose a valid order availability status." });
      }
      await supabaseFetch("/rest/v1/site_settings?on_conflict=key", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ key: "availability", value: body.value })
      });
      return sendJson(res, 200, { ok: true, value: body.value });
    }

    if (body.action === "inquiry-status") {
      if (typeof body.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id)) {
        return sendJson(res, 400, { error: "Inquiry identifier is invalid." });
      }
      if (!INQUIRY_STATUSES.has(body.value)) return sendJson(res, 400, { error: "Choose a valid inquiry status." });
      await supabaseFetch(`/rest/v1/order_inquiries?id=eq.${encodeURIComponent(body.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: body.value })
      });
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 400, { error: "Unknown studio action." });
  } catch (error) {
    console.error("Studio API request failed.", error);
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600
      ? error.status
      : 500;
    return sendJson(res, status, { error: error.message || "The studio request failed." });
  }
};
