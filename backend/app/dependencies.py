"""Dependencies for route modules."""

# Global storage reference - set during startup
_storage = None


def get_storage():
    """Dependency to get the storage instance."""
    if _storage is None:
        raise RuntimeError("Storage not initialized")
    return _storage


def set_storage(storage):
    """Set the global storage instance (called during startup)."""
    global _storage
    _storage = storage
