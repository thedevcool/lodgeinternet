/** Joins class names, skipping falsy values: cx("a", ok && "b") */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
