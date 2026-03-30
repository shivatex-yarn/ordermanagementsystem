-- Speed up order listing: date-ordered scans for role-scoped filters
CREATE INDEX "Order_createdAt_idx" ON "Order" ("createdAt" DESC);
CREATE INDEX "Order_createdById_createdAt_idx" ON "Order" ("created_by_id", "createdAt" DESC);
CREATE INDEX "Order_currentDivisionId_createdAt_idx" ON "Order" ("current_division_id", "createdAt" DESC);
