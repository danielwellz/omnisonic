import csv
import io
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Sequence

import duckdb
import feedparser
import httpx
from fastapi import Body, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, AnyHttpUrl

ISRC_PATTERN = re.compile(r"^[A-Z]{2}[A-Z0-9]{3}\d{2}\d{5}$")

from .config import get_settings
from .tagging import (
    EmbeddingClient,
    TaggingConfig,
    TaggingStoplist,
    get_embedding_client,
    match_entities
)

logger = logging.getLogger("ingest")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Omnisonic Ingest Service")

_embedding_client: Optional[EmbeddingClient] = None


def ensure_embedding_client(force: bool = False) -> Optional[EmbeddingClient]:
    """Lazy load the embedding client when requested."""
    global _embedding_client
    if not force:
        settings = get_settings()
        force = settings.tagging_use_embeddings

    if not force:
        return _embedding_client if _embedding_client and _embedding_client.enabled else None

    settings = get_settings()
    client = get_embedding_client(
        model_name=settings.tagging_embeddings_model,
        cache_ttl=settings.tagging_embedding_cache_ttl,
        redis_url=str(settings.redis_url) if settings.redis_url else None
    )
    _embedding_client = client
    return client if client.enabled else None


def build_tagging_config(
    *,
    artists: Sequence[str],
    works: Sequence[str],
    recordings: Sequence[str],
    stoplist_artists: Sequence[str],
    stoplist_works: Sequence[str],
    stoplist_recordings: Sequence[str],
    fuzzy_threshold: Optional[int],
    embedding_threshold: Optional[float],
    use_embeddings: Optional[bool]
) -> TaggingConfig:
    settings = get_settings()
    return TaggingConfig(
        artists=artists,
        works=works,
        recordings=recordings,
        stoplist=TaggingStoplist(
            artists=stoplist_artists or [],
            works=stoplist_works or [],
            recordings=stoplist_recordings or []
        ),
        fuzzy_threshold=fuzzy_threshold or settings.tagging_fuzzy_threshold,
        embedding_threshold=embedding_threshold or settings.tagging_embedding_threshold,
        use_embeddings=use_embeddings if use_embeddings is not None else settings.tagging_use_embeddings,
    )


def news_item_id_for(url: str) -> str:
    normalized = (url or "").strip()
    if not normalized:
        return str(uuid.uuid4())
    return str(uuid.uuid5(uuid.NAMESPACE_URL, normalized))


ENTITY_TAG_MUTATION = """
  mutation RecordEntityTags($input: EntityTagBatchInput!) {
    recordEntityTags(input: $input) { id }
  }
"""


async def record_entity_tags(
    client: httpx.AsyncClient,
    base_url: str,
    news_item_id: str,
    tags: List[Dict[str, object]]
) -> bool:
    try:
        response = await client.post(
            f"{base_url}/graphql",
            json={
                "query": ENTITY_TAG_MUTATION,
                "variables": {
                    "input": {
                        "newsItemId": news_item_id,
                        "tags": tags
                    }
                }
            },
            timeout=15.0
        )
        response.raise_for_status()
        payload = response.json()
        if "errors" in payload:
            logger.warning("Graph API errors while recording tags for %s: %s", news_item_id, payload["errors"])
            return False
        return True
    except httpx.HTTPError as exc:
        logger.warning("Failed to record entity tags for %s: %s", news_item_id, exc)
        return False


def build_tag_payload(result: Dict[str, object]) -> List[Dict[str, object]]:
    tags: List[Dict[str, object]] = []
    for entity_type in ("artist", "work", "recording"):
        value = result.get(entity_type)
        if not value:
            continue
        confidence = float(result.get("confidence", {}).get(entity_type, 0.0) or 0.0)
        tags.append(
            {
                "entityType": entity_type,
                "entityId": value,
                "confidence": max(0.0, min(confidence, 1.0)),
                "method": result.get("methods", {}).get(entity_type) or "heuristic",
                "matchedText": result.get("matched_text", {}).get(entity_type)
            }
        )
    return tags

class RawTrack(BaseModel):
    isrc: str
    title: str
    artist: str

class IngestResponse(BaseModel):
    processed: int = Field(..., ge=0)
    accepted: int = Field(..., ge=0)
    rejected: int = Field(..., ge=0)
    errors: List[str] = Field(default_factory=list)


