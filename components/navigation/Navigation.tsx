"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { cn } from "@/lib/utils/cn";

import { NAV_ITEMS, PRIMARY_NAV, SECONDARY_NAV } from "./routes";

/**
 * Navigation.
 *
 * Desktop gets a persistent rail: nine destinations is too many for a
 * horizontal bar without crowding, and a rail keeps the labels readable and
 * the current page obvious. Mobile gets a bottom bar of four, which is the
 * documented ceiling before targets start being mis-tapped, with the rest
 * behind More.
 *
 * The current page is marked with `aria-current` and a solid indicator, never
 * by colour alone.
 */

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname.startsWith(href);

/* -------------------------------------------------------------------------- */

export function DesktopNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="hidden lg:block">
      <ul className="flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ href, label, Icon, description }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                title={description}
                className={cn(
                  "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-[--duration-fast]",
                  active
                    ? "bg-[--surface-active] font-medium text-primary"
                    : "text-secondary hover:bg-[--surface-hover] hover:text-primary",
                )}
              >
                {/* A solid bar, so the active state survives greyscale. */}
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-opacity",
                    active ? "opacity-100" : "opacity-0",
                  )}
                />
                <Icon className="size-4 shrink-0" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* -------------------------------------------------------------------------- */

export function MobileNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = SECONDARY_NAV.some((item) => isActive(pathname, item.href));

  return (
    <>
      <nav
        aria-label="Main"
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-panel lg:hidden",
          // Keeps the bar clear of the home indicator on modern phones.
          "pb-[env(safe-area-inset-bottom)]",
        )}
      >
        <ul className="grid grid-cols-5">
          {PRIMARY_NAV.map(({ href, label, Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] transition-colors",
                    active ? "font-medium text-primary" : "text-tertiary",
                  )}
                >
                  <span className="relative">
                    <Icon className="size-5" aria-hidden />
                    <span
                      aria-hidden
                      className={cn(
                        "absolute -bottom-1.5 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-primary transition-opacity",
                        active ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}

          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              className={cn(
                "flex min-h-14 w-full cursor-pointer flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] transition-colors",
                moreActive ? "font-medium text-primary" : "text-tertiary",
              )}
            >
              <span className="relative">
                <Menu className="size-5" aria-hidden />
                <span
                  aria-hidden
                  className={cn(
                    "absolute -bottom-1.5 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-primary transition-opacity",
                    moreActive ? "opacity-100" : "opacity-0",
                  )}
                />
              </span>
              More
            </button>
          </li>
        </ul>
      </nav>

      <Dialog.Root open={moreOpen} onOpenChange={setMoreOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgb(0_0_0/0.45)] lg:hidden" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-lg border-t border-strong bg-panel pb-[env(safe-area-inset-bottom)] lg:hidden">
            <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
              <Dialog.Title className="text-sm font-semibold">More</Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="flex size-10 cursor-pointer items-center justify-center rounded-md text-tertiary hover:bg-[--surface-hover] hover:text-primary"
                >
                  <X className="size-5" aria-hidden />
                </button>
              </Dialog.Close>
            </div>

            <ul className="p-2">
              {SECONDARY_NAV.map(({ href, label, Icon, description }) => (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setMoreOpen(false)}
                    aria-current={isActive(pathname, href) ? "page" : undefined}
                    className="flex min-h-14 items-center gap-3 rounded-md px-3 py-2.5 hover:bg-[--surface-hover]"
                  >
                    <Icon className="size-5 shrink-0 text-tertiary" aria-hidden />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">{label}</span>
                      <span className="text-xs text-tertiary">{description}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
