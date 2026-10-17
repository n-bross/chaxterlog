import zipfile, xml.etree.ElementTree as ET, json
from datetime import datetime, timedelta

excel_path = '/home/hermes/t3code/userdata/attachments/89142106-2bee-44de-b554-70656e1a06a0-d32faf5d-3b1f-4a9b-812e-ec35f161c000-xlsx.xlsx'

with zipfile.ZipFile(excel_path) as z:
    shared_strings = []
    if 'xl/sharedStrings.xml' in z.namelist():
        tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
        ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        for si in tree.findall('.//s:si', ns):
            text = ''.join(t.text for t in si.findall('.//s:t', ns) if t.text)
            shared_strings.append(text)

    ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

    def get_val(c):
        t = c.attrib.get('t')
        v = c.find('s:v', ns)
        if v is None or not v.text:
            return None
        if t == 's':
            return shared_strings[int(v.text)]
        return v.text

    stree2 = ET.fromstring(z.read('xl/worksheets/sheet2.xml'))
    items = []
    for r in stree2.findall('.//s:row', ns):
        row_num = int(r.attrib['r'])
        if row_num < 5:
            continue
        cells = {}
        for c in r.findall('s:c', ns):
            col_letter = ''.join(filter(str.isalpha, c.attrib['r']))
            cells[col_letter] = get_val(c)
        
        date_serial = cells.get('A')
        if not date_serial:
            continue
        try:
            dt = datetime(1899, 12, 30) + timedelta(days=float(date_serial))
            date_str = dt.strftime('%Y-%m-%d')
        except ValueError:
            continue
        
        raw = cells.get('I')
        if not raw:
            continue
        
        parts = [p.strip() for p in raw.split(';') if p.strip()]
        unique_parts = []
        for p in parts:
            if p not in unique_parts:
                unique_parts.append(p)
        
        title = unique_parts[0]
        desc_parts = unique_parts[1:]
        
        randzahl = cells.get('G')
        diff = cells.get('H')
        extra_note = []
        if randzahl is not None and randzahl != '':
            extra_note.append(f'Randzahl: {randzahl}')
        if diff is not None and diff != '' and diff != '0':
            extra_note.append(f'Differenz Striche: {diff}')
        
        if extra_note:
            desc_parts.append(', '.join(extra_note))
            
        desc = '; '.join(desc_parts) if desc_parts else None
        
        items.append({
            'date': date_str,
            'title': title,
            'description': desc
        })

    print(json.dumps(items))
