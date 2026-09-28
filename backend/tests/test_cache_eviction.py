"""Test cache eviction and bounds."""
import time
from app.cache import Cache, get_cache, invalidate_analytics_cache


def test_cache_ttl_expiry():
    """Test that entries expire after TTL."""
    cache = Cache(default_ttl=1, max_size=10)  # 1 second TTL
    
    # Set a value
    cache.set("test_key", "test_value", ttl=1)
    
    # Should be available immediately
    assert cache.get("test_key") == "test_value"
    
    # Wait for TTL to expire
    time.sleep(1.1)
    
    # Should be expired
    assert cache.get("test_key") is None


def test_cache_lru_eviction():
    """Test that LRU eviction works when max_size is reached."""
    cache = Cache(default_ttl=60, max_size=3)  # Small max size
    
    # Fill cache to max size
    cache.set("key1", "value1")
    cache.set("key2", "value2")
    cache.set("key3", "value3")
    
    assert len(cache) == 3
    
    # Access key1 to make it recently used
    cache.get("key1")
    
    # Add one more - should evict least recently used (key2)
    cache.set("key4", "value4")
    
    assert len(cache) == 3
    assert cache.get("key1") == "value1"  # Recently used, should remain
    assert cache.get("key2") is None  # Evicted
    assert cache.get("key3") == "value3"  # Should remain
    assert cache.get("key4") == "value4"  # New entry


def test_cache_proactive_expiry():
    """Test that set() proactively removes expired entries."""
    cache = Cache(default_ttl=1, max_size=10)
    
    # Set a value with 1 second TTL
    cache.set("expire_soon", "value", ttl=1)
    
    # Wait for it to expire
    time.sleep(1.1)
    
    # Set a new value - should clean up expired entry
    cache.set("new_key", "new_value")
    
    # Expired entry should be gone
    assert cache.get("expire_soon") is None
    assert cache.get("new_key") == "new_value"


def test_cache_invalidation():
    """Test that analytics cache can be invalidated."""
    cache = get_cache()
    
    # Set some cache entries
    cache.set("test_key1", "value1")
    cache.set("test_key2", "value2")
    
    assert len(cache) > 0
    
    # Invalidate cache
    invalidate_analytics_cache()
    
    # Cache should be empty
    assert len(cache) == 0


def test_cache_max_size_enforcement():
    """Test that cache never exceeds max_size."""
    cache = Cache(default_ttl=60, max_size=5)
    
    # Add many entries
    for i in range(20):
        cache.set(f"key{i}", f"value{i}")
    
    # Should never exceed max_size
    assert len(cache) <= 5