-- Verify Film List data was ingested correctly (not corrupted)
SELECT content, metadata 
FROM agent_knowledge 
WHERE metadata->>'source' = 'nsso Database - Film List.csv'
ORDER BY id DESC
LIMIT 5;

-- Check total count
SELECT COUNT(*) as clean_film_count
FROM agent_knowledge 
WHERE metadata->>'source' = 'nsso Database - Film List.csv';
