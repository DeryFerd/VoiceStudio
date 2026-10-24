"""Voice sync preparation (S2): sync_id and consent attestation on voices

Revision ID: 0015_voice_sync_prep
Revises: 0014_cloud_sync
Create Date: 2026-10-16 00:00:00.000000

Adds ``voice_profiles.sync_id`` (16 Base62, filled when sync is first turned
on; local IDs stay local), ``consent_basis`` (``own_voice`` or
``speaker_permission``) and ``consent_attested_at`` (RFC 3339 UTC). A voice
without an attestation is never pushed. Additive and guarded by
PRAGMA table_info; the same columns are in ``core/db.py::_BASE_SCHEMA`` so
``_reconcile_additive_columns`` heals DBs where alembic cannot run.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0015_voice_sync_prep"
down_revision: Union[str, None] = "0014_cloud_sync"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = (
    ("sync_id", "TEXT DEFAULT NULL"),
    ("consent_basis", "TEXT DEFAULT ''"),
    ("consent_attested_at", "TEXT DEFAULT NULL"),
)


def _columns() -> set[str]:
    rows = op.get_bind().execute(sa.text("PRAGMA table_info(voice_profiles)")).fetchall()
    return {r[1] for r in rows}


def upgrade() -> None:
    have = _columns()
    if not have:
        return  # no voice_profiles yet: init_db creates it from _BASE_SCHEMA
    for name, typedef in _COLUMNS:
        if name not in have:
            op.execute(f"ALTER TABLE voice_profiles ADD COLUMN {name} {typedef}")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_profiles_sync_id "
        "ON voice_profiles(sync_id) WHERE sync_id IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_voice_profiles_sync_id")
