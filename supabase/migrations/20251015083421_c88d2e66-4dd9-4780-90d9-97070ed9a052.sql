-- Fix payments status constraint to allow 'completed'
ALTER TABLE payments 
DROP CONSTRAINT IF EXISTS payments_status_check;

ALTER TABLE payments 
ADD CONSTRAINT payments_status_check 
CHECK (status IN ('created', 'paid', 'failed', 'completed'));