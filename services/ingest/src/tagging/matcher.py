import re
from dataclasses import dataclass, field
from typing import List, Optional, Sequence

WORD_RE = re.compile(r"[\w'\-]+", re.UNICODE)


@dataclass
class TaggingStoplist:
    artists: Sequence[str] = field(default_factory=lambda: ["various artists", "unknown"])
    works: Sequence[str] = field(default_factory=list)
    recordings: Sequence[str] = field(default_factory=list)

    def is_artist_blocked(self, value: str) -> bool:
        value_lower = value.lower()
        return any(value_lower == needle.lower() for needle in self.artists)

    def is_work_blocked(self, value: str) -> bool:
        value_lower = value.lower()
        return any(value_lower == needle.lower() for needle in self.works)

    def is_recording_blocked(self, value: str) -> bool:
        value_lower = value.lower()
        return any(value_lower == needle.lower() for needle in self.recordings)


@dataclass
class TaggingConfig:
    artists: Sequence[str]
    works: Sequence[str]
    recordings: Sequence[str]
    stoplist: TaggingStoplist = field(default_factory=TaggingStoplist)
    fuzzy_threshold: float = 0.6


def _tokenize(value: str) -> List[str]:
    return [token.lower() for token in WORD_RE.findall(value or "")]


def _score_match(tokens: List[str], candidate_tokens: List[str]) -> float:
    if not tokens or not candidate_tokens:
        return 0.0
    common = len(set(tokens) & set(candidate_tokens))
    return common / max(len(tokens), len(candidate_tokens))


def _best_match(value_tokens: List[str], candidates: Sequence[str], stopcheck) -> Optional[str]:
    best_score = 0.0
    best_candidate = None
    for candidate in candidates:
        if stopcheck(candidate):
            continue
        score = _score_match(value_tokens, _tokenize(candidate))
        if score > best_score:
            best_score = score
            best_candidate = candidate
    return best_candidate if best_score >= 0.6 else None


def match_entities(
    title: str,
    description: Optional[str],
    config: TaggingConfig
) -> dict:
    combined = f"{title} {description or ''}".strip()
    tokens = _tokenize(combined)
    if not tokens:
        return {
            "artist": None,
            "work": None,
            "recording": None,
            "confidence": {"artist": 0.0, "work": 0.0, "recording": 0.0},
        }

    artist = _best_match(tokens, config.artists, config.stoplist.is_artist_blocked)
    work = _best_match(tokens, config.works, config.stoplist.is_work_blocked)
    recording = _best_match(tokens, config.recordings, config.stoplist.is_recording_blocked)

    return {
        "artist": artist,
        "work": work,
        "recording": recording,
        "confidence": {
            "artist": _score_match(tokens, _tokenize(artist)) if artist else 0.0,
            "work": _score_match(tokens, _tokenize(work)) if work else 0.0,
            "recording": _score_match(tokens, _tokenize(recording)) if recording else 0.0,
        }
    }
