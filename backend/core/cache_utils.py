from django.core.cache import cache


STATS_CACHE_VERSION_KEY = "system_stats:version"


def stats_cache_key(period_id=None, month=None):
    version = cache.get(STATS_CACHE_VERSION_KEY, 1)
    return f"system_stats:v{version}:{period_id or 'all'}:{month or 'all'}"


def invalidate_dashboard_cache():
    try:
        cache.incr(STATS_CACHE_VERSION_KEY)
    except ValueError:
        cache.set(STATS_CACHE_VERSION_KEY, 2, None)
