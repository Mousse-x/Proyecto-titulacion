from decimal import Decimal

EXCLUDED = {None, "NOT_APPLICABLE", "SIN EVALUACIÓN", "REQUIERE_REVISION", "TECHNICAL_ERROR", "PENDIENTE"}

def numeric(value):
    if value in EXCLUDED: return None
    if value == "SI": return Decimal("1")
    if value == "NO": return Decimal("0")
    return Decimal(str(value))

def mean(values):
    usable = [numeric(v) for v in values]
    usable = [v for v in usable if v is not None]
    return sum(usable, Decimal("0")) / len(usable) if usable else None

def summarize(evaluations):
    groups = {key: [] for key in ("cta", "eta", "rp", "verificables", "vigencia", "validez")}
    revisions = errors = 0
    for item in evaluations:
        for key, result in item.get("criteria", {}).items():
            status = result.get("status")
            if status == "REQUIERE_REVISION": revisions += 1
            if status in {"TECHNICAL_ERROR", "PENDIENTE"}: errors += 1
            score = result.get("score")
            groups[key].append(score if score is not None else status)
    cta, eta, rp = (mean(groups[k]) for k in ("cta", "eta", "rp"))
    ci = mean(groups["verificables"] + groups["vigencia"] + groups["validez"])
    sita = mean([cta, eta, rp, ci]) if all(v is not None for v in (cta, eta, rp, ci)) else None
    pct = lambda value: float((value * 100).quantize(Decimal("0.01"))) if value is not None else None
    pending_states = {None, "REQUIERE_REVISION", "TECHNICAL_ERROR", "PENDIENTE"}
    pending_quality = [v for k in ("verificables", "vigencia", "validez") for v in groups[k] if v in pending_states]
    resolved_quality = [numeric(v) for k in ("verificables", "vigencia", "validez") for v in groups[k]]
    resolved_quality = [v for v in resolved_quality if v is not None]
    minimum_ci = mean(resolved_quality + [Decimal("0")] * len(pending_quality))
    maximum_ci = mean(resolved_quality + [Decimal("1")] * len(pending_quality))
    def bound(key, fill):
        return mean([fill if v in pending_states else v for v in groups[key]])
    minimum_parts = [bound(k, 0) for k in ('cta', 'eta', 'rp')] + [minimum_ci]
    maximum_parts = [bound(k, 1) for k in ('cta', 'eta', 'rp')] + [maximum_ci]
    minimum_sita = mean(minimum_parts) if all(v is not None for v in minimum_parts) else None
    maximum_sita = mean(maximum_parts) if all(v is not None for v in maximum_parts) else None
    provisional = any(v in pending_states for values in groups.values() for v in values)
    return {"CTA": pct(cta), "ETA": pct(eta), "RP": pct(rp), "CI": pct(ci), "SITA": pct(sita),
            "CI_status": "CI_PROVISIONAL" if pending_quality else "CI_DEFINITIVO",
            "SITA_status": "SITA_PROVISIONAL" if provisional or sita is None else "SITA_DEFINITIVO",
            "SITA_min": pct(minimum_sita), "SITA_max": pct(maximum_sita),
            "formats_evaluated": len(evaluations), "requires_review": revisions, "technical_errors": errors,
            "formula": "SITA = (CTA + ETA + RP + CI) / 4"}
