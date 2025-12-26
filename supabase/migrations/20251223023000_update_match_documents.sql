-- Update match_documents to support file filtering
create or replace function match_documents (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_files text[] default null
) returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
) language plpgsql stable as $$
begin
  return query
  select
    agent_knowledge.id,
    agent_knowledge.content,
    agent_knowledge.metadata,
    1 - (agent_knowledge.embedding <=> query_embedding) as similarity
  from agent_knowledge
  where 1 - (agent_knowledge.embedding <=> query_embedding) > match_threshold
  and (
    filter_files is null 
    or 
    (metadata->>'source') = any(filter_files)
  )
  order by agent_knowledge.embedding <=> query_embedding
  limit match_count;
end;
$$;
