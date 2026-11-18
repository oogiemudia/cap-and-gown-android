#!/usr/bin/env python3
"""Checks the planner page before a change goes live on phones.

Usage: python3 tools/check_page.py [base-ref]

The app fetches app/src/main/assets/index.html from the main branch and shows it without a new
install, so a mistake here reaches the phone. This makes sure the page is whole, its script
parses, its library links are sound, and (when a base ref is given) that a changed page has a
higher page number than before, which is what makes phones take it.
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile

PAGE = 'app/src/main/assets/index.html'
NUMBER = re.compile(rb'<meta\s+name="capgown-page"\s+content="(\d{1,9})"')


def page_number(data):
    m = NUMBER.search(data[:4096])
    return int(m.group(1)) if m else 0


def main():
    errors = []
    data = open(PAGE, 'rb').read()
    text = data.decode('utf-8')
    n = page_number(data)

    if n <= 0:
        errors.append('The page number (meta name="capgown-page") is missing from the first 4096 bytes.')
    if not data[:4096].lower().lstrip().startswith(b'<!doctype html'):
        errors.append('The page does not start with <!doctype html>.')
    if b'</html>' not in data[-200:]:
        errors.append('The page does not end with </html>.')
    if not 20_000 < len(data) < 4_000_000:
        errors.append(f'The page is {len(data)} bytes; the app accepts 20,000 to 4,000,000.')

    scripts = re.findall(r'<script>(.*?)</script>', text, re.S)
    if not scripts:
        errors.append('No script found in the page.')
    elif shutil.which('node'):
        with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as f:
            f.write(scripts[-1])
        try:
            r = subprocess.run(['node', '--check', f.name], capture_output=True, text=True)
            if r.returncode != 0:
                errors.append('The page script does not parse:\n' + r.stderr.strip()[:800])
        finally:
            os.unlink(f.name)
    else:
        print('note: node is not installed, so the script was not parsed')

    block = re.search(r'const ONLINE = \[(.*?)\n  \];', text, re.S)
    if not block:
        errors.append('The ONLINE library list was not found.')
    else:
        ids = re.findall(r"\{ id: '([^']+)'", block.group(1))
        urls = re.findall(r"url: '([^']+)'", block.group(1))
        if len(ids) != len(urls):
            errors.append(f'{len(ids)} library ids but {len(urls)} links.')
        for name, items in (('id', ids), ('link', urls)):
            twice = sorted({x for x in items if items.count(x) > 1})
            if twice:
                errors.append(f'Library {name} used more than once: {", ".join(twice)}')
        bad = [u for u in urls if not re.fullmatch(r'https://[^\s"<>]+', u)]
        if bad:
            errors.append('Library links must start with https://: ' + ', '.join(bad))
        print(f'library: {len(ids)} items')

    if len(sys.argv) > 1:
        base = sys.argv[1]
        r = subprocess.run(['git', 'show', f'{base}:{PAGE}'], capture_output=True)
        if r.returncode == 0 and r.stdout != data:
            was = page_number(r.stdout)
            if n <= was:
                errors.append(f'The page changed but its number did not go up (was {was}, now {n}). '
                              'Raise capgown-page in the head, or phones will not take the change.')
            else:
                print(f'page number: {was} -> {n}')
        elif r.returncode != 0:
            print(f'note: could not read {PAGE} at {base}; skipped the page number comparison')

    if errors:
        print('\n'.join('ERROR: ' + e for e in errors))
        sys.exit(1)
    print(f'page {n}: OK ({len(data)} bytes)')


if __name__ == '__main__':
    main()
