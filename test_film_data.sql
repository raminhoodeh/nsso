-- Test if Film List data is in agent_knowledge table
SELECT COUNT(*) as film_count 
FROM agent_knowledge 
WHERE metadata->>'source' = 'nsso Database - Film List.csv';

-- Sample some film entries
SELECT content, metadata 
FROM agent_knowledge 
WHERE metadata->>'source' = 'nsso Database - Film List.csv'
LIMIT 5;