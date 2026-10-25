import contextlib
import datetime
import json
from pathlib import Path
from unittest import mock

import pytest
import status
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


UTC = datetime.UTC
ACCOUNT = "123456789012"


class FakeContext:
    def get_remaining_time_in_millis(self):
        return 10_000


def _metric_results(queries, end):
    values = {"cnt": 60.0, "avg": 1.0, "p50": 12.0, "p90": 20.0, "size": 1000.0}
    results = []
    for q in queries:
        period = q.get("Period") or q["MetricStat"]["Period"]
        newest = status.floor_utc(end, period)
        results.append(
            {
                "Id": q["Id"],
                "Timestamps": [
                    newest - i * datetime.timedelta(seconds=period) for i in range(3)
                ],
                "Values": [values.get(q["Id"], 5.0)] * 3,
            }
        )
    return results


def _log_rows(group):
    stamp = (datetime.datetime.now(UTC) - datetime.timedelta(days=1)).replace(
        tzinfo=None
    )
    started = (stamp - datetime.timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M:%SZ")
    ended = stamp.strftime("%Y-%m-%dT%H:%M:%SZ")
    records = {
        "test-log-group": [
            (
                status.EPISODES_LOG_STREAM,
                {
                    "started": started,
                    "ended": ended,
                    "duration_s": 300,
                    "cause": "deploy",
                    "planned": True,
                },
            ),
            (
                status.CHANGES_LOG_STREAM,
                {
                    "at": ended,
                    "kind": "deploy",
                    "id": "d-1",
                    "creator": "user",
                    "outcome": "succeeded",
                    "duration_s": 120,
                    "description": None,
                },
            ),
        ],
        "test-spot-group": [
            (
                "events",
                {
                    "time": ended,
                    "detail": {"instance-id": "i-1", "instance-action": "terminate"},
                },
            )
        ],
    }[group]
    return [
        [
            {"field": "@timestamp", "value": stamp.strftime("%Y-%m-%d %H:%M:%S.000")},
            {"field": "@logStream", "value": stream},
            {"field": "@message", "value": json.dumps(record)},
        ]
        for stream, record in records
    ]


class FakeLogs:
    def __init__(self):
        self.groups = []

    def start_query(self, **kwargs):
        self.groups.append(kwargs["logGroupName"])
        return {"queryId": str(len(self.groups) - 1)}

    def get_query_results(self, queryId):
        return {"status": "Complete", "results": _log_rows(self.groups[int(queryId)])}


@contextlib.contextmanager
def stubbed_aws(**overrides):
    def get_metric_data(MetricDataQueries, EndTime, **_kwargs):
        return {"MetricDataResults": _metric_results(MetricDataQueries, EndTime)}

    now = datetime.datetime.now(UTC)
    deployment = {
        "deploymentId": "d-1",
        "status": "Succeeded",
        "createTime": now,
        "completeTime": now,
        "creator": "user",
    }
    instance = {
        "InstanceType": "t3.small",
        "Architecture": "x86_64",
        "Placement": {"AvailabilityZone": "us-east-1a"},
        "LaunchTime": now - datetime.timedelta(hours=3),
        "ImageId": "ami-1",
        "RootDeviceName": "/dev/xvda",
        "BlockDeviceMappings": [
            {"DeviceName": "/dev/xvda", "Ebs": {"VolumeId": "vol-root"}}
        ],
    }
    volume = {
        "Size": 8,
        "VolumeType": "gp3",
        "Iops": 3000,
        "Encrypted": True,
        "State": "in-use",
    }
    fake_cloudwatch = mock.Mock(get_metric_data=get_metric_data)
    patches = [
        mock.patch.object(status, "cloudwatch", fake_cloudwatch),
        mock.patch.object(status, "bedrock_cloudwatch", fake_cloudwatch),
        mock.patch.object(status, "logs", FakeLogs()),
        mock.patch.object(
            status,
            "autoscaling",
            mock.Mock(
                describe_auto_scaling_groups=lambda **_: {
                    "AutoScalingGroups": [
                        {
                            "DesiredCapacity": 1,
                            "MinSize": 1,
                            "MaxSize": 1,
                            "Instances": [{"InstanceId": "i-1"}],
                        }
                    ]
                }
            ),
        ),
        mock.patch.object(
            status,
            "ec2",
            mock.Mock(
                describe_instances=lambda **_: {
                    "Reservations": [{"Instances": [instance]}]
                },
                describe_images=lambda **_: {
                    "Images": [
                        {
                            "Name": "img",
                            "CreationDate": "2026-01-01T00:00:00.000Z",
                            "Tags": [],
                        }
                    ]
                },
                describe_volumes=lambda **_: {
                    "Volumes": [
                        {
                            "VolumeId": "vol-test",
                            "Attachments": [{"Device": "/dev/sdf"}],
                            **volume,
                        },
                        {"VolumeId": "vol-root", "Attachments": [], **volume},
                    ]
                },
            ),
        ),
        mock.patch.object(
            status,
            "codedeploy",
            mock.Mock(
                list_deployments=lambda **_: {"deployments": ["d-1"]},
                batch_get_deployments=lambda **_: {"deploymentsInfo": [deployment]},
            ),
        ),
        mock.patch.object(
            status,
            "codepipeline",
            mock.Mock(
                list_action_executions=lambda **_: {"actionExecutionDetails": []}
            ),
        ),
        mock.patch.object(
            status,
            "ecr",
            mock.Mock(
                describe_images=lambda **_: {
                    "imageDetails": [
                        {
                            "imageTags": ["latest"],
                            "imageDigest": "sha256:0",
                            "imagePushedAt": now,
                        }
                    ]
                }
            ),
        ),
        mock.patch.object(status, "HOST_METRICS_ENABLED", "true"),
        mock.patch.object(status, "BEDROCK_ENABLED", "true"),
        mock.patch.object(status, "BEDROCK_REGION", "us-east-1"),
        mock.patch.object(
            status, "BEDROCK_MODEL_ID", f"arn:aws:bedrock:us-east-1:{ACCOUNT}:model"
        ),
        mock.patch.dict(status._data_cache, {"data": None, "fetched_at": 0.0}),
        mock.patch.object(status, "_series_cache", status.collections.OrderedDict()),
    ]
    patches += [mock.patch.object(status, k, v) for k, v in overrides.items()]
    with contextlib.ExitStack() as stack:
        for p in patches:
            stack.enter_context(p)
        yield


def _data_body():
    response = status.data_response({"x-token": "ok"}, FakeContext())
    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert [k for k, v in body.items() if status.is_error(v)] == []
    return body


def test_real_data_response_validates():
    with stubbed_aws():
        body = _data_body()
    validate_payload(body)
    assert body["caller_role"] == "tester"
    assert body["source_repo"] == "example/app"
    assert set(body["app"]) == {"release"}
    assert "deployment" in body
    assert "bedrock" in body
    assert "bucket_size_bytes" in body["storage"]


def test_real_data_response_validates_without_deployment():
    with stubbed_aws(CODEDEPLOY_APP_NAME="", SOURCE_REPO=None, STORAGE_BUCKET_NAME=""):
        body = _data_body()
    validate_payload(body)
    assert "deployment" not in body
    assert body["source_repo"] is None
    assert "bucket_size_bytes" not in body["storage"]


def test_real_data_response_validates_with_failed_app_section():
    def broken():
        raise RuntimeError("boom")

    with (
        stubbed_aws(),
        mock.patch.object(status.plugin, "sections", return_value={"release": broken}),
    ):
        body = _data_body()
    validate_payload(body)
    assert body["app"] == {"release": {"error": "RuntimeError: boom"}}


def test_real_data_response_validates_with_no_app_sections():
    with stubbed_aws(), mock.patch.object(status.plugin, "sections", return_value={}):
        body = _data_body()
    validate_payload(body)
    assert body["app"] == {}


@pytest.mark.parametrize("panel", ["reliability", "host_metrics", "bedrock"])
@pytest.mark.parametrize("range_key", list(status.RANGES))
def test_real_series_response_validates(panel, range_key):
    end = status.iso(datetime.datetime.now(UTC) - datetime.timedelta(hours=1))
    query = {"panel": panel, "range": range_key, "end": end}
    with stubbed_aws():
        response = status.series_response({"x-token": "ok"}, query)
    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert "error" not in body["data"]
    validate_series(body)
