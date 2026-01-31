-- Wipe ALL contacts for specific users to allow for a fresh start
-- This deletes every contact row (email, phone, etc.) for the users with the specified emails.

DELETE FROM contacts 
WHERE user_id IN (
    SELECT id FROM users 
    WHERE email IN ('troy@nsso.me', 'raminhoodeh@gmail.com', 'troycookecareer@gmail.com')
);
