import Link from "next/link";
import { cn } from "@/lib/utils";

// Primitivas de UI. Radio consistente: botones pill, tarjetas 16px, inputs 8px.

type ButtonProps = {
  href?: string;
  variant?: "primary" | "outline" | "ghost" | "accent";
  size?: "sm" | "md" | "lg";
  className?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all active:translate-y-px disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";

const buttonVariants = {
  primary: "bg-pine text-bone hover:bg-pine-deep",
  accent: "bg-amber-burnt text-white hover:brightness-110",
  outline: "border border-ink/20 text-ink hover:border-ink/50 bg-transparent",
  ghost: "text-ink/70 hover:text-ink hover:bg-ink/5",
};

const buttonSizes = {
  sm: "text-sm px-4 h-9",
  md: "text-sm px-6 h-11",
  lg: "text-base px-8 h-13 py-3.5",
};

export function Button({ href, variant = "primary", size = "md", className, children, ...rest }: ButtonProps) {
  const cls = cn(buttonBase, buttonVariants[variant], buttonSizes[size], className);
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-card bg-white border border-ink/8 shadow-sm", className)}>{children}</div>;
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "green" | "amber" | "red" | "blue";
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "bg-ink/5 text-ink/70",
    green: "bg-pine-mist text-pine-deep",
    amber: "bg-amber-soft text-amber-burnt",
    red: "bg-red-50 text-red-700",
    blue: "bg-sky-50 text-sky-800",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function Field({
  label,
  error,
  children,
  hint,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="font-medium text-ink">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-ink/50">{hint}</span>}
      {error && <span className="text-xs text-red-700">{error}</span>}
    </label>
  );
}

export const inputCls =
  "h-11 rounded-lg border border-ink/15 bg-white px-3.5 text-sm text-ink placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-pine/40 focus:border-pine/50 w-full";

export const textareaCls =
  "rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-pine/40 focus:border-pine/50 w-full min-h-24";

export function SectionTitle({
  title,
  intro,
  className,
}: {
  title: string;
  intro?: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", className)}>
      <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-ink">{title}</h2>
      {intro && <p className="mt-3 text-ink/60 leading-relaxed">{intro}</p>}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-dashed border-ink/15 bg-white/50 px-8 py-14 text-center">
      <p className="font-display text-lg font-semibold text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink/60">{body}</p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}
