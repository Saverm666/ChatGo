"""Release gates must fail on incomplete or stale distributions."""
from contextlib import redirect_stdout
from hashlib import sha256
import importlib.util
import io
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('release_tool', ROOT / 'tools/release.py')
release_tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release_tool)


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for name in ['dist', 'public']:
            shutil.copytree(ROOT / name, self.root / name)
        for name in ['package.json', 'LICENSE']:
            shutil.copy2(ROOT / name, self.root / name)
        self.patch = patch.object(release_tool, 'ROOT', self.root)
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def test_missing_manifest_resource_is_rejected(self):
        (self.root / 'dist/service-worker-loader.js').unlink()
        with self.assertRaisesRegex(AssertionError, 'Missing manifest resource'):
            release_tool.check()

    def test_version_mismatch_is_rejected(self):
        file = self.root / 'dist/manifest.json'
        manifest = json.loads(file.read_text())
        manifest['version'] = '0.0.0'
        file.write_text(json.dumps(manifest))
        with self.assertRaisesRegex(AssertionError, 'version mismatch'):
            release_tool.check()

    def test_stale_notice_is_rejected(self):
        (self.root / 'dist/THIRD_PARTY_NOTICES.txt').write_text('stale')
        with self.assertRaisesRegex(AssertionError, 'Stale notice'):
            release_tool.check()

    def test_main_world_loader_is_rejected(self):
        manifest = json.loads((self.root / 'dist/manifest.json').read_text())
        script = next(item for item in manifest['content_scripts'] if item.get('world') == 'MAIN')['js'][0]
        (self.root / 'dist' / script).write_text('chrome.runtime.onExecute()')
        with self.assertRaisesRegex(AssertionError, 'MAIN bridge'):
            release_tool.check()

    def test_package_reproducibility_and_checksum(self):
        with redirect_stdout(io.StringIO()):
            release_tool.pack()
            archive = next((self.root / 'release').glob('*.zip'))
            first = archive.read_bytes()
            release_tool.pack()
        self.assertEqual(first, archive.read_bytes())
        digest, name = archive.with_suffix('.zip.sha256').read_text().split()
        self.assertEqual(name, archive.name)
        self.assertEqual(digest, sha256(first).hexdigest())


if __name__ == '__main__':
    unittest.main()
