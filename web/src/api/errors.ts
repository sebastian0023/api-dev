export const UNREACHABLE = "Could not reach the API. Is it running on :3000?";

export function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "error" in err) {
    const inner = (err as { error?: { message?: string } }).error;
    if (inner?.message) return inner.message;
  }
  return "Something went wrong. Please try again.";
}
