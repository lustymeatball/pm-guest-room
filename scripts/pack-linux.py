# Packs release/linux-unpacked into a Linux tar.gz with correct file permissions.
# Needed when building on Windows, where electron-builder can't set Unix permissions
# (and can't build AppImage/.deb). On Linux, `npm run dist:linux` builds all formats directly.
import json, tarfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
src = root / 'release' / 'linux-unpacked'
name = f'PM-Guest-Room-{version}-linux-x64'
out = root / 'release' / f'{name}.tar.gz'

EXEC = {'pm-guest-room', 'chrome_crashpad_handler', 'chrome-sandbox', 'pm-guest-room.sh', 'install.sh'}
extras = {
    'pm-guest-room.sh': root / 'linux' / 'pm-guest-room.sh',
    'install.sh': root / 'linux' / 'install.sh',
    'pm-guest-room.png': root / 'assets' / 'icon.png',
}

def fix(ti):
    ti.uid = ti.gid = 0
    ti.uname = ti.gname = ''
    base = Path(ti.name).name
    if ti.isdir():
        ti.mode = 0o755
    elif base in EXEC or base.endswith('.so') or '.so.' in base:
        ti.mode = 0o755
    else:
        ti.mode = 0o644
    return ti

def add_text(tar, arcname, path):
    data = path.read_bytes().replace(b'\r\n', b'\n')  # shell scripts must have LF endings
    ti = tarfile.TarInfo(arcname)
    ti.size = len(data)
    ti.mtime = int(__import__("time").time())
    fix(ti)
    import io
    tar.addfile(ti, io.BytesIO(data))

out.unlink(missing_ok=True)
with tarfile.open(out, 'w:gz', compresslevel=9) as tar:
    tar.add(src, arcname=name, filter=fix)
    for arc, p in extras.items():
        if p.suffix == '.sh':
            add_text(tar, f'{name}/{arc}', p)
        else:
            tar.add(p, arcname=f'{name}/{arc}', filter=fix)
print('wrote', out)
