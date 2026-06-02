import re

with open("dpe_dic_full.html", "r", encoding="utf-8") as f:
    html = f.read()

# Find download-related patterns
# Look for API endpoints or S3 URLs
patterns = [
    r'https?://[^\s"\'<>]+\.(xlsx|csv|pdf|xls|doc|docx|zip)',
    r'https?://[^\s"\'<>]*download[^\s"\'<>]*',
    r'https?://[^\s"\'<>]*archivo[^\s"\'<>]*',
    r'https?://[^\s"\'<>]*s3[^\s"\'<>]*',
    r'https?://[^\s"\'<>]*backend[^\s"\'<>]*',
    r'https?://[^\s"\'<>]*api[^\s"\'<>]*file[^\s"\'<>]*',
]

print("=== FILE URL PATTERNS ===")
for pat in patterns:
    matches = re.findall(pat, html, re.IGNORECASE)
    if matches:
        for m in set(matches) if isinstance(matches[0], str) else matches:
            print(f"  {m}")

# Find the section with Transparencia activa content
# Look for numeral/literal patterns
print("\n=== NUMERAL/LITERAL TEXT ===")
numeral_matches = re.findall(r'(?:Numeral|Literal|Art[ií]culo)[^<]{0,200}', html, re.IGNORECASE)
for m in numeral_matches[:20]:
    print(f"  {m.strip()}")

# Look for onclick handlers or data attributes on the SVG links
print("\n=== HREF='#' LINK CONTEXT ===")
# Find a[href="#"] with surrounding context
hash_links = list(re.finditer(r'<a[^>]*href="#"[^>]*>(.{0,300}?)</a>', html, re.DOTALL))
print(f"Found {len(hash_links)} hash links")
# Show unique patterns (first 10)
seen = set()
for m in hash_links[:20]:
    full = m.group(0)[:200]
    # Get a signature
    sig = re.sub(r'[a-f0-9-]{36}', 'UUID', full)  # replace UUIDs
    if sig not in seen:
        seen.add(sig)
        print(f"  {full}")

# Look for JavaScript bundles or inline scripts
print("\n=== SCRIPT TAGS ===")
scripts = re.findall(r'<script[^>]*src="([^"]*)"', html)
for s in scripts:
    print(f"  {s}")

# Look for data attributes or JSON data embedded
print("\n=== DATA ATTRIBUTES ON LINKS ===")
data_links = re.findall(r'<a[^>]*(data-[a-z-]+="[^"]*")[^>]*>', html)
for d in data_links[:20]:
    print(f"  {d}")

# Find any fetch/axios API calls pattern in inline scripts
print("\n=== INLINE SCRIPTS ===")
inline_scripts = re.findall(r'<script>(.*?)</script>', html, re.DOTALL)
for s in inline_scripts:
    if len(s) > 50:
        print(f"  {s[:500]}")
