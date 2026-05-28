import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------
const RegisterSchema = z.object({
  firstName:       z.string().min(1, "First name is required."),
  lastName:        z.string().min(1, "Last name is required."),
  email:           z.string().email("Please enter a valid email address."),
  password:        z.string().min(8, "Password must be at least 8 characters."),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});
type RegisterForm = z.infer<typeof RegisterSchema>;

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------
export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create Account — CareSync" },
      { name: "description", content: "Create your CareSync account to get started." },
    ],
  }),
  component: RegisterPage,
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
function RegisterPage() {
  const { signUp }  = useAuth();
  const navigate    = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterForm>({
    resolver: zodResolver(RegisterSchema),
  });

  const onSubmit = async (data: RegisterForm) => {
    setIsLoading(true);
    const { error } = await signUp({
      email:     data.email,
      password:  data.password,
      firstName: data.firstName,
      lastName:  data.lastName,
    });
    setIsLoading(false);

    if (error) {
      toast.error("Registration failed", {
        description: error.message ?? "Something went wrong. Please try again.",
      });
      return;
    }

    toast.success("Account created!", {
      description: "Welcome to CareSync. Let's set up your care circle.",
    });

    // Navigate to onboarding to create / join a care circle
    navigate({ to: "/onboarding" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src="/logo-icon.png" alt="CareSync" className="h-14 w-14 rounded-2xl object-cover" style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.25))" }} />
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
            <p className="mt-1 text-sm text-muted-foreground">Start coordinating care in minutes</p>
          </div>
        </div>

        {/* Form */}
        <form
          id="register-form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
          noValidate
        >
          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="register-first-name" className="text-sm font-medium">
                First name
              </label>
              <input
                id="register-first-name"
                type="text"
                autoComplete="given-name"
                placeholder="Jane"
                disabled={isLoading}
                {...register("firstName")}
                className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
              {errors.firstName && (
                <p className="text-xs text-destructive">{errors.firstName.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="register-last-name" className="text-sm font-medium">
                Last name
              </label>
              <input
                id="register-last-name"
                type="text"
                autoComplete="family-name"
                placeholder="Smith"
                disabled={isLoading}
                {...register("lastName")}
                className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
              {errors.lastName && (
                <p className="text-xs text-destructive">{errors.lastName.message}</p>
              )}
            </div>
          </div>

          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="register-email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="register-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              disabled={isLoading}
              {...register("email")}
              className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="register-password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="register-password"
              type="password"
              autoComplete="new-password"
              placeholder="Min. 8 characters"
              disabled={isLoading}
              {...register("password")}
              className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          {/* Confirm Password */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="register-confirm-password" className="text-sm font-medium">
              Confirm password
            </label>
            <input
              id="register-confirm-password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              disabled={isLoading}
              {...register("confirmPassword")}
              className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
            {errors.confirmPassword && (
              <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
            )}
          </div>

          {/* Submit */}
          <button
            id="register-submit"
            type="submit"
            disabled={isLoading}
            className="mt-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isLoading ? "Creating account…" : "Create account"}
          </button>
        </form>

        {/* Footer link */}
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>

        {/* Privacy + acceptance disclaimer */}
        <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground/70">
          By creating an account, you accept the terms of CareSync's{" "}
          <Link to="/privacy" className="underline-offset-2 hover:text-foreground hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
