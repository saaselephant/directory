/** Validate links for display only. Never resolves or fetches the destination. */
export function safeReviewUrl(value: string | null): string | null {
  if (!value || value.length > 2048 || /[\s\\\u0000-\u001f\u007f]/.test(value)) return null;
  if (!/^https:\/\/[^/?#]+/i.test(value) || /^https:\/\/[^/?#]*@/i.test(value)) return null;
  try {
    const url = new URL(value);
    const labels = url.hostname.split(".");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hostname.length > 253 ||
      labels.length < 2 ||
      !labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)) ||
      !/^[a-z]{2,63}$/i.test(labels.at(-1) ?? "")
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
