-- Link original private Drive contracts without copying files or changing Drive access.
alter table public.agency_contracts
  alter column storage_path drop not null,
  add column source_url text,
  add constraint agency_contracts_source_exclusive
    check ((storage_path is not null) <> (source_url is not null)),
  add constraint agency_contracts_drive_source_url
    check (source_url is null or (
      source_url ~ '^https://drive[.]google[.]com/file/d/[A-Za-z0-9_-]{10,200}/view$'
      and source_url !~ '[[:space:]]'
    ));

comment on column public.agency_contracts.source_url is
  'Original Google Drive file reference. Access remains governed by Google Drive; Tempo does not fetch or share the document.';
