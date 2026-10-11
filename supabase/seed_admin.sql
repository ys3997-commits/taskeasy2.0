-- Run AFTER creating the admin Auth user in Supabase Dashboard
-- (Authentication → Users → Add user).
-- Replace the placeholders below, then execute in the SQL editor.
--
-- Example:
--   email: admin@rajshree.energy
--   password: (set securely in Auth UI)
--
-- Then copy the user's UUID from Auth and run:

/*
INSERT INTO public.profiles (
  id, first_name, last_name, username, email, role, is_active, must_change_password
) VALUES (
  'PASTE-AUTH-USER-UUID-HERE',
  'Admin',
  'User',
  'admin.user',
  'admin@rajshree.energy',
  'admin',
  TRUE,
  FALSE
);
*/
