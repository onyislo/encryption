# Send decrypt code

Deploy this function with Supabase CLI:

```bash
supabase functions deploy send-decrypt-code
```

Set these Supabase Edge Function secrets:

```bash
supabase secrets set RESEND_API_KEY=re_xxx RESEND_FROM_EMAIL="SecureChat Pro <security@your-domain.com>"
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and the authenticated request token are used by the function automatically. Run `supabase/add_user_settings.sql` in the Supabase SQL Editor before using the decrypt-code setting.
