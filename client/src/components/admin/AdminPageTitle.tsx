import { Link } from "wouter";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type IconComponent = LucideIcon | React.ComponentType<{ className?: string }>;

type Props = {
  icon: IconComponent;
  href: string;
  children: React.ReactNode;
  className?: string;
  /** Open in a new tab; defaults to true when href is absolute http(s). */
  external?: boolean;
  "data-testid"?: string;
};

function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/** Page heading with icon — title navigates to the linked admin route or public site. */
export function AdminPageTitle({
  icon: Icon,
  href,
  children,
  className,
  external,
  "data-testid": testId,
}: Props) {
  const openExternal = external ?? isExternalHref(href);
  const headingClass = cn(
    "font-display font-semibold text-2xl md:text-3xl",
    className,
  );
  const linkClass =
    "inline-flex items-center gap-2 underline-offset-4 hover:text-primary hover:underline transition-colors group";

  const iconEl = (
    <Icon
      className="h-7 w-7 shrink-0 text-primary group-hover:text-primary"
      aria-hidden
    />
  );
  const label = <span>{children}</span>;

  if (openExternal) {
    return (
      <h1 className={headingClass} data-testid={testId}>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className={linkClass}
        >
          {iconEl}
          {label}
        </a>
      </h1>
    );
  }

  return (
    <h1 className={headingClass} data-testid={testId}>
      <Link href={href} className={linkClass}>
        {iconEl}
        {label}
      </Link>
    </h1>
  );
}
