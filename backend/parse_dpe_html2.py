import re

with open("dpe_dic_full.html", "r", encoding="utf-8") as f:
    html = f.read()

# The page content is in a single-line format. Let's find the section around "Numeral"
# and understand the table/grid structure for file downloads

# Search for "Numeral" and get 2000 chars of context around it
for m in re.finditer(r'Numeral', html):
    start = max(0, m.start() - 500)
    end = min(len(html), m.end() + 2000)
    context = html[start:end]
    print(f"=== CONTEXT around 'Numeral' at pos {m.start()} ===")
    print(context)
    print("\n" + "="*80 + "\n")
    break  # Just first occurrence

# Also look for the table structure
print("\n\n=== TABLE ELEMENTS ===")
tables = re.findall(r'<table[^>]*>(.*?)</table>', html, re.DOTALL)
print(f"Found {len(tables)} tables")
for i, t in enumerate(tables[:3]):
    print(f"\n--- Table {i} (first 1000 chars) ---")
    print(t[:1000])

# Look for "Conjunto" or "Metadatos" or "Diccionario" 
print("\n\n=== CONJUNTO/METADATOS/DICCIONARIO ===")
for keyword in ["Conjunto", "Metadatos", "Diccionario", "conjunto", "metadatos", "diccionario"]:
    matches = list(re.finditer(keyword, html, re.IGNORECASE))
    if matches:
        print(f"\nFound '{keyword}' {len(matches)} times")
        # Show context around first match
        m = matches[0]
        start = max(0, m.start() - 200)
        end = min(len(html), m.end() + 500)
        print(f"  Context: ...{html[start:end]}...")
