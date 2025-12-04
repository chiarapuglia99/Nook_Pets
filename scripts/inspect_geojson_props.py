import json
from pathlib import Path

base = Path('D:/Progetti/Nook_Pets/animali_qgis/geojson')
for fname in ['animali_malati.geojson', 'zone_pericolose.geojson']:
    p = base / fname
    if not p.exists():
        print('Missing', fname)
        continue
    print('\n---', fname, '---')
    with p.open('r', encoding='utf-8') as f:
        data = json.load(f)
    feats = data.get('features', [])
    print('Features count:', len(feats))
    if feats:
        props = feats[0].get('properties', {})
        print('Sample prop keys:', list(props.keys())[:30])
        for k, v in list(props.items())[:30]:
            print(' ', k, ':', str(v)[:100])
    else:
        print('No features')

