-- Check what sources exist in the database
SELECT 
    metadata->>'source' as source,
    COUNT(*) as count
FROM agent_knowledge 
GROUP BY metadata->>'source'
ORDER BY count DESC
LIMIT 15;

-- Check total count in agent_knowledge
SELECT COUNT(*) as total_records FROM agent_knowledge;
