-- Fixed public redirect capability. Affiliate tables and the legacy selector stay private.
-- No catalogue or affiliate records are inserted or changed.
begin;

create function public.saaselephant_software_outbound(p_software_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_software_id text;
  official_url text;
  outbound_url text;
  -- Conservative HTTPS DNS URLs without ports, userinfo, whitespace or backslashes.
  https_pattern constant text := '^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}([/?#][^[:space:]\\]*)?$';
begin
  perform pg_catalog.set_config('response.headers', '[{"Cache-Control":"no-store"},{"Referrer-Policy":"no-referrer"}]', true);
  perform pg_catalog.set_config('response.status', '404', true);
  if p_software_slug is null or length(p_software_slug) > 200
     or p_software_slug !~ '^[a-z0-9][a-z0-9-]*$' then
    return;
  end if;

  select s.software_id::text, s.website_url
  into requested_software_id, official_url
  from public.software as s
  where s.slug = p_software_slug and s.publication_status = 'published';
  if not found then return; end if;

  select link.destination_url
  into outbound_url
  from public.affiliate_links as link
  join public.affiliate_programs as program
    on program.affiliate_id = link.affiliate_program_id
    and program.software_id = link.software_id
  where link.software_id = requested_software_id
    and lower(btrim(program.status)) = 'active'
    and program.verification_status = 'verified'
    and program.verified_at is not null
    and program.verified_at <= now()
    and link.status = 'active'
    and link.verification_status = 'verified'
    and link.verified_at is not null
    and link.verified_at <= now()
    and (link.valid_from is null or link.valid_from <= now())
    and (link.valid_until is null or link.valid_until > now())
    and length(link.destination_url) <= 2048
    and link.destination_url ~* https_pattern
    and link.destination_url !~ '[[:cntrl:]]'
  order by link.priority desc, link.affiliate_link_id asc
  limit 1;

  if outbound_url is null then
    if length(official_url) <= 2048 and official_url ~* https_pattern
       and official_url !~ '[[:cntrl:]]' then
      outbound_url := official_url;
    else
      return;
    end if;
  end if;

  -- No scalar URL or raw row is returned. Even direct API callers receive a redirect,
  -- whose Location is necessarily visible when following an outbound link.
  perform pg_catalog.set_config('response.headers', pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('Location', outbound_url),
    pg_catalog.jsonb_build_object('Cache-Control', 'no-store'),
    pg_catalog.jsonb_build_object('Referrer-Policy', 'no-referrer')
  )::text, true);
  perform pg_catalog.set_config('response.status', '303', true);
end
$$;

revoke all on function public.saaselephant_software_outbound(text) from public, anon, authenticated;
-- Deliberate public redirect capability, not a table-read or destination-lookup grant.
grant execute on function public.saaselephant_software_outbound(text) to anon;

commit;
