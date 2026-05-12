-- Add DIVISION_HEAD and ASM roles to the Role enum.
-- Must be in its own migration because PostgreSQL forbids using a freshly-added
-- enum value in the same transaction in which it was added.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DIVISION_HEAD';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ASM';
