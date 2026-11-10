# Yarns & Totes: private maker link setup

The site uses Supabase for its public gallery, order availability, customer
inquiries, and image storage. The maker dashboard is protected by a private
link, not a Supabase user account.

## What the private link means

Anyone with the maker link can edit the gallery, change availability, and read
customer inquiries. Treat it like a password and send it directly to the maker.
The link is exchanged for a secure, HTTP-only browser session that expires
after 12 hours. The dashboard data API and Supabase service-role key stay on the
server. The one-time link token is in the URL fragment, which browsers do not
send in web requests.

This is convenient for a private preview, but it does not identify which person
is using the link. Rotate the secret immediately if the link is shared or lost.
Email verification can replace this shared-link access later.

## Vercel environment variables

In the `yarns-totes` project, open **Settings → Environment Variables** and add
these four values for **Production**, **Preview**, and **Development**:

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase public anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase `service_role` secret key; server-side only |
| `STUDIO_LINK_SECRET` | The random secret generated in the next step |

Never put `SUPABASE_SERVICE_ROLE_KEY` in browser code, HTML, or the public anon
key variable. Vercel uses `SUPABASE_URL` and `SUPABASE_ANON_KEY` at build time
for public pages and keeps the service-role key and studio-link secret in the
server runtime.

## Generate the private link

After pulling the latest repository changes, run this from the project folder:

```powershell
node scripts/generate-studio-link.js
```

The script prints a random 256-bit secret and its corresponding link:

```text
https://yarns-totes.vercel.app/#studio=YOUR_RANDOM_SECRET
```

Copy the secret into Vercel as `STUDIO_LINK_SECRET`. Then redeploy the site and
send the matching link directly to the maker. Do not commit the secret, put it
in `index.html`, or paste it into a public chat.

If you need to revoke access, generate a new secret, replace the Vercel
`STUDIO_LINK_SECRET`, and redeploy. Existing dashboard sessions are also
invalidated because they are signed with the old secret.

## Supabase database

The schema is in `supabase/schema.sql`. If it has already been run, do not run
it again just for private-link access. The existing public inquiry and storage
policies continue to protect customer submissions and reference photos. The
dashboard API uses the server-only service-role key after validating the
private-link session; it does not require a Supabase Auth user or an
`admin_users` entry.

## Local production build

The static build still needs `SUPABASE_URL` and `SUPABASE_ANON_KEY`. In
PowerShell, set them for the current terminal before running:

```powershell
$env:SUPABASE_URL = "https://your-project.supabase.co"
$env:SUPABASE_ANON_KEY = "your-public-anon-key"
node scripts/build.js
```
