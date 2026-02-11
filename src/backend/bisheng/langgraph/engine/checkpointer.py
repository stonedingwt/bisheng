"""Checkpointer management for LangGraph workflow persistence.

Supports SQLite (default) and PostgreSQL for production use.
Bisheng uses MySQL, so we default to SQLite file-based checkpointing
which is portable and doesn't require additional infrastructure.
"""

import logging
import os
from typing import Optional

from langgraph.checkpoint.memory import MemorySaver

logger = logging.getLogger(__name__)

# Track the SQLite saver availability
_sqlite_available = False
try:
    from langgraph.checkpoint.sqlite import SqliteSaver
    _sqlite_available = True
except ImportError:
    logger.info('langgraph-checkpoint-sqlite not available, using MemorySaver')

# Track PostgreSQL saver availability
_postgres_available = False
try:
    from langgraph.checkpoint.postgres import PostgresSaver
    _postgres_available = True
except ImportError:
    logger.info('langgraph-checkpoint-postgres not available')


def get_checkpointer(
    mode: str = 'memory',
    db_path: Optional[str] = None,
    connection_string: Optional[str] = None,
):
    """
    Get a checkpointer instance based on the specified mode.

    Args:
        mode: 'memory', 'sqlite', or 'postgres'
        db_path: Path for SQLite database file
        connection_string: PostgreSQL connection string

    Returns:
        A LangGraph checkpointer instance
    """
    if mode == 'sqlite' and _sqlite_available:
        if db_path is None:
            data_dir = os.environ.get('BISHENG_DATA_DIR', '/app/data')
            db_path = os.path.join(data_dir, 'langgraph_checkpoints.db')
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        logger.info(f'Using SQLite checkpointer at {db_path}')
        return SqliteSaver.from_conn_string(db_path)

    if mode == 'postgres' and _postgres_available:
        if connection_string is None:
            connection_string = os.environ.get('LANGGRAPH_POSTGRES_URL', '')
        if connection_string:
            logger.info('Using PostgreSQL checkpointer')
            return PostgresSaver.from_conn_string(connection_string)
        logger.warning('PostgreSQL connection string not provided, falling back to memory')

    # Default: in-memory
    logger.info('Using MemorySaver checkpointer')
    return MemorySaver()


class CheckpointerManager:
    """Manages checkpointer lifecycle for LangGraph workflows."""

    _instances: dict = {}

    @classmethod
    def get_or_create(cls, workflow_id: str, mode: str = 'memory', **kwargs):
        """Get or create a checkpointer for a workflow."""
        key = f'{workflow_id}_{mode}'
        if key not in cls._instances:
            cls._instances[key] = get_checkpointer(mode=mode, **kwargs)
        return cls._instances[key]

    @classmethod
    def remove(cls, workflow_id: str, mode: str = 'memory'):
        """Remove a checkpointer instance."""
        key = f'{workflow_id}_{mode}'
        cls._instances.pop(key, None)
