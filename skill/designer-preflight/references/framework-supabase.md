# Supabase

Supabase is the most common backend in AI-built apps (Lovable, Bolt and v0 use it by default). The browser talks to the database directly with the **anon key**. That is safe **only** when row-level security (RLS) is switched on and the policies are correct. Most serious leaks in vibe-coded apps come from this.

Explain it to the designer like this: "The anon key is like the front door key that every visitor gets. Row-level security is the lock on each room. Without it, every visitor can walk into every room."

## Checks

1. **RLS is on for every table in exposed schemas** (normally `public`).
   - Look in `supabase/migrations/*.sql` for `alter table … enable row level security` on every `create table`.
   - If there are no migrations, ask the designer to open the Supabase dashboard, then Advisors, then Security Advisor. It lists tables without RLS. Mark this `human-only` with those steps.
2. **Policies are actually restrictive:**
   - `using (true)` on select means anyone can read every row. That is fine for public content such as products, but not for orders, profiles or messages.
   - Policies should compare with `auth.uid()`, for example `using (auth.uid() = user_id)`.
   - Insert and update policies need `with check`, so users cannot write rows as someone else.
   - Roles kept in a `profiles` table that users can update themselves let anyone make themselves an admin.
3. **Service-role key is server-only.** It bypasses RLS completely.
   - The scan detects it in code and in the built site.
   - It must only appear in server code or edge functions, through a variable without `NEXT_PUBLIC_`, `VITE_` or `PUBLIC_`.
4. **Storage buckets:** public buckets are readable by anyone with the URL. Private files (invoices, IDs, user uploads) need private buckets with storage policies.
5. **Edge functions** (`supabase/functions`): verify the caller's JWT unless the function is meant to be public (for example a webhook, which must verify its own signature instead).
6. **`security definer` functions** run with full rights. They must check the caller themselves, and set `search_path`.
7. **Auth settings (dashboard):**
   - email confirmation on;
   - redirect URLs limited to your own domains;
   - leaked-password protection and rate limits reviewed.

   Mark these `human-only`, with steps.
8. **Client usage:**
   - Use `@supabase/ssr` for server-rendered frameworks (Next.js, SvelteKit, Nuxt).
   - The older auth helpers packages are deprecated, and having both is a leftover.

## Common AI-built mistakes

- Tables created through the dashboard or SQL with RLS never enabled.
- RLS enabled with a single `using (true)` policy "to make it work".
- Admin checks done in the front end only (`if (user.email === 'me@…')`).
- The service-role key used in the browser to get around an RLS error.

---

Sources:
- [Supabase: row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).
- [Supabase: API keys](https://supabase.com/docs/guides/api/api-keys).
- [Supabase: storage access control](https://supabase.com/docs/guides/storage/security/access-control).
- [Supabase: database advisors](https://supabase.com/docs/guides/database/database-advisors).
- [Supabase: server-side auth](https://supabase.com/docs/guides/auth/server-side).
- [vibecoded-site-audit-skill](https://github.com/sstanley-yelnatss/vibecoded-site-audit-skill) (MIT): missing RLS and the service key in the browser as common failures.
