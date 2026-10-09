-- Apply as a single production migration. Credential is provisioned separately.
create schema if not exists vivco_private;
revoke all on schema vivco_private from public, anon, authenticated;
create table vivco_private.intake_credentials (id boolean primary key default true check(id), token_hash text not null check(token_hash ~ '^[a-f0-9]{64}$'));
create table vivco_private.intake_receipts (request_id uuid primary key, lead_id uuid not null references public.leads(id) on delete cascade, payload_hash text not null, rate_key text not null, created_at timestamptz not null default now());
create index intake_receipts_rate_time on vivco_private.intake_receipts(rate_key, created_at);
create index intake_receipts_time on vivco_private.intake_receipts(created_at);
create table vivco_private.lead_delivery (lead_id uuid primary key references public.leads(id) on delete cascade, created_at timestamptz not null default now(), notion_page_url text, delivered_at timestamptz);
alter table vivco_private.intake_credentials enable row level security;
alter table vivco_private.intake_receipts enable row level security;
alter table vivco_private.lead_delivery enable row level security;
revoke all on all tables in schema vivco_private from public,anon,authenticated;
alter table public.leads alter column name set not null;
alter table public.leads alter column role set not null;
alter table public.leads alter column created_at set not null;
alter table public.leads add constraint leads_name_valid check(name = btrim(name) and length(name) between 1 and 200 and name !~ '^[[:space:]]*$');
alter table public.leads add constraint leads_email_valid check(length(email) between 3 and 254 and email = btrim(email) and email ~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$');
alter table public.leads add constraint leads_role_valid check(role in ('Brand','Manufacturer','Supplier','Logistics','Investor','Other'));
alter table public.leads add constraint leads_message_valid check(message is null or length(message)<=5000);
revoke all on public.leads from public,anon,authenticated;
drop policy if exists "public can insert leads" on public.leads;
-- A private, deliberately privileged operation authenticates the website server
-- using a scoped 256-bit credential. It cannot read/export arbitrary leads.
create function vivco_private.accept_inquiry(p_token text,p_request_id uuid,p_rate_key text,p_name text,p_email text,p_role text,p_message text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_hash text; v_existing vivco_private.intake_receipts%rowtype;
begin
 if p_token is null or length(p_token)<>64 or not exists(select 1 from vivco_private.intake_credentials where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')) then
   return jsonb_build_object('status',403);
 end if;
 if p_request_id is null or p_rate_key is null or p_rate_key !~ '^[a-f0-9]{64}$' or p_name is null or length(p_name) not between 1 and 200 or p_name<>btrim(p_name) or p_name ~ '^[[:space:]]*$' or p_email is null or length(p_email)>254 or p_email !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$' or p_role is null or p_role not in ('Brand','Manufacturer','Supplier','Logistics','Investor','Other') or p_message is null or length(p_message)>5000 then
   return jsonb_build_object('status',400);
 end if;
 v_hash:=encode(sha256(convert_to(jsonb_build_array(p_name,p_email,p_role,p_message)::text,'UTF8')),'hex');
 -- Serializes admission, deduplication, and counts in the same transaction.
 perform pg_advisory_xact_lock(817341920);
 select * into v_existing from vivco_private.intake_receipts where request_id=p_request_id;
 if found then
   if v_existing.payload_hash<>v_hash then return jsonb_build_object('status',409); end if;
   return jsonb_build_object('status',200,'duplicate',true);
 end if;
 if (select count(*) from vivco_private.intake_receipts where rate_key=p_rate_key and created_at>now()-interval '1 hour')>=5 or (select count(*) from vivco_private.intake_receipts where created_at>now()-interval '1 hour')>=100 then
   return jsonb_build_object('status',429);
 end if;
 insert into public.leads(name,email,role,message) values(p_name,p_email,p_role,p_message) returning id into v_id;
 insert into vivco_private.intake_receipts(request_id,lead_id,payload_hash,rate_key) values(p_request_id,v_id,v_hash,p_rate_key);
 insert into vivco_private.lead_delivery(lead_id) values(v_id);
 return jsonb_build_object('status',201);
end $$;
revoke all on function vivco_private.accept_inquiry(text,uuid,text,text,text,text,text) from public,anon,authenticated;
grant usage on schema vivco_private to anon;
grant execute on function vivco_private.accept_inquiry(text,uuid,text,text,text,text,text) to anon;
-- Only this invoker wrapper is in the API-exposed schema.
create function public.submit_inquiry(p_token text,p_request_id uuid,p_rate_key text,p_name text,p_email text,p_role text,p_message text) returns jsonb
language sql security invoker set search_path='' as $$ select vivco_private.accept_inquiry(p_token,p_request_id,p_rate_key,p_name,p_email,p_role,p_message); $$;
revoke all on function public.submit_inquiry(text,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_inquiry(text,uuid,text,text,text,text,text) to anon;
-- Queue existing inquiries so they can be reviewed too.
insert into vivco_private.lead_delivery(lead_id) select id from public.leads;
