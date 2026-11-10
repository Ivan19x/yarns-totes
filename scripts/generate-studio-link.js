const crypto = require("node:crypto");

const secret = crypto.randomBytes(32).toString("base64url");
console.log("Set this exact value as STUDIO_LINK_SECRET in Vercel:");
console.log(secret);
console.log("");
console.log("After deployment, the private maker link is:");
console.log(`https://yarns-totes.vercel.app/#studio=${secret}`);
console.log("");
console.log("Keep the link private. Anyone with it can manage the site and view customer inquiries.");
