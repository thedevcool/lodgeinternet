import type { ReactNode } from "react";

/**
 * Re-mounts on every navigation, so each new screen rises in (iOS 27 push).
 * The nav bar and tab bar live in the layout, so they stay perfectly still.
 */
export default function ClientTemplate({ children }: { children: ReactNode }) {
  return <div className="ui-page-in">{children}</div>;
}
