-- Check Courses database content and count
SELECT 
    COUNT(*) as total_courses,
    COUNT(DISTINCT content) as unique_courses
FROM agent_knowledge 
WHERE metadata->>'source' = 'nsso Database - Courses.csv';

-- Sample 3 courses to verify data quality
SELECT content 
FROM agent_knowledge 
WHERE metadata->>'source' = 'nsso Database - Courses.csv'
LIMIT 3;
