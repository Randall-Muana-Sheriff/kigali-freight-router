-- Role consolidation: the system now uses 3 roles (admin, dispatcher, driver).
-- 'manager' had no permission set distinct from dispatcher, and 'merchant'
-- had no client (web or mobile) ever built for it. Reassign any existing
-- accounts on those roles to 'dispatcher' rather than leaving them locked
-- out (their role string would otherwise fail every authMiddleware check).
UPDATE users SET role = 'dispatcher' WHERE role IN ('manager', 'merchant');
