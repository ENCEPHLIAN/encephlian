-- Remove hardcoded user_role seed from old Lovable project (UUID no longer exists)
DELETE FROM user_roles WHERE user_id = 'f1b8a438-7229-4873-b1dc-d1803be5db62';
