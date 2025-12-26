-- Delete corrupted Film List data
DELETE FROM agent_knowledge 
WHERE metadata->>'source' = 'nsso Database - Film List.csv';

-- Verify deletion
SELECT COUNT(*) as remaining_film_count 
FROM agent_knowledge 
WHERE metadata->>'source' = 'nsso Database - Film List.csv';
