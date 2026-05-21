// Client-side mirror of Django's is_valid_ens_name(). Used for early form
// validation; the server remains the authoritative validator.
const ENS_NAME_RE = /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.eth$/;
const MAX_LENGTH = 253;

export function isValidEnsName(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length > MAX_LENGTH) return false;
  return ENS_NAME_RE.test(trimmed);
}

export function normalizeEnsName(value: string): string {
  return value.trim().toLowerCase();
}
