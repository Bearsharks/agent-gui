"""Metadata configuration and extraction support."""

from __future__ import annotations

import importlib.util
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable


_FIELD_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


@dataclass(frozen=True)
class MetadataExtractorConfig:
    path: str = ""
    function: str = ""


@dataclass(frozen=True)
class MetadataFieldConfig:
    type: str = "keyword"
    filterable: bool = False
    default: str = ""


@dataclass(frozen=True)
class MetadataConfig:
    extractor: MetadataExtractorConfig = field(default_factory=MetadataExtractorConfig)
    fields: dict[str, MetadataFieldConfig] = field(default_factory=dict)

    @property
    def enabled(self) -> bool:
        return bool(self.fields)

    @property
    def filterable_fields(self) -> dict[str, MetadataFieldConfig]:
        return {name: cfg for name, cfg in self.fields.items() if cfg.filterable}


MetadataExtractor = Callable[[str], dict[str, Any]]


def metadata_field_name(name: str) -> str:
    if not _FIELD_RE.match(name):
        raise ValueError(f"Invalid metadata field name: {name!r}")
    return f"meta_{name}"


def parse_metadata_config(data: dict[str, Any]) -> MetadataConfig:
    raw = data.get("metadata", {})
    if not isinstance(raw, dict):
        return MetadataConfig()

    extractor_raw = raw.get("extractor", {})
    extractor = MetadataExtractorConfig()
    if isinstance(extractor_raw, dict):
        extractor = MetadataExtractorConfig(
            path=str(extractor_raw.get("path", "") or ""),
            function=str(extractor_raw.get("function", "") or ""),
        )

    fields_raw = raw.get("fields", {})
    fields: dict[str, MetadataFieldConfig] = {}
    if isinstance(fields_raw, dict):
        for name, value in fields_raw.items():
            metadata_field_name(str(name))
            if not isinstance(value, dict):
                continue
            field_type = str(value.get("type", "keyword") or "keyword")
            if field_type != "keyword":
                raise ValueError(f"Unsupported metadata field type for {name!r}: {field_type!r}")
            fields[str(name)] = MetadataFieldConfig(
                type=field_type,
                filterable=bool(value.get("filterable", False)),
                default=str(value.get("default", "") or ""),
            )
    return MetadataConfig(extractor=extractor, fields=fields)


def metadata_config_to_dict(config: MetadataConfig) -> dict[str, Any]:
    return {
        "extractor": {
            "path": config.extractor.path,
            "function": config.extractor.function,
        },
        "fields": {
            name: {
                "type": field_config.type,
                "filterable": field_config.filterable,
                "default": field_config.default,
            }
            for name, field_config in config.fields.items()
        },
    }


def load_metadata_extractor(config: MetadataConfig, *, base_dir: str | Path = ".") -> MetadataExtractor | None:
    if not config.enabled:
        return None
    if not config.extractor.path or not config.extractor.function:
        return None

    path = Path(config.extractor.path).expanduser()
    if not path.is_absolute():
        path = Path(base_dir) / path
    path = path.resolve()
    spec = importlib.util.spec_from_file_location("_mem_metadata_extractor", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load metadata extractor: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    fn = getattr(module, config.extractor.function, None)
    if not callable(fn):
        raise RuntimeError(f"Metadata extractor function not found: {config.extractor.function} in {path}")
    return fn


def normalize_metadata(raw: dict[str, Any] | None, config: MetadataConfig) -> dict[str, str]:
    raw = raw or {}
    normalized: dict[str, str] = {}
    for name, field_config in config.fields.items():
        value = raw.get(name, field_config.default)
        normalized[name] = str(value if value is not None else field_config.default)
    return normalized


def metadata_record_fields(metadata: dict[str, str], config: MetadataConfig) -> dict[str, Any]:
    if not config.enabled:
        return {}
    record: dict[str, Any] = {"metadata_json": json.dumps(metadata, ensure_ascii=False, sort_keys=True)}
    for name in config.filterable_fields:
        record[metadata_field_name(name)] = metadata.get(name, "")
    return record


def build_metadata_filter_expr(filters: dict[str, str] | None, config: MetadataConfig) -> str:
    if not filters:
        return ""
    parts: list[str] = []
    for key, value in filters.items():
        field_config = config.fields.get(key)
        if field_config is None:
            raise KeyError(f"Unknown metadata filter field: {key}")
        if not field_config.filterable:
            raise ValueError(f"Metadata field is not filterable: {key}")
        escaped = str(value).replace("\\", "\\\\").replace('"', '\\"')
        parts.append(f'{metadata_field_name(key)} == "{escaped}"')
    return " && ".join(parts)
