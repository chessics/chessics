CREATE UNIQUE INDEX IF NOT EXISTS sync_accounts_user_platform_name
  ON sync_accounts (user_id, platform, lower(username));

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES sync_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS games_account_id ON games (account_id);

WITH named AS (
  SELECT
    id,
    user_id,
    platform,
    btrim(substring(pgn FROM CASE WHEN user_color = 'white'
                                  THEN '\[White "([^"\]]+)"\]'
                                  ELSE '\[Black "([^"\]]+)"\]' END)) AS name
  FROM games
  WHERE platform IN ('chess_com', 'lichess') AND user_color IN ('white', 'black')
)
INSERT INTO sync_accounts (user_id, platform, username)
SELECT DISTINCT ON (user_id, platform, lower(name)) user_id, platform, name
FROM named
WHERE name IS NOT NULL AND name <> '' AND name <> '?'
ORDER BY user_id, platform, lower(name), name
ON CONFLICT DO NOTHING;

WITH named AS (
  SELECT
    id,
    user_id,
    platform,
    btrim(substring(pgn FROM CASE WHEN user_color = 'white'
                                  THEN '\[White "([^"\]]+)"\]'
                                  ELSE '\[Black "([^"\]]+)"\]' END)) AS name
  FROM games
  WHERE account_id IS NULL AND platform IN ('chess_com', 'lichess') AND user_color IN ('white', 'black')
)
UPDATE games g
SET account_id = s.id
FROM named n
JOIN sync_accounts s
  ON s.user_id = n.user_id AND s.platform = n.platform AND lower(s.username) = lower(n.name)
WHERE g.id = n.id AND g.account_id IS NULL;

GRANT SELECT, INSERT, DELETE ON sync_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON sync_accounts TO service_role;
