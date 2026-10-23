"""Check the unpacked extension, then create a reproducible ZIP and SHA-256 file."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]


def check():
    dist = ROOT / 'dist'
    package = json.loads((ROOT / 'package.json').read_text())
    manifest = json.loads((dist / 'manifest.json').read_text())
    assert manifest['manifest_version'] == 3, 'Expected MV3'
    assert manifest['version'] == package['version'], 'Package/manifest version mismatch'
    refs = [manifest['background']['service_worker'], manifest['action']['default_popup'],
            manifest['options_page'], *manifest['icons'].values()]
    for script in manifest['content_scripts']:
        refs.extend(script.get('js', []))
        refs.extend(script.get('css', []))
    for resource in manifest.get('web_accessible_resources', []):
        refs.extend(resource['resources'])
    for ref in refs:
        assert not ref.startswith('/') and '..' not in Path(ref).parts, f'Unsafe path: {ref}'
        assert any(p.is_file() for p in dist.glob(ref)), f'Missing manifest resource: {ref}'
    for name in ['LICENSE', 'THIRD_PARTY_NOTICES.txt', 'fonts/BricolageGrotesque-OFL.txt', 'fonts/JetBrainsMono-OFL.txt']:
        assert (dist / name).read_bytes() == (ROOT / 'public' / name).read_bytes(), f'Stale notice: {name}'
    assert (dist / 'LICENSE').read_bytes() == (ROOT / 'LICENSE').read_bytes(), 'Stale project license'
    for script in manifest['content_scripts']:
        if script.get('world') == 'MAIN':
            for ref in script['js']:
                assert 'onExecute' not in (dist / ref).read_text(), 'MAIN bridge contains extension loader'
    print(f'PASS dist v{package["version"]}: manifest resources, MV3 bridges and license files')
    return dist, package['version']


def pack():
    dist, version = check()
    output = ROOT / 'release'
    output.mkdir(exist_ok=True)
    archive = output / f'ChatGo-v{version}.zip'
    files = sorted(p for p in dist.rglob('*') if p.is_file())
    with ZipFile(archive, 'w', compression=ZIP_DEFLATED, compresslevel=9) as zip_file:
        for path in files:
            info = ZipInfo(path.relative_to(dist).as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            zip_file.writestr(info, path.read_bytes())
    with ZipFile(archive) as zip_file:
        assert zip_file.testzip() is None, 'ZIP corruption'
        assert set(zip_file.namelist()) == {p.relative_to(dist).as_posix() for p in files}
        assert 'manifest.json' in zip_file.namelist(), 'ZIP must load from extracted root'
        for path in files:
            assert zip_file.read(path.relative_to(dist).as_posix()) == path.read_bytes()
    digest = sha256(archive.read_bytes()).hexdigest()
    archive.with_suffix('.zip.sha256').write_text(f'{digest}  {archive.name}\n')
    print(f'PASS ZIP: {len(files)} files match dist; {archive.name} ({archive.stat().st_size} bytes)')
    print(f'SHA-256 {digest}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Validate dist without packaging')
    args = parser.parse_args()
    check() if args.check else pack()
