"""Never let a slow log reader freeze the event loop.

The desktop shell starts the backend with stdout and stderr connected to pipes
it reads asynchronously. A pipe holds only a few tens of KB; once the reader
falls behind (a model download's progress bar writes hundreds of lines a
second, or the shell is busy) the next ``write`` blocks. uvicorn writes its
access log from the event loop thread, so the whole loop stops, ``/health``
misses its deadline and the shell reports "backend not responding" while the
log's last lines are ordinary 200s (#2970, #2876, #2840, #2794, #2756).

``install()`` puts a bounded in-memory buffer between producers and a pipe: a
daemon thread owns the real (possibly blocking) write, producers return at
once, and when the buffer overflows the oldest text is dropped and one notice
says how much. Terminals and regular files cannot stall like that and are left
untouched, so behaviour is identical on every platform.
"""
from __future__ import annotations

import atexit
import collections
import io
import os
import stat
import sys
import threading

DEFAULT_LIMIT_BYTES = 2 * 1024 * 1024
_EXIT_DRAIN_S = 2.0


def _is_pipe(stream) -> bool:
    try:
        mode = os.fstat(stream.fileno()).st_mode
    except (AttributeError, OSError, ValueError):
        return False
    return stat.S_ISFIFO(mode) or stat.S_ISSOCK(mode)


class DecoupledStream(io.TextIOBase):
    """Text stream whose ``write`` never waits on the underlying sink."""

    def __init__(self, real, *, limit_bytes: int = DEFAULT_LIMIT_BYTES) -> None:
        self._real = real
        self._limit = max(1024, int(limit_bytes))
        self._chunks: collections.deque[str] = collections.deque()
        self._size = 0
        self._dropped = 0
        self._broken = False
        self._busy = False
        self._cond = threading.Condition()
        self._thread = threading.Thread(
            target=self._pump, name="stdio-pump", daemon=True
        )
        self._thread.start()

    # -- producer side: constant time, never blocks on the sink ------------
    def write(self, text) -> int:
        if not isinstance(text, str):
            text = str(text)
        if not text:
            return 0
        with self._cond:
            if self._broken:
                return len(text)
            self._chunks.append(text)
            self._size += len(text)
            while self._size > self._limit and len(self._chunks) > 1:
                self._size -= len(self._chunks.popleft())
                self._dropped += 1
            self._cond.notify()
        return len(text)

    def flush(self) -> None:
        """No-op by design: waiting on the sink is exactly what must not happen."""

    def writable(self) -> bool:
        return True

    def isatty(self) -> bool:
        return False

    def fileno(self) -> int:
        return self._real.fileno()

    def __getattr__(self, name):  # encoding, errors, buffer, reconfigure, ...
        return getattr(self._real, name)

    # -- consumer side: the only thread that may block ---------------------
    def _pump(self) -> None:
        while True:
            with self._cond:
                while not self._chunks and not self._dropped:
                    self._busy = False
                    self._cond.notify_all()
                    self._cond.wait()
                self._busy = True
                parts = list(self._chunks)
                self._chunks.clear()
                self._size = 0
                dropped, self._dropped = self._dropped, 0
            text = "".join(parts)
            if dropped:
                text = (
                    f"[log] {dropped} output chunk(s) dropped: the log reader "
                    "was not keeping up\n" + text
                )
            if not self._emit(text):
                with self._cond:
                    self._broken = True
                    self._chunks.clear()
                    self._size = 0
                    self._busy = False
                    self._cond.notify_all()
                return

    def _emit(self, text: str) -> bool:
        try:
            try:
                self._real.write(text)
            except UnicodeEncodeError:
                enc = getattr(self._real, "encoding", None) or "utf-8"
                self._real.write(text.encode(enc, "replace").decode(enc, "replace"))
            self._real.flush()
            return True
        except (OSError, ValueError):  # reader gone or stream closed
            return False

    def drain(self, timeout: float = _EXIT_DRAIN_S) -> None:
        """Best-effort wait (bounded) for buffered text to reach the sink."""
        with self._cond:
            self._cond.wait_for(
                lambda: self._broken or (not self._chunks and not self._busy),
                timeout,
            )


def install(*, limit_bytes: int = DEFAULT_LIMIT_BYTES) -> list[DecoupledStream]:
    """Wrap ``sys.stdout``/``sys.stderr`` when they are pipes. Idempotent."""
    if os.environ.get("OMNIVOICE_BLOCKING_STDIO", "").strip().lower() in ("1", "true", "yes", "on"):
        return []
    wrapped: list[DecoupledStream] = []
    for name in ("stdout", "stderr"):
        stream = getattr(sys, name, None)
        if stream is None or isinstance(stream, DecoupledStream) or not _is_pipe(stream):
            continue
        replacement = DecoupledStream(stream, limit_bytes=limit_bytes)
        setattr(sys, name, replacement)
        wrapped.append(replacement)
    if wrapped:
        def _drain_all() -> None:
            for s in wrapped:
                s.drain()

        atexit.register(_drain_all)
    return wrapped
