import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * The shared vocabulary.
 *
 * Deliberately small. The design carries its identity through typography,
 * the data colour scales and the ribbon, so the furniture around them stays
 * quiet: a hairline, one background step, four-pixel corners, and no shadows
 * anywhere.
 */

/* -------------------------------------------------------------------------- */

const panel = cva("border border-hairline", {
  variants: {
    surface: {
      panel: "bg-panel",
      raised: "bg-raised",
      sunken: "bg-sunken",
      // For regions that should read as part of the page, not a card.
      bare: "bg-transparent",
    },
    radius: { none: "rounded-none", sm: "rounded-sm", md: "rounded-md" },
  },
  defaultVariants: { surface: "panel", radius: "md" },
});

export interface PanelProps
  extends React.ComponentPropsWithoutRef<"section">,
    VariantProps<typeof panel> {
  asChild?: boolean;
}

export function Panel({ className, surface, radius, asChild, ...props }: PanelProps) {
  const Component = asChild ? Slot : "section";
  return <Component className={cn(panel({ surface, radius }), className)} {...props} />;
}

/* -------------------------------------------------------------------------- */

const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors duration-[--duration-fast] disabled:pointer-events-none disabled:opacity-45 cursor-pointer select-none",
  {
    variants: {
      variant: {
        // Maximum contrast, because interaction is signalled by contrast here.
        solid: "bg-primary text-inverse hover:opacity-90",
        outline: "border border-strong bg-transparent hover:bg-[--surface-hover]",
        ghost: "bg-transparent hover:bg-[--surface-hover]",
      },
      size: {
        // Never below the 44px comfortable touch target on the mobile paths.
        sm: "h-8 px-2.5 text-xs",
        md: "h-10 px-3.5 text-sm",
        lg: "h-11 px-5 text-sm",
      },
    },
    defaultVariants: { variant: "ghost", size: "md" },
  },
);

export interface ButtonProps
  extends React.ComponentPropsWithoutRef<"button">,
    VariantProps<typeof button> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return <Component className={cn(button({ variant, size }), className)} {...props} />;
}

/**
 * A square control carrying only an icon. The label is required rather than
 * optional — an icon-only button with no accessible name is unusable with a
 * screen reader, and it is the easiest thing in an interface to forget.
 */
export interface IconButtonProps extends React.ComponentPropsWithoutRef<"button"> {
  label: string;
  size?: "sm" | "md";
}

export function IconButton({
  label,
  className,
  size = "md",
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md text-secondary transition-colors duration-[--duration-fast] hover:bg-[--surface-hover] hover:text-primary disabled:pointer-events-none disabled:opacity-45",
        size === "sm" ? "size-8" : "size-10",
        className,
      )}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------------- */

/** An uppercase micro label. Used for every field name in the product. */
export function Label({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"span">) {
  return <span className={cn("label-micro", className)} {...props} />;
}

/** Section heading with an optional trailing control. */
export function SectionHeading({
  title,
  detail,
  action,
  className,
  id,
}: {
  title: string;
  detail?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", className)}>
      <div className="flex items-baseline gap-3">
        <h2 id={id} className="text-sm font-semibold tracking-tight">
          {title}
        </h2>
        {detail ? <span className="text-xs text-tertiary">{detail}</span> : null}
      </div>
      {action}
    </div>
  );
}

/**
 * A single measurement. The value is set in the expanded gauge face and the
 * unit stays at normal width beside it, so a column of these aligns on the
 * digits rather than drifting with the unit lengths.
 */
export function Metric({
  label,
  value,
  unit,
  detail,
  className,
  size = "md",
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  detail?: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const valueSize =
    size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-xl";

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label>{label}</Label>
      <p className="flex items-baseline gap-1">
        <span className={cn("readout", valueSize)}>{value}</span>
        {unit ? <span className="text-xs text-tertiary">{unit}</span> : null}
      </p>
      {detail ? (
        <p className="text-xs leading-snug text-tertiary">{detail}</p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Loading placeholder. Sized by the caller so it reserves the exact space the
 * real content will take — a skeleton that changes the layout when it resolves
 * is worse than no skeleton at all.
 */
export function Skeleton({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-sm bg-[--surface-hover] motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Shown in place of a panel's contents when its data source failed. Names the
 * subsystem, never the underlying error.
 */
export function Unavailable({
  title,
  message,
  action,
  className,
}: {
  title: string;
  message: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-start gap-2 p-4", className)}>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-prose text-xs leading-relaxed text-tertiary">{message}</p>
      {action}
    </div>
  );
}

/**
 * A key–value row for dense detail lists. Uses a description list so the
 * relationship survives a screen reader, which a pair of divs would not.
 */
export function DetailRow({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1.5", className)}>
      <dt className="text-xs text-tertiary">{label}</dt>
      <dd className="measured text-xs text-primary">{value}</dd>
    </div>
  );
}
