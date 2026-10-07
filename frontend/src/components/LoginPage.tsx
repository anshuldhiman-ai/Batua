import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { motion, useReducedMotion } from "framer-motion";
import {
  KeyRound,
  Mail,
  User,
  Eye,
  EyeOff,
  LogIn,
  UserPlus,
  ShieldCheck,
  Loader2,
} from "lucide-react";

import Logo from "@/components/Logo";
import { useAuth } from "@/components/Auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { noMotion, staggerContainer, fadeUp } from "@/lib/motion";
import { cn } from "@/lib/utils";

const inputCls =
  "h-11 rounded-xl border border-input bg-background px-4 text-sm placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Field({
  icon: Icon,
  label,
  id,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  icon: React.ElementType;
  label: string;
  id: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input id={id} {...props} className={cn(inputCls, "pl-10")} />
      </div>
    </div>
  );
}

/**
 * Sign-in / first-run registration. Styled like every other page —
 * same Card, CardHeader rhythm and motion presets — so it reads as
 * part of the app, not a bolted-on gate.
 */
export default function LoginPage() {
  const { register, login } = useAuth();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ username: "", email: "", password: "" });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (form.username.trim().length < 3) {
      toast.error("Username must be at least 3 characters");
      return;
    }
    if (form.password.length < 4) {
      toast.error("Password must be at least 4 characters");
      return;
    }
    if (mode === "register" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast.error("Enter a valid email address");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") {
        await login(form.username.trim(), form.password);
        toast.success(`Welcome back, @${form.username.trim()}`);
      } else {
        await register(form.username.trim(), form.email.trim(), form.password);
        await login(form.username.trim(), form.password);
        toast.success(`Welcome to Batua, @${form.username.trim()}`);
      }
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      // Server messages (401/409 detail) are user-facing.
      const msg = err?.response?.data?.detail || "Couldn't reach the Batua server";
      toast.error(typeof msg === "string" ? msg : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const variants = reduce ? noMotion : staggerContainer;
  const item = reduce ? noMotion : fadeUp;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <motion.div
        variants={variants}
        initial="hidden"
        animate="show"
        className="w-full max-w-sm space-y-5"
      >
        <motion.div variants={item} className="flex flex-col items-center gap-3 text-center">
          <Logo className="h-16 w-16 rounded-2xl" />
          <div>
            <h1 className="font-brand text-2xl font-semibold tracking-wide">Batua</h1>
          </div>
        </motion.div>

        <motion.div variants={item}>
          <form onSubmit={submit}>
            <Card glow={false}>
              <CardHeader>
                <CardTitle>
                  {mode === "login" ? "Sign in to your account" : "Create your account"}
                </CardTitle>
                <CardDescription>
                  {mode === "login"
                    ? "Enter your credentials to access your data"
                    : "One account per install — your data stays on-device"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field
                  icon={User}
                  label="Username"
                  id="login-username"
                  autoComplete="username"
                  placeholder="anshuldhiman-ai"
                  value={form.username}
                  onChange={set("username")}
                  minLength={3}
                  required
                />
                {mode === "register" && (
                  <Field
                    icon={Mail}
                    label="Email"
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={set("email")}
                    required
                  />
                )}
                <div className="space-y-1.5">
                  <label
                    htmlFor="login-password"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={mode === "register" ? "new-password" : "current-password"}
                      placeholder="••••••••"
                      value={form.password}
                      onChange={set("password")}
                      minLength={4}
                      required
                      className={cn(inputCls, "pl-10 pr-10")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" size="lg" className="w-full" disabled={busy}>
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Please wait…
                    </>
                  ) : mode === "login" ? (
                    <>
                      <LogIn className="h-4 w-4" /> Sign in
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4" /> Create account
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </form>
        </motion.div>

        <motion.div variants={item} className="text-center">
          <button
            type="button"
            onClick={() => setMode((m) => (m === "login" ? "register" : "login"))}
            className="text-sm font-medium text-primary underline-offset-4 transition-colors hover:underline"
          >
            {mode === "login"
              ? "First time here? Create your account"
              : "Already have an account? Sign in"}
          </button>
        </motion.div>

        <motion.p
          variants={item}
          className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"
        >
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Batua stores everything locally. If you ever forget your password, a
          recovery token can be minted from the server and exchanged for a new
          one — see Settings → Account.
        </motion.p>
      </motion.div>
    </div>
  );
}
