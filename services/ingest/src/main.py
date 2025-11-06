import csv
import io
import logging
import os
import re
from datetime import datetime, timezone
from typing import List, Optional, Sequence

import duckdb
import feedparser
import httpx
from fastapi import Body, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, AnyHttpUrl

ISRC_PATTERN = re.compile(r"^[A-Z]{2}[A-Z0-9]{3}\d{2}\d{5}$")

from .config import get_settings
from .tagging import TaggingConfig, TaggingStoplist, match_entities

logger = logging.getLogger("ingest")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Omnisonic Ingest Service")

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


class RssTaggedItem(BaseModel):
    url: str
    artist: Optional[str]
    work: Optional[str]
    recording: Optional[str]
    confidence: dict


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
            tagging_config = TaggingConfig(
                artists=request.artists,
                works=request.works,
                recordings=request.recordings,
                stoplist=TaggingStoplist(
                    artists=request.stoplist_artists,
                    works=request.stoplist_works,
                    recordings=request.stoplist_recordings,
                ),
            )
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
                    )
                    tagged_items.append(
                        RssTaggedItem(
                            url=normalized["url"],
                            artist=tag_result["artist"],
                            work=tag_result["work"],
                            recording=tag_result["recording"],
                            confidence=tag_result["confidence"],
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
