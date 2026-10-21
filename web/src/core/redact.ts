// Removes secrets from any text before it is shown or stored. Licensed under GPL-3.0.

const PATTERNS = [
  /sk-ant-[A-Za-z0-9_\-]{8,}/g,
  /sk-[A-Za-z0-9_\-]{16,}/g,
  /AIza[0-9A-Za-z_\-]{20,}/g,
  /gsk_[A-Za-z0-9]{16,}/g,
  /Bearer\s+[A-Za-z0-9._\-]{8,}/gi,
];

export function redact(text: string, ...secrets: (string | undefined)[]): string {
  let out = text;
  for (const s of secrets) {
    if (s && s.length >= 6) out = out.split(s).join('[redacted]');
  }
  for (const p of PATTERNS) out = out.replace(p, '[redacted]');
  return out;
}