class RssIngestRequest(BaseModel):
    urls: List[AnyHttpUrl]
    limit_per_feed: Optional[int] = Field(default=50, ge=1, le=500)
    artists: Sequence[str] = Field(default_factory=list)
    works: Sequence[str] = Field(default_factory=list)
    recordings: Sequence[str] = Field(default_factory=list)
    stoplist_artists: Sequence[str] = Field(default_factory=list)
    stoplist_works: Sequence[str] = Field(default_factory=list)
    stoplist_recordings: Sequence[str] = Field(default_factory=list)
    fuzzy_threshold: Optional[int] = Field(default=None, ge=1, le=100)
    embedding_threshold: Optional[float] = Field(default=None, ge=0, le=1)
    use_embeddings: Optional[bool] = None


class RssTaggedItem(BaseModel):
    news_item_id: str
    url: str
    artist: Optional[str]
    work: Optional[str]
    recording: Optional[str]
    confidence: Dict[str, float]
    methods: Dict[str, Optional[str]]
    matched_text: Dict[str, Optional[str]]


class RssFeedSummary(BaseModel):
    url: AnyHttpUrl
    source: str
    processed: int
    inserted: int
    skipped: int
    tagged: List[RssTaggedItem] = Field(default_factory=list)


class RssIngestResponse(BaseModel):
    feeds: List[RssFeedSummary]
    total_processed: int
    total_inserted: int


class TaggingImproveRequest(BaseModel):
    limit: int = Field(default=100, ge=1, le=1000)
    source: Optional[str] = None
    urls: Sequence[AnyHttpUrl] = Field(default_factory=list)
    since: Optional[datetime] = None
    artists: Sequence[str] = Field(default_factory=list)
    works: Sequence[str] = Field(default_factory=list)
    recordings: Sequence[str] = Field(default_factory=list)
    stoplist_artists: Sequence[str] = Field(default_factory=list)
    stoplist_works: Sequence[str] = Field(default_factory=list)
    stoplist_recordings: Sequence[str] = Field(default_factory=list)
    fuzzy_threshold: Optional[int] = Field(default=None, ge=1, le=100)
    embedding_threshold: Optional[float] = Field(default=None, ge=0, le=1)
    use_embeddings: Optional[bool] = None


class TaggingImproveResponse(BaseModel):
    retagged: int
    updated: int
    failures: int
    items: List[RssTaggedItem]

async def upsert_recording(client: httpx.AsyncClient, base_url: str, track: RawTrack) -> bool:
    try:
        response = await client.post(
            f"{base_url}/graphql",
            json={
                "query": """
                  mutation UpsertRecording($input: RecordingUpsertInput!) {
                    upsertRecording(input: $input) {
                      id
                      isrc
                    }
                  }
                """,
                "variables": {
                    "input": {
                        "isrc": track.isrc,
                        "title": track.title,
                        "primaryArtist": track.artist
                    }
                }
            },
            timeout=15.0,
        )
        response.raise_for_status()
        data = response.json()
        if "errors" in data:
            logger.warning("Graph API errors for %s: %s", track.isrc, data["errors"])
            return False
        return bool(data.get("data", {}).get("upsertRecording"))
    except httpx.HTTPError as exc:
        logger.warning("Failed to upsert recording %s: %s", track.isrc, exc)
        return False

async def ingest_tracks(tracks: List[RawTrack]) -> IngestResponse:
    settings = get_settings()
    processed = len(tracks)
    accepted = 0
    rejected = 0
    errors: List[str] = []

    async with httpx.AsyncClient() as client:
        for track in tracks:
            candidate_isrc = track.isrc.upper().replace("-", "")
            if not ISRC_PATTERN.fullmatch(candidate_isrc):
                rejected += 1
                errors.append(track.isrc)
                continue
            normalized = RawTrack(
                isrc=candidate_isrc,
                title=track.title.strip(),
                artist=track.artist.strip()
            )
            success = await upsert_recording(client, settings.graph_api_base, normalized)
            if success:
                accepted += 1
            else:
                rejected += 1
                errors.append(normalized.isrc)

    return IngestResponse(processed=processed, accepted=accepted, rejected=rejected, errors=errors)

