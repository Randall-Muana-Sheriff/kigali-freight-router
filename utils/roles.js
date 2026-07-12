// Canonical list of account roles. Keep this as the single source of truth —
// controllers/routes that validate or restrict by role should import from
// here instead of hardcoding their own copy of this list.
//
// Consolidated to 3 roles (2026-07-11): 'manager' and 'merchant' were removed
// — manager had no permission set distinct from dispatcher, and merchant had
// no client (web or mobile) ever built for it. Existing accounts with those
// roles are reassigned to 'dispatcher' by migrations/consolidate_roles.sql.
export const ALLOWED_ROLES = ['admin', 'dispatcher', 'driver'];
