import { cn } from "@/lib/utils";

interface GlassHeaderProps {
  className?: string;
  children?: React.ReactNode;
}

export function GlassHeader({ className, children }: GlassHeaderProps) {
  return (
    <header
      className={cn(
        "glass-header fixed top-0 left-0 right-0 z-50 flex h-16 items-center px-6",
        className,
      )}
    >
      {children ?? (
        <div className="flex items-center gap-3">
          <img
            src="/logo.svg"
            alt="Declare"
            className="h-6 w-6 object-contain"
          />
          <span className="font-display font-semibold text-lg tracking-tight">
            Declare
          </span>
        </div>
      )}
    </header>
  );
}
