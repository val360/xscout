-- Ticker list catalog. Lists exist independently of any canvas placement;
-- the React Flow canvas (kept in localStorage) holds only references to
-- list ids via its node objects.
CREATE TABLE IF NOT EXISTS ticker_lists (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT  NOT NULL,
    tickers    TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticker_lists_updated_at_idx
    ON ticker_lists (updated_at DESC);
