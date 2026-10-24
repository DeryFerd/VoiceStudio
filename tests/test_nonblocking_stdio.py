"""A slow log reader must never block the backend (#2970, #2876, #2840, #2794, #2756).

The shell reads stdout/stderr through pipes. uvicorn writes its access log on
the event loop thread, so a full pipe froze ``/health`` while the log showed
only 200s. Measured on the real backend with an unread stderr pipe: it stopped
answering after ~1100 logged requests; with the buffer it served 6000.
"""
import subprocess
import sys
import textwrap
import threading
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from core.nonblocking_stdio import DecoupledStream  # noqa: E402


class _BlockedSink:
    encoding = "utf-8"

    def __init__(self):
        self.gate = threading.Event()
        self.received = []

    def write(self, text):
        self.gate.wait()
        self.received.append(text)

    def flush(self):
        pass


def test_write_returns_immediately_while_sink_is_blocked():
    sink = _BlockedSink()
    stream = DecoupledStream(sink, limit_bytes=4096)
    start = time.monotonic()
    for i in range(20000):
        stream.write(f"line {i}\n")
    assert time.monotonic() - start < 2.0
    sink.gate.set()
    stream.drain(5)
    out = "".join(sink.received)
    assert "dropped" in out and "line 19999\n" in out  # newest text survives
    assert len(out) < 2 * 4096 + 200  # one batch in flight + one buffered


def test_text_is_delivered_in_order_when_reader_keeps_up():
    sink = _BlockedSink()
    sink.gate.set()
    stream = DecoupledStream(sink)
    for i in range(50):
        stream.write(f"{i}\n")
    stream.drain(5)
    assert "".join(sink.received) == "".join(f"{i}\n" for i in range(50))


def test_broken_sink_never_raises_into_the_producer():
    class Gone(_BlockedSink):
        def write(self, text):
            raise BrokenPipeError

    sink = Gone()
    stream = DecoupledStream(sink)
    stream.write("x\n")
    stream.drain(2)
    assert stream.write("y\n") == 2


_CHILD = textwrap.dedent(
    """
    import sys
    sys.path.insert(0, {backend!r})
    from core.nonblocking_stdio import install
    install()
    chunk = "x" * 1023 + "\\n"
    for _ in range(8192):  # 8 MB, far beyond any pipe buffer
        sys.stderr.write(chunk)
    print("finished", flush=True)
    """
)


def _run_child(env_extra: dict[str, str], timeout: float):
    import os

    proc = subprocess.Popen(
        [sys.executable, "-I", "-c", _CHILD.format(backend=str(BACKEND))],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,  # never read: this is the slow log reader
        env={**os.environ, **env_extra},
        text=True,
    )
    try:
        out = proc.stdout.readline()  # type: ignore[union-attr]
        return out.strip()
    finally:
        proc.kill()
        proc.wait()


def test_unread_stderr_pipe_does_not_block_the_process():
    result: list[str] = []
    t = threading.Thread(target=lambda: result.append(_run_child({}, 30)), daemon=True)
    t.start()
    t.join(20)
    assert result == ["finished"], "writing to an unread stderr pipe blocked the process"


def test_control_unwrapped_stderr_pipe_blocks():
    """Proves the test above measures the real hazard, not a trivial pass."""
    result: list[str] = []
    t = threading.Thread(
        target=lambda: result.append(_run_child({"OMNIVOICE_BLOCKING_STDIO": "1"}, 30)),
        daemon=True,
    )
    t.start()
    t.join(4)
    assert t.is_alive() and result == []


def test_main_installs_it_before_logging_and_servers_start():
    src = (BACKEND / "main.py").read_text(encoding="utf-8")
    assert src.index("_install_nonblocking_stdio()") < src.index("import math")
