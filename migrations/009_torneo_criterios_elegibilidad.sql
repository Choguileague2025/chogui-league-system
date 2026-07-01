ALTER TABLE torneos
    ADD COLUMN IF NOT EXISTS min_ab_rate_stats INTEGER,
    ADD COLUMN IF NOT EXISTS min_ab_counting_stats INTEGER,
    ADD COLUMN IF NOT EXISTS min_ab_mvp INTEGER,
    ADD COLUMN IF NOT EXISTS min_ip_rate_stats NUMERIC(6,1),
    ADD COLUMN IF NOT EXISTS min_ip_counting_stats NUMERIC(6,1),
    ADD COLUMN IF NOT EXISTS min_ip_pitcher_award NUMERIC(6,1),
    ADD COLUMN IF NOT EXISTS min_chances_defense INTEGER;
