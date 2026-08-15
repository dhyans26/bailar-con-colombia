create table if not exists salsa_leaderboard (
  id uuid primary key default gen_random_uuid(),
  player_name text not null check (char_length(player_name) between 1 and 40),
  score integer not null check (score >= 0),
  moves_played integer not null default 5,
  created_at timestamptz not null default now()
);

create index if not exists salsa_leaderboard_score_idx
  on salsa_leaderboard (score desc);

alter table salsa_leaderboard enable row level security;

create policy "public can read leaderboard"
  on salsa_leaderboard for select
  to anon
  using (true);

create policy "public can submit a score"
  on salsa_leaderboard for insert
  to anon
  with check (true);
