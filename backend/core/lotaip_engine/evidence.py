from datetime import datetime, timezone

def record(kind, message, **data):
    return {"type": kind, "message": message, "data": data,
            "checked_at": datetime.now(timezone.utc).isoformat()}

def warning(code, message, **data):
    return {"code": code, "message": message, "data": data}
