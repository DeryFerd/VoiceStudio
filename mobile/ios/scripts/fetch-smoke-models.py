#!/usr/bin/env python3
"""Explicit CI/user action: fetch checked catalogue files for the real offline Swift smoke."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]
IOS = ROOT / 'mobile/ios'


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1048576), b''):
            value.update(chunk)
    return value.hexdigest()


def fetch(item):
    model, file = item
    output = IOS / '.cache/inference-models' / model['id'] / file['path']
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists() and output.stat().st_size == file['size'] and digest(output) == file['sha256']:
        return
    part = output.with_suffix(output.suffix + '.part')
    for host in ('huggingface.co', 'hf-mirror.com'):
        url = 'https://' + host + '/' + model['repo'] + '/resolve/' + model['revision'] + '/' + file['path']
        result = subprocess.run(['curl', '--fail', '--location', '--retry', '2', '--connect-timeout', '30', '--max-time', '1800', '--silent', '--show-error', url, '-o', str(part)])
        if result.returncode == 0 and part.stat().st_size == file['size'] and digest(part) == file['sha256']:
            part.replace(output)
            return
    part.unlink(missing_ok=True)
    raise RuntimeError('Download or checksum failed: ' + file['path'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--accept-test-licences', action='store_true', required=True,
                        help='Acknowledge the catalogue terms for inference test fixtures only; app acceptance is independent.')
    parser.add_argument('--extended', action='store_true', help='Also fetch the pinned OmniVoice and translation models for the engine-only smoke.')
    args = parser.parse_args()
    models = json.loads((ROOT / 'mobile/contract/models.json').read_text())['models']
    wanted = ['kitten-mini-en-fp16', 'whisper-tiny-int8', 'zipformer-en-20m-int8']
    if args.extended:
        wanted += ['omnivoice-q4-k-m', 'qwen3-1-7b-q4-k-m']
    selected = [m for m in models if m['id'] in wanted]
    if len(selected) != len(wanted):
        raise RuntimeError('Smoke catalogue changed; update the explicit smoke model selection')
    for model in selected:
        print(model['id'], json.dumps(model['licence']), flush=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(fetch, [(model, file) for model in selected for file in model['files']]))
    for model in selected:
        output = IOS / '.cache/inference-models' / model['id'] / 'verified.json'
        output.write_text(json.dumps({f['path']: f['sha256'] for f in model['files']}))
    print('All smoke model files verified. Run scripts/real-inference.sh.', flush=True)
