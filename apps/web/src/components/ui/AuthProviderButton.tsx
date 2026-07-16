import type { JSX } from "react";
import { Mail } from "lucide-react";

export type AuthProviderKind = "apple" | "google" | "email";

export type AuthProviderButtonProps = {
  kind: AuthProviderKind;
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
};

export function AuthProviderButton({
  kind,
  label,
  onClick,
  loading = false,
  disabled = false,
}: AuthProviderButtonProps): JSX.Element {
  const isDisabled = disabled || loading;
  // The app sets html { font-size: 14px }, so rem-based Tailwind sizes do not
  // equal the brand geometry; keep these auth button dimensions in px.
  // Use an inset ring so the stroke does not shift layout, matching iOS strokeBorder.
  const classes = [
    "inline-flex h-[44px] w-full items-center rounded-[10px] transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
    kind === "email"
      ? "bg-accent-500 [background-image:var(--color-accent-gradient)] text-fg-on-accent shadow-glow-soft hover:brightness-105"
      : "bg-white inset-ring-1 inset-ring-[#747775]",
    kind === "apple" ? "pl-[8.25px]" : "pl-[16px]",
  ].join(" ");

  return (
    <button
      type="button"
      className={classes}
      onClick={onClick}
      disabled={isDisabled}
      aria-busy={loading ? "true" : undefined}
    >
      {loading ? (
        <span className="mx-auto size-[20px] animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      ) : (
        <>
          {kind === "apple" ? (
            <img src="/apple-logo-black.svg" alt="" className="h-[44px] w-[31px] shrink-0" />
          ) : null}
          {kind === "google" ? (
            <span className="flex h-[44px] w-[20px] shrink-0 items-center">
              <img src="/google-g.png" alt="" className="h-[20px] w-auto" />
            </span>
          ) : null}
          {kind === "email" ? (
            <span className="flex h-[44px] w-[20px] shrink-0 items-center">
              <Mail className="size-[20px]" aria-hidden="true" />
            </span>
          ) : null}
          <span
            className={[
              "truncate",
              kind === "apple" ? "ml-[8.75px] text-[17px] font-semibold text-black" : "",
              kind === "google" ? "ml-[12px] font-['Google_Sans',var(--font-sans)] text-[17px] font-medium leading-[22px] text-[#1F1F1F]" : "",
              kind === "email" ? "ml-[12px] text-[17px] font-semibold" : "",
            ].join(" ")}
          >
            {label}
          </span>
        </>
      )}
    </button>
  );
}
