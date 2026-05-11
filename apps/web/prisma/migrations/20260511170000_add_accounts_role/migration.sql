-- Add ACCOUNTS role for accounts users (read-only across divisions).
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ACCOUNTS';

