import { useEffect, useState } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns the current authenticated user, or null while loading.
 * If `requireAuth` is true (default), redirects to /login when no session exists.
 */
export function useAuth(requireAuth = true) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setUser(data.session?.user ?? null);
      setReady(true);
      if (requireAuth && !data.session) {
        navigate({
          to: "/login",
          search: { redirect: router.state.location.href },
          replace: true,
        });
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      if (requireAuth && !session) {
        navigate({ to: "/login", search: { redirect: router.state.location.href }, replace: true });
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [requireAuth, navigate, router]);

  return { user, ready };
}

export async function signOut() {
  await supabase.auth.signOut();
}
