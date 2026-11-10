# Yarns & Totes: Supabase and Vercel setup

The deployed site uses Supabase for its shared gallery, maker sign-in, order
availability, customer inquiries, and image storage. Customer accounts are not
required.

## 1. Configure the Supabase database

1. Open the Supabase project and go to **SQL Editor**.
2. Open `supabase/schema.sql` in this repository, copy its contents into a new
   SQL query, and run it.
3. In **Project Settings → API**, copy the project URL and the public
   `anon`/publishable key. Never use a `service_role` or secret key in this
   website.

The SQL creates the tables and storage buckets, adds row-level security, and
seeds the four beanie designs. Re-running it does not duplicate those sample
designs.

## 2. Configure Vercel

In the `yarns-totes` Vercel project, open **Settings → Environment Variables**.
Add both values for **Production**, **Preview**, and **Development**:

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase public anon/publishable key |

Save them, then redeploy the latest commit. `vercel.json` runs the static build,
which writes the public browser configuration into the generated `dist`
directory. The anon key is intentionally public; database and storage access is
restricted by the SQL policies. Do not add a service-role key.

## 3. Create and authorize the maker account

1. In Supabase, go to **Authentication → Users** and create a user for the
   maker's email with a strong password. Confirm the email in the dashboard if
   email confirmation is enabled. Do not enable public sign-ups on the website.
2. Copy that user's UUID from the Users list.
3. In **SQL Editor**, run the following, replacing the example UUID:

   ```sql
   insert into public.admin_users (user_id)
   values ('00000000-0000-0000-0000-000000000000')
   on conflict (user_id) do nothing;
   ```

4. Open the deployed site, choose **Maker studio**, and sign in with that
   account.

Only UUIDs added to `admin_users` can access the dashboard or manage the
collection. Customer requests can be submitted without accounts. Inquiries are
visible only to an authorized maker; reference photos are stored in a private
bucket.

## Local checks

The build requires the same two environment variables. In PowerShell, set them
for the current terminal before running:

```powershell
$env:SUPABASE_URL = "https://your-project.supabase.co"
$env:SUPABASE_ANON_KEY = "your-public-anon-key"
node scripts/build.js
```

The generated `dist` folder is for deployment and should not be committed.
