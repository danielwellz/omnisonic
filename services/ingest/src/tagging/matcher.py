import re
import unicodedata
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence

from thefuzz import fuzz

from .embeddings import EmbeddingClient

WORD_RE = re.compile(r"[\w'\-]+", re.UNICODE)
FEATURE_PATTERN = re.compile(r"\b(feat\.?|featuring|ft\.?|vs\.?)(?=\s)", re.IGNORECASE)


def _normalize(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode("ascii")
    normalized = FEATURE_PATTERN.sub("feat", normalized)
    normalized = re.sub(r"[^a-zA-Z0-9]+", " ", normalized).lower()
    return re.sub(r"\s+", " ", normalized).strip()


def _tokenize(value: str) -> List[str]:
    return [token.lower() for token in WORD_RE.findall(value or "")]


def _score_match(tokens: List[str], candidate_tokens: List[str]) -> float:
    if not tokens or not candidate_tokens:
        return 0.0
    common = len(set(tokens) & set(candidate_tokens))
    return common / max(len(tokens), len(candidate_tokens))


def _extract_snippet(raw_text: str, needle: str) -> Optional[str]:
    if not raw_text or not needle:
        return None
    pattern = re.compile(re.escape(needle), re.IGNORECASE)
    match = pattern.search(raw_text)
    if match:
        return raw_text[match.start() : match.end()].strip()
    return None


@dataclass
class TaggingStoplist:
    artists: Sequence[str] = field(default_factory=lambda: ["various artists", "unknown"])
    works: Sequence[str] = field(default_factory=list)
    recordings: Sequence[str] = field(default_factory=list)

    def _match(self, haystack: Sequence[str], value: str) -> bool:
        normalized = _normalize(value)
        return any(_normalize(needle) == normalized for needle in haystack)

    def is_artist_blocked(self, value: str) -> bool:
        return self._match(self.artists, value)

    def is_work_blocked(self, value: str) -> bool:
        return self._match(self.works, value)

    def is_recording_blocked(self, value: str) -> bool:
        return self._match(self.recordings, value)


@dataclass
class EntityCandidate:
    label: str
    normalized: str
    tokens: List[str]


@dataclass
class MatchDetail:
    value: Optional[str]
    confidence: float
    method: str
    snippet: Optional[str]


@dataclass
class TaggingConfig:
    artists: Sequence[str]
    works: Sequence[str]
    recordings: Sequence[str]
    stoplist: TaggingStoplist = field(default_factory=TaggingStoplist)
    fuzzy_threshold: int = 70
    embedding_threshold: float = 0.7
    use_embeddings: bool = False

    def __post_init__(self) -> None:
        self.fuzzy_threshold = max(1, min(self.fuzzy_threshold, 100))
        self.embedding_threshold = max(0.0, min(self.embedding_threshold, 1.0))
        self._artist_candidates = _prepare_candidates(self.artists)
        self._work_candidates = _prepare_candidates(self.works)
        self._recording_candidates = _prepare_candidates(self.recordings)

    @property
    def artist_candidates(self) -> List[EntityCandidate]:
        return self._artist_candidates

    @property
    def work_candidates(self) -> List[EntityCandidate]:
        return self._work_candidates

    @property
    def recording_candidates(self) -> List[EntityCandidate]:
        return self._recording_candidates


def _prepare_candidates(values: Sequence[str]) -> List[EntityCandidate]:
    unique: Dict[str, EntityCandidate] = {}
    for value in values:
        normalized = _normalize(value)
        if not normalized:
            continue
        if normalized in unique:
            continue
        unique[normalized] = EntityCandidate(label=value.strip(), normalized=normalized, tokens=_tokenize(normalized))
    return list(unique.values())


def _combine_scores(base_score: float, embedding_score: Optional[float]) -> float:
    if embedding_score is None:
        return round(base_score, 4)
    return round((base_score * 0.6) + (embedding_score * 0.4), 4)


def _select_candidate(
    raw_text: str,
    normalized_text: str,
    tokens: List[str],
    candidates: Sequence[EntityCandidate],
    stopcheck,
    config: TaggingConfig,
    embedding_client: Optional[EmbeddingClient]
) -> MatchDetail:
    best = MatchDetail(value=None, confidence=0.0, method="heuristic", snippet=None)
    if not candidates:
        return best

    threshold = config.fuzzy_threshold / 100
    text_embedding = None

    for candidate in candidates:
        if stopcheck(candidate.label):
            continue
        lexical_score = _score_match(tokens, candidate.tokens)
        fuzzy_score = fuzz.token_set_ratio(normalized_text, candidate.normalized) / 100
        base_score = max(lexical_score, fuzzy_score)
        if base_score < threshold:
            continue

        method = "fuzzy"
        embedding_score: Optional[float] = None
        if config.use_embeddings and embedding_client and embedding_client.enabled:
            if text_embedding is None:
                text_embedding = embedding_client.embed(raw_text)
            candidate_embedding = embedding_client.embed(candidate.normalized)
            embedding_score = EmbeddingClient.similarity(text_embedding, candidate_embedding)
            if embedding_score < config.embedding_threshold:
                continue
            method = "hybrid"

        confidence = _combine_scores(base_score, embedding_score)
        if confidence <= best.confidence:
            continue
        snippet = _extract_snippet(raw_text, candidate.label)
        best = MatchDetail(value=candidate.label, confidence=confidence, method=method, snippet=snippet)

    return best


def match_entities(
    title: str,
    description: Optional[str],
    config: TaggingConfig,
    embedding_client: Optional[EmbeddingClient] = None
) -> Dict[str, Dict[str, Optional[str]]]:
    raw_text = f"{title or ''} {description or ''}".strip()
    normalized_text = _normalize(raw_text)
    tokens = _tokenize(normalized_text)

    if not tokens:
        return {
            "artist": None,
            "work": None,
            "recording": None,
            "confidence": {"artist": 0.0, "work": 0.0, "recording": 0.0},
            "methods": {"artist": None, "work": None, "recording": None},
            "matched_text": {"artist": None, "work": None, "recording": None}
        }

    artist = _select_candidate(
        raw_text,
        normalized_text,
        tokens,
        config.artist_candidates,
        config.stoplist.is_artist_blocked,
        config,
        embedding_client
    )
    work = _select_candidate(
        raw_text,
        normalized_text,
        tokens,
        config.work_candidates,
        config.stoplist.is_work_blocked,
        config,
        embedding_client
    )
    recording = _select_candidate(
        raw_text,
        normalized_text,
        tokens,
        config.recording_candidates,
        config.stoplist.is_recording_blocked,
        config,
        embedding_client
    )

    return {
        "artist": artist.value,
        "work": work.value,
        "recording": recording.value,
        "confidence": {
            "artist": artist.confidence,
            "work": work.confidence,
            "recording": recording.confidence
        },
        "methods": {
            "artist": artist.method if artist.value else None,
            "work": work.method if work.value else None,
            "recording": recording.method if recording.value else None
        },
        "matched_text": {
            "artist": artist.snippet,
            "work": work.snippet,
            "recording": recording.snippet
        }
    }
