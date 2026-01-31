-- Deleting legacy contact details to allow for fresh start with reordering feature
DELETE FROM contacts 
WHERE value IN ('troy@nsso.me', 'raminhoodeh@gmail.com');
