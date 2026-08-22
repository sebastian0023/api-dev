// The auth feature's full public surface. To erase it: delete this folder
// and remove its one import line + usage from App.tsx. To replace it:
// swap LoginForm for a different UI (same 4 props), or swap useAuth for a
// different backend (same 6-field return shape) — the two halves don't
// depend on each other's internals.
export { useAuth, type UseAuthResult } from "./useAuth.js";
export { LoginForm, type LoginFormProps } from "./LoginForm.js";
