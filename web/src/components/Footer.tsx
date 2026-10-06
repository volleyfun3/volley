import { BRAND } from "@/lib/config";
import { Logo } from "./Header";
import { Socials } from "./Socials";

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-6 sm:px-6">
        <Logo className="h-[14px] w-[28px]" />
        <span className="text-sm text-muted">
          © {new Date().getFullYear()} {BRAND}
        </span>
        <Socials className="ml-auto" />
      </div>
    </footer>
  );
}
