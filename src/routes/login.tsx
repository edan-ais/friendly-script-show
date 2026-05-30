import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/login")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : "/",
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { redirect } = useSearch({ from: "/login" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: redirect, replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: redirect, replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate, redirect]);

  async function signIn() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message);
  }

  async function signUp() {
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Account created — signing you in...");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#08080f] px-4 text-white">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-white/10 bg-[#0c0c14] p-6 shadow-xl">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">Prompter / Studio</h1>
          <p className="text-sm text-white/60">Sign in to save your scripts and projects.</p>
        </div>
        <Tabs defaultValue="signin">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Sign up</TabsTrigger>
          </TabsList>
          <TabsContent value="signin" className="space-y-3 pt-4">
            <Field id="email-in" label="Email" value={email} onChange={setEmail} type="email" />
            <Field id="pw-in" label="Password" value={password} onChange={setPassword} type="password" />
            <Button className="w-full" onClick={signIn} disabled={busy || !email || !password}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
            </Button>
          </TabsContent>
          <TabsContent value="signup" className="space-y-3 pt-4">
            <Field id="email-up" label="Email" value={email} onChange={setEmail} type="email" />
            <Field id="pw-up" label="Password (min 6)" value={password} onChange={setPassword} type="password" />
            <Button className="w-full" onClick={signUp} disabled={busy || !email || password.length < 6}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
            </Button>
          </TabsContent>
        </Tabs>
        <div className="text-center text-xs text-white/40">
          <Link to="/" className="underline-offset-2 hover:underline">Back to home</Link>
        </div>
      </div>
    </div>
  );
}

function Field({ id, label, value, onChange, type }: { id: string; label: string; value: string; onChange: (v: string) => void; type: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs uppercase tracking-wide text-white/50">{label}</Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} className="bg-white/5" />
    </div>
  );
}
