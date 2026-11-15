import AdminChrome from "@/components/admin/AdminChrome";

/**
 * The admin console's frame: every page under /admin is drawn inside
 * AdminChrome (the sidebar, the top bar, the session keeper).
 *
 * Why `force-dynamic`: middleware.ts sends a script policy under which a
 * script runs only if it carries that request's nonce, and Next can stamp the
 * nonce only onto a page it renders for the request. The admin pages are all
 * client pages, so left alone they are built once at deploy time. Their
 * start-up scripts then had no nonce, the browser refused them, and the whole
 * console drew as a blank white page (found in production on 2026-11-15, a
 * day after the nonce policy went live). The customer pages need no such
 * line: app/(client)/layout.tsx reads the nonce with headers(), which already
 * makes them per-request. A new top-level folder beside (client) and admin
 * needs one or the other.
 */
export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminChrome>{children}</AdminChrome>;
}
