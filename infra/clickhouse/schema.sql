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
