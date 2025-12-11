-- Cleanup: Drop unused commission/earnings tables
-- (Previous migration dropped them, this confirms and handles any stragglers)
DROP TABLE IF EXISTS commissions CASCADE;
DROP TABLE IF EXISTS earnings_wallets CASCADE;
DROP TABLE IF EXISTS bank_accounts CASCADE;
DROP TABLE IF EXISTS withdrawal_requests CASCADE;
DROP TABLE IF EXISTS tds_records CASCADE;