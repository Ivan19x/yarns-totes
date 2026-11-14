const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const studio = require("../api/studio");

test("dashboard image URLs include the Supabase Storage API path", async () => {
  const originalFetch = global.fetch;
  const envNames = ["STUDIO_LINK_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  const secret = "test-studio-secret".padEnd(43, "x");
  const projectUrl = "https://test-project.supabase.co";

  process.env.STUDIO_LINK_SECRET = secret;
  process.env.SUPABASE_URL = projectUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

  const responses = new Map([
    ["/rest/v1/crochet_items", [{
      id: "gallery-item",
      title: "Test piece",
      category: "Accessories",
      description: "Test piece",
      status: "Made to order",
      image_path: "gallery/test-piece.png",
      published: true,
      created_at: "2026-01-01T00:00:00.000Z"
    }]],
    ["/rest/v1/order_inquiries", [{
      id: "inquiry",
      name: "Test customer",
      contact: "test@example.com",
      description: "Test request",
      design_title: null,
      reference_path: "customer-requests/test-reference.png",
      status: "New",
      created_at: "2026-01-01T00:00:00.000Z"
    }]],
    ["/rest/v1/site_settings", [{ value: "available" }]],
    ["/storage/v1/object/sign/gallery-images/gallery/test-piece.png", {
      signedURL: "/object/sign/gallery-images/gallery/test-piece.png?token=gallery"
    }],
    ["/storage/v1/object/sign/order-references/customer-requests/test-reference.png", {
      signedURL: "/object/sign/order-references/customer-requests/test-reference.png?token=reference"
    }]
  ]);

  global.fetch = async input => {
    const url = new URL(input);
    const response = responses.get(url.pathname);
    if (!response) throw new Error(`Unexpected Supabase request: ${url.pathname}`);
    return { ok: true, text: async () => JSON.stringify(response) };
  };

  try {
    const payload = `${Math.floor(Date.now() / 1000) + 3600}.test-session`;
    const encodedPayload = Buffer.from(payload).toString("base64url");
    const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
    const req = {
      method: "GET",
      headers: { cookie: `yt_studio_session=${encodedPayload}.${signature}` }
    };
    const res = {
      statusCode: 0,
      headers: {},
      setHeader(name, value) {
        this.headers[name] = value;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      }
    };

    await studio(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(
      res.body.items[0].image_url,
      `${projectUrl}/storage/v1/object/sign/gallery-images/gallery/test-piece.png?token=gallery`
    );
    assert.equal(
      res.body.inquiries[0].reference_url,
      `${projectUrl}/storage/v1/object/sign/order-references/customer-requests/test-reference.png?token=reference`
    );
  } finally {
    global.fetch = originalFetch;
    for (const name of envNames) {
      if (originalEnv[name] === undefined) delete process.env[name];
      else process.env[name] = originalEnv[name];
    }
  }
});