@app.post("/ingest/isrc", response_model=IngestResponse)
async def ingest_isrc(
    tracks: List[RawTrack] | None = Body(default=None),
    file: UploadFile | None = File(default=None),
    payload: str | None = Form(default=None)
):
    records: List[RawTrack] = []

    if tracks:
        records.extend(tracks)

    if file:
        contents = await file.read()
        reader = csv.DictReader(io.StringIO(contents.decode("utf-8")))
        for row in reader:
            if not row.get("isrc") or not row.get("title") or not row.get("artist"):
                continue
            records.append(RawTrack(isrc=row["isrc"], title=row["title"], artist=row["artist"]))

    if payload:
        reader = csv.DictReader(io.StringIO(payload))
        for row in reader:
            if not row.get("isrc") or not row.get("title") or not row.get("artist"):
                continue
            records.append(RawTrack(isrc=row["isrc"], title=row["title"], artist=row["artist"]))

    if not records:
        raise HTTPException(status_code=400, detail="No ingested records")

    result = await ingest_tracks(records)
    return JSONResponse(status_code=202, content=result.model_dump())


def _ensure_duckdb_schema(conn: duckdb.DuckDBPyConnection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS rss_items (
            source TEXT,
            title TEXT,
            url TEXT PRIMARY KEY,
            published_at TIMESTAMP
        )
        """
    )


def _to_iso_time(struct_time) -> Optional[str]:
    if struct_time is None:
        return None
    try:
        dt = datetime(*(struct_time[:6]), tzinfo=timezone.utc)
        return dt.isoformat()
    except Exception:  # pragma: no cover - defensive
        return None


async def _fetch_feed(client: httpx.AsyncClient, url: str) -> feedparser.FeedParserDict:
    response = await client.get(url, timeout=15.0)
    response.raise_for_status()
    return feedparser.parse(response.text)


def _normalize_entry(feed, entry) -> Optional[dict]:
    title = entry.get("title", "").strip()
    link = entry.get("link", "").strip()
    if not title or not link:
        return None

    published = entry.get("published_parsed") or entry.get("updated_parsed")
    published_at = _to_iso_time(published)
    source = feed.feed.get("title") if feed.get("feed") else None
    source = (source or feed.get("href") or "Unknown").strip()

    return {
        "source": source,
        "title": title,
        "url": link,
        "published_at": published_at,
    }


@app.post("/ingest/rss", response_model=RssIngestResponse)
async def ingest_rss(request: RssIngestRequest) -> RssIngestResponse:
    if not request.urls:
        raise HTTPException(status_code=400, detail="No feed URLs provided")

    settings = get_settings()
    os.makedirs(os.path.dirname(settings.duckdb_path) or ".", exist_ok=True)

    async with httpx.AsyncClient() as client:
        summaries: List[RssFeedSummary] = []
        total_processed = 0
        total_inserted = 0

        conn = duckdb.connect(settings.duckdb_path)
        try:
            _ensure_duckdb_schema(conn)
            tagging_config = build_tagging_config(
                artists=request.artists,
                works=request.works,
                recordings=request.recordings,
                stoplist_artists=request.stoplist_artists,
                stoplist_works=request.stoplist_works,
                stoplist_recordings=request.stoplist_recordings,
                fuzzy_threshold=request.fuzzy_threshold,
                embedding_threshold=request.embedding_threshold,
                use_embeddings=request.use_embeddings,
            )
            embedding_client = ensure_embedding_client(force=tagging_config.use_embeddings)
            for url in request.urls:
                try:
                    feed = await _fetch_feed(client, str(url))
                except httpx.HTTPError as exc:
                    logger.warning("Failed to fetch RSS feed %s: %s", url, exc)
                    summaries.append(
                        RssFeedSummary(url=url, source="Fetch error", processed=0, inserted=0, skipped=0)
                    )
                    continue

                entries = feed.entries[: request.limit_per_feed or 50]
                processed = 0
                inserted = 0
                tagged_items: List[RssTaggedItem] = []

                for entry in entries:
                    processed += 1
                    normalized = _normalize_entry(feed, entry)
                    if not normalized:
                        continue

                    conn.execute(
                        """
                        INSERT OR REPLACE INTO rss_items (source, title, url, published_at)
                        VALUES (?, ?, ?, ?)
                        """,
                        [
                            normalized["source"],
                            normalized["title"],
                            normalized["url"],
                            normalized["published_at"],
                        ],
                    )
                    inserted += 1
                    tag_result = match_entities(
                        title=normalized["title"],
                        description=entry.get("summary"),
                        config=tagging_config,
                        embedding_client=embedding_client,
                    )
                    news_item_id = news_item_id_for(normalized["url"])
                    tag_payload = build_tag_payload(tag_result)
                    await record_entity_tags(
                        client,
                        settings.graph_api_base,
                        news_item_id,
                        tag_payload,
                    )
                    tagged_items.append(
                        RssTaggedItem(
                            news_item_id=news_item_id,
                            url=normalized["url"],
                            artist=tag_result["artist"],
                            work=tag_result["work"],
                            recording=tag_result["recording"],
                            confidence={k: round(float(v or 0), 4) for k, v in tag_result.get("confidence", {}).items()},
                            methods={
                                key: tag_result.get("methods", {}).get(key)
                                for key in ("artist", "work", "recording")
                            },
                            matched_text={
                                key: tag_result.get("matched_text", {}).get(key)
                                for key in ("artist", "work", "recording")
                            },
                        )
                    )

                summaries.append(
                    RssFeedSummary(
                        url=url,
                        source=feed.feed.get("title", "Unknown Source") if feed.get("feed") else "Unknown",
                        processed=processed,
                        inserted=inserted,
                        skipped=processed - inserted,
                        tagged=tagged_items,
                    )
                )
                total_processed += processed
                total_inserted += inserted
        finally:
            conn.close()

    return RssIngestResponse(
        feeds=summaries,
        total_processed=total_processed,
        total_inserted=total_inserted,
    )

def run() -> None:
    import uvicorn

    uvicorn.run("ingest.main:app", host="0.0.0.0", port=8100, reload=True)


@app.post("/ingest/tagging/improve", response_model=TaggingImproveResponse)
async def improve_tagging(request: TaggingImproveRequest) -> TaggingImproveResponse:
    settings = get_settings()
    os.makedirs(os.path.dirname(settings.duckdb_path) or ".", exist_ok=True)
    conn = duckdb.connect(settings.duckdb_path)
    try:
        _ensure_duckdb_schema(conn)
        query = "SELECT source, title, url, published_at FROM rss_items"
        clauses: List[str] = []
        params: List[object] = []
        if request.source:
            clauses.append("source = ?")
            params.append(request.source)
        if request.urls:
            placeholders = ",".join(["?"] * len(request.urls))
            clauses.append(f"url IN ({placeholders})")
            params.extend([str(url) for url in request.urls])
        if request.since:
            clauses.append("published_at >= ?")
            params.append(request.since)
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
        query += " ORDER BY published_at DESC NULLS LAST LIMIT ?"
        params.append(request.limit)
        rows = conn.execute(query, params).fetchall()
    finally:
        conn.close()

    tagging_config = build_tagging_config(
        artists=request.artists,
        works=request.works,
        recordings=request.recordings,
        stoplist_artists=request.stoplist_artists,
        stoplist_works=request.stoplist_works,
        stoplist_recordings=request.stoplist_recordings,
        fuzzy_threshold=request.fuzzy_threshold,
        embedding_threshold=request.embedding_threshold,
        use_embeddings=request.use_embeddings,
    )
    embedding_client = ensure_embedding_client(force=tagging_config.use_embeddings)

    retagged_items: List[RssTaggedItem] = []
    updated = 0
    failures = 0

    if not rows:
        return TaggingImproveResponse(retagged=0, updated=0, failures=0, items=[])

    async with httpx.AsyncClient() as client:
        for _source, title, url_value, _ in rows:
            tag_result = match_entities(
                title=title or "",
                description=None,
                config=tagging_config,
                embedding_client=embedding_client,
            )
            news_item_id = news_item_id_for(url_value)
            payload = build_tag_payload(tag_result)
            success = await record_entity_tags(client, settings.graph_api_base, news_item_id, payload)
            if success:
                updated += 1
            else:
                failures += 1
            retagged_items.append(
                RssTaggedItem(
                    news_item_id=news_item_id,
                    url=url_value,
                    artist=tag_result["artist"],
                    work=tag_result["work"],
                    recording=tag_result["recording"],
                    confidence={k: round(float(v or 0), 4) for k, v in tag_result.get("confidence", {}).items()},
                    methods={
                        key: tag_result.get("methods", {}).get(key)
                        for key in ("artist", "work", "recording")
                    },
                    matched_text={
                        key: tag_result.get("matched_text", {}).get(key)
                        for key in ("artist", "work", "recording")
                    },
                )
            )

    return TaggingImproveResponse(retagged=len(rows), updated=updated, failures=failures, items=retagged_items)
