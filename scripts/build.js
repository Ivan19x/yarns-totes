const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const outputDirectory = path.join(projectRoot, "dist");
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Set SUPABASE_URL and SUPABASE_ANON_KEY in the Vercel project environment before deploying."
  );
}

let parsedUrl;
try {
  parsedUrl = new URL(supabaseUrl);
} catch {
  throw new Error("SUPABASE_URL must be a valid project URL.");
}

if (parsedUrl.protocol !== "https:" || !parsedUrl.hostname.endsWith(".supabase.co")) {
  throw new Error("SUPABASE_URL must be an HTTPS Supabase project URL.");
}
if (parsedUrl.pathname !== "/" || parsedUrl.search || parsedUrl.hash) {
  throw new Error("SUPABASE_URL must be the project URL, without a path, query, or fragment.");
}

if (supabaseAnonKey.trim() !== supabaseAnonKey) {
  throw new Error("SUPABASE_ANON_KEY must not contain surrounding whitespace.");
}

fs.rmSync(outputDirectory, { recursive: true, force: true });
fs.mkdirSync(outputDirectory, { recursive: true });

for (const file of ["index.html", "styles.css", "app.js"]) {
  fs.copyFileSync(path.join(projectRoot, file), path.join(outputDirectory, file));
}

fs.cpSync(path.join(projectRoot, "images"), path.join(outputDirectory, "images"), {
  recursive: true
});

const publicConfig = {
  url: parsedUrl.origin,
  anonKey: supabaseAnonKey
};

fs.writeFileSync(
  path.join(outputDirectory, "supabase-config.js"),
  `window.YT_SUPABASE_CONFIG = ${JSON.stringify(publicConfig)};\n`,
  "utf8"
);

console.log("Built the static site with public Supabase configuration.");
