import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, FormatChecker, ValidationError
from referencing import Registry, Resource

HERE = Path(__file__).parent
FIXTURES = HERE.parents[2] / "build" / "web" / "tests" / "fixtures"


def _load(path):
    return json.loads(Path(path).read_text())


PAYLOAD = _load(HERE / "status_payload.schema.json")
SERIES = _load(HERE / "status_series.schema.json")


def _series_validator():
    registry = Registry().with_resource(
        "status_payload.schema.json", Resource.from_contents(PAYLOAD)
    )
    return Draft202012Validator(
        SERIES, registry=registry, format_checker=FormatChecker()
    )


def validate_payload(payload):
    Draft202012Validator(PAYLOAD, format_checker=FormatChecker()).validate(payload)


def validate_series(payload):
    _series_validator().validate(payload)


def test_schemas_are_valid():
    Draft202012Validator.check_schema(PAYLOAD)
    Draft202012Validator.check_schema(SERIES)


def test_full_fixture_validates():
    validate_payload(_load(FIXTURES / "status-data-full.json"))


@pytest.mark.parametrize(
    "path", sorted((FIXTURES / "series").glob("*.json")), ids=lambda p: p.name
)
def test_series_fixtures_validate(path):
    validate_series(_load(path))


def test_app_section_may_degrade_to_panel_error():
    payload = _load(FIXTURES / "status-data-full.json")
    payload["app"]["release"] = {"error": "timed out"}
    validate_payload(payload)


def test_app_section_rejects_unknown_shape():
    payload = _load(FIXTURES / "status-data-full.json")
    payload["app"]["release"] = {"title": "Release"}
    with pytest.raises(ValidationError):
        validate_payload(payload)


def test_app_is_required():
    payload = _load(FIXTURES / "status-data-full.json")
    del payload["app"]
    with pytest.raises(ValidationError):
        validate_payload(payload)
