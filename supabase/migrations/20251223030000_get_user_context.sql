-- Function to fetch comprehensive user context for the NSSO Agent
DROP FUNCTION IF EXISTS get_user_context(UUID);

CREATE OR REPLACE FUNCTION get_agent_context(user_uuid UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'profile', (
            SELECT json_build_object(
                'full_name', p.full_name,
                'headline', p.headline,
                'bio', p.bio
            )
            FROM profiles p
            WHERE p.user_id = user_uuid
        ),
        'experiences', (
            SELECT COALESCE(json_agg(json_build_object(
                'job_title', job_title,
                'company_name', company_name,
                'start_year', start_year,
                'end_year', end_year
            )), '[]'::json)
            FROM experiences WHERE user_id = user_uuid
        ),
        'projects', (
            SELECT COALESCE(json_agg(json_build_object(
                'project_name', project_name,
                'description', description,
                'contribution', contribution
            )), '[]'::json)
            FROM projects WHERE user_id = user_uuid
        ),
        'products', (
            SELECT COALESCE(json_agg(json_build_object(
                'name', name,
                'description', description,
                'price', price,
                'purchase_link', purchase_link
            )), '[]'::json)
            FROM products WHERE user_id = user_uuid
        ),
        'links', (
            SELECT COALESCE(json_agg(json_build_object(
                'link_name', link_name,
                'link_url', link_url
            )), '[]'::json)
            FROM links WHERE user_id = user_uuid
        ),
        'qualifications', (
            SELECT COALESCE(json_agg(json_build_object(
                'qualification_name', qualification_name,
                'institution', institution,
                'start_year', start_year,
                'end_year', end_year
            )), '[]'::json)
            FROM qualifications WHERE user_id = user_uuid
        ),
        'contacts', (
            SELECT COALESCE(json_agg(json_build_object(
                'method', method,
                'value', value,
                'custom_method_name', custom_method_name
            )), '[]'::json)
            FROM contacts WHERE user_id = user_uuid
        )
    ) INTO result;
    
    RETURN result;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_agent_context(UUID) TO authenticated;
