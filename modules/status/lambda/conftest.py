"""Shared test setup: stubs boto3/botocore, sets the env status.py reads at
import, and puts a fixture `plugin` module on sys.path. The fixture plugin is a
test double for the consumer-supplied module and is not part of the Lambda zip.
Runs before any test module imports status.
"""

import os
import sys
import tempfile
import types

PLUGIN_SOURCE = """
def authenticate(headers):
    return "tester" if headers.get("x-token") == "ok" else None


def sections():
    return {
        "release": lambda: {
            "title": "Release",
            "rows": [{"label": "Version", "value": "1.0", "caption": "Deployed"}],
        }
    }
"""

if "boto3" not in sys.modules:
    _fake_boto3 = types.ModuleType("boto3")

    class _FakeClient:
        def __init__(self, *args, **kwargs):
            pass

    _fake_boto3.client = lambda *args, **kwargs: _FakeClient()
    sys.modules["boto3"] = _fake_boto3

if "botocore" not in sys.modules:
    _fake_botocore = types.ModuleType("botocore")
    _fake_botocore_config = types.ModuleType("botocore.config")

    class _FakeConfig:
        def __init__(self, *args, **kwargs):
            pass

    _fake_botocore_config.Config = _FakeConfig
    _fake_botocore.config = _fake_botocore_config
    sys.modules["botocore"] = _fake_botocore
    sys.modules["botocore.config"] = _fake_botocore_config

for _var, _val in [
    ("PATH_PREFIX", "/status"),
    ("NAME_PREFIX", "test"),
    ("ASG_NAME", "test-asg"),
    ("CODEDEPLOY_APP_NAME", "test-app"),
    ("CODEDEPLOY_DEPLOYMENT_GROUP", "test-group"),
    ("DELIBERATE_DEPLOYMENT_CREATORS", "user,codeDeployRollback"),
    ("CODEPIPELINE_NAME", "test-pipeline"),
    ("SOURCE_REPO", "example/app"),
    ("ECR_REPO_NAME", "test-repo"),
    ("EBS_VOLUME_ID", "vol-test"),
    ("STORAGE_BUCKET_NAME", "test-bucket"),
    ("EPISODES_LOG_GROUP", "test-log-group"),
    ("EPISODES_LOG_STREAM", "test-log-stream"),
    ("CHANGES_LOG_STREAM", "test-changes-stream"),
    ("SPOT_INTERRUPTIONS_LOG_GROUP", "test-spot-group"),
    ("SITEUP_METRIC_NAMESPACE", "test/SiteUp"),
]:
    os.environ.setdefault(_var, _val)

_plugin_dir = tempfile.mkdtemp(prefix="status-plugin-")
with open(os.path.join(_plugin_dir, "plugin.py"), "w") as _f:
    _f.write(PLUGIN_SOURCE)
sys.path.insert(0, _plugin_dir)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
