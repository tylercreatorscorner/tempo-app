CREATE OR REPLACE FUNCTION public.get_retainer_as_of(p_ids integer[], p_as_of date)
 RETURNS TABLE(managed_creator_id integer, retainer numeric, is_exact boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with ranked as (
    select rh.creator_id, rh.new_retainer,
           row_number() over (partition by rh.creator_id
                              order by rh.effective_date desc, rh.id desc) as rn
    from public.retainer_history rh
    where rh.creator_id = any(p_ids) and rh.effective_date <= p_as_of
  ),
  earliest as (
    select rh.creator_id, rh.new_retainer,
           row_number() over (partition by rh.creator_id
                              order by rh.effective_date asc, rh.id asc) as rn
    from public.retainer_history rh
    where rh.creator_id = any(p_ids)
  )
  select ids.id,
         coalesce(a.new_retainer, e.new_retainer, 0)::numeric,
         (a.new_retainer is not null) as is_exact
  from unnest(p_ids) as ids(id)
  left join ranked   a on a.creator_id = ids.id and a.rn = 1
  left join earliest e on e.creator_id = ids.id and e.rn = 1;
$function$
