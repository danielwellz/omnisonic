CREATE TABLE IF NOT EXISTS insight.news_items (
    id UUID DEFAULT generateUUIDv4(),
    source String,
    title String,
    url String,
    published_at DateTime,
    tags Array(String),
    ingested_at DateTime DEFAULT now()
) ENGINE = MergeTree
ORDER BY (source, published_at);

CREATE TABLE IF NOT EXISTS insight.entity_links (
    id UUID DEFAULT generateUUIDv4(),
    news_id UUID,
    entity_type Enum8('artist' = 1, 'work' = 2, 'recording' = 3),
    entity_id String,
    confidence Float32,
    linked_at DateTime DEFAULT now()
) ENGINE = MergeTree
ORDER BY (entity_type, entity_id, linked_at);

CREATE VIEW IF NOT EXISTS insight.news_items_last7 AS
SELECT
    source,
    count() AS total_items,
    uniqExact(arrayJoin(tags)) AS unique_tags,
    min(published_at) AS first_published,
    max(published_at) AS last_published
FROM insight.news_items
WHERE published_at >= now() - INTERVAL 7 DAY
GROUP BY source
ORDER BY total_items DESC;

CREATE VIEW IF NOT EXISTS insight.entity_mentions_timeseries AS
SELECT
    entity_type,
    entity_id,
    toStartOfDay(linked_at) AS day,
    count() AS mentions,
    avg(confidence) AS avg_confidence
FROM insight.entity_links
GROUP BY entity_type, entity_id, day
ORDER BY day DESC;

CREATE VIEW IF NOT EXISTS insight.genre_trends AS
SELECT
    genre,
    day,
    count(*) AS mentions,
    uniqExact(source) AS unique_sources
FROM (
    SELECT
        arrayJoin(tags) AS genre,
        source,
        toStartOfDay(published_at) AS day
    FROM insight.news_items
)
WHERE genre != ''
GROUP BY genre, day
ORDER BY day DESC;

CREATE VIEW IF NOT EXISTS insight.source_performance AS
SELECT
    base.source,
    base.total_items,
    tags.unique_tags,
    base.first_seen,
    base.last_seen
FROM (
    SELECT
        source,
        count() AS total_items,
        min(published_at) AS first_seen,
        max(published_at) AS last_seen
    FROM insight.news_items
    GROUP BY source
) AS base
LEFT JOIN (
    SELECT
        source,
        uniqExact(tag) AS unique_tags
    FROM insight.news_items
    ARRAY JOIN tags AS tag
    GROUP BY source
) AS tags USING (source)
ORDER BY base.total_items DESC;
