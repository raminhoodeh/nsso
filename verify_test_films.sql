-- Verify the 3 test films are in database
SELECT content FROM agent_knowledge 
WHERE metadata->>'source' = 'nsso Database - Film List.csv'
LIMIT 3;
