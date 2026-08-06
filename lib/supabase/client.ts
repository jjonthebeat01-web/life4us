import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Null when env vars aren't set — lets useSession.ts fall back to the local mock store. */
export const supabase =
  url && anonKey ? createClient(url, anonKey, { realtime: { params: { eventsPerSecond: 10 } } }) : null;
