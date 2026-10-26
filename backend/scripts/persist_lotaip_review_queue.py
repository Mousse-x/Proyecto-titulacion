"""Persiste explícitamente la cola de revisión de la ejecución real V2.1."""
import json, os, re, sys
from pathlib import Path
BASE=Path(__file__).resolve().parents[1]; sys.path.insert(0,str(BASE)); os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings')
import django; django.setup()
from django.utils import timezone
from core.models import Evidence, LotaipEvaluationRun, LotaipLinkReview
from core.lotaip_engine.parsers import parse_csv
from core.lotaip_engine.rules import ENGINE_VERSION, LEGAL_SOURCE

def main():
    report=json.loads((BASE.parent/'tmp/lotaip-real-espoch-2024-11-v2.1.json').read_text(encoding='utf8'))
    url_map={}
    for ev in Evidence.objects.filter(university_id=6,period_id=4,month=11).select_related('indicator'):
        parsed=parse_csv(ev)
        for row_no,row in enumerate(parsed.get('rows',[])[1:],2):
            for col_no,value in enumerate(row):
                for url in re.findall(r'https?://[^\s\"\'<>;,]+',str(value)):
                    url_map.setdefault(url.rstrip(','),(ev.indicator.code,row_no,parsed.get('headers',[""])[col_no] if col_no<len(parsed.get('headers',[])) else ''))
    run=LotaipEvaluationRun.objects.filter(university_id=6,period_id=4,month=11,engine_version=ENGINE_VERSION,
        link_reviews__isnull=True).order_by('-id').first() or LotaipEvaluationRun.objects.create(
        university_id=6,period_id=4,month=11,status=LotaipEvaluationRun.Status.COMPLETED_REVIEWS,
        engine_version=ENGINE_VERSION,legal_source=LEGAL_SOURCE,result=report,started_at=timezone.now(),completed_at=timezone.now())
    items=[]
    for link in report['link_details']:
        if link['state']!='REQUIERE_REVISION': continue
        code,row,field=url_map.get(link['url'],('LOTAIP-0',None,'')); numeral=int(code.removeprefix('LOTAIP-').split('.')[0])
        reason='ACCESS_INDETERMINATE_403' if link['status_code']==403 else 'HTTP_200_CORRESPONDENCE_UNDETERMINED'
        items.append(LotaipLinkReview(run=run,numeral=numeral,format_code=code,row_number=row,field_name=field,
            original_url=link['url'],final_url=link.get('final_url',''),http_status=link.get('status_code'),reason_code=reason,
            expected_identifiers=link.get('expected_identifiers',[]),automatic_evidence=link,
            automatic_decision=link['result']))
    LotaipLinkReview.objects.bulk_create(items)
    print(json.dumps({'run_id':run.id,'queued':len(items)}))
if __name__=='__main__': main()
