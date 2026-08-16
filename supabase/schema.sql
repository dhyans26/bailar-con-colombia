create table if not exists salsa_leaderboard (
  id uuid primary key default gen_random_uuid(),
  player_name text not null check (char_length(player_name) between 1 and 40),
  score integer not null check (score >= 0),
  moves_played integer not null default 5,
  created_at timestamptz not null default now()
);

create index if not exists salsa_leaderboard_score_idx
  on salsa_leaderboard (score desc);

-- One row per player: a player's score is their best score, and a later lower
-- score cannot knock it down.
delete from salsa_leaderboard a
using salsa_leaderboard b
where a.player_name = b.player_name
  and (a.score < b.score or (a.score = b.score and a.id > b.id));

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'salsa_leaderboard_player_name_key'
  ) then
    alter table salsa_leaderboard
      add constraint salsa_leaderboard_player_name_key unique (player_name);
  end if;
end;
$$;

alter table salsa_leaderboard enable row level security;

create policy "public can read leaderboard"
  on salsa_leaderboard for select
  to anon
  using (true);

drop policy if exists "public can submit a score" on salsa_leaderboard;

create or replace function submit_score(
  p_player_name text,
  p_score integer,
  p_moves_played integer
)
returns salsa_leaderboard
language sql
security definer
set search_path = public
as $$
  insert into salsa_leaderboard (player_name, score, moves_played)
  values (p_player_name, p_score, p_moves_played)
  on conflict (player_name) do update
    set score = greatest(salsa_leaderboard.score, excluded.score)
  returning *;
$$;

grant execute on function submit_score(text, integer, integer) to anon;
