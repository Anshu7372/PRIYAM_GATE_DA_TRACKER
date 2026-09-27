"""Bundle index.html + css + js into one HTML file for publishing as a claude.ai artifact.
Usage: python3 tools/build_artifact.py OUT.html"""
import re, sys
root = __file__.rsplit('/tools/', 1)[0]
html = open(f'{root}/index.html').read()
body = html.split('<body>')[1].split('</body>')[0]
scripts = re.findall(r'<script src="([^"]+)"></script>', body)
body = re.sub(r'<script src="[^"]+"></script>\s*', '', body)
css = open(f'{root}/css/style.css').read()
js = ''.join('<script>\n' + open(f'{root}/{s}').read().replace('</script', '<\\/script') + '\n</script>\n' for s in scripts)
out = '<title>GATE DA 2027 Tracker</title>\n<style>\n' + css + '\n</style>\n' + body + '\n' + js
open(sys.argv[1], 'w').write(out)
print(sys.argv[1], len(out), 'bytes;', 'scripts:', scripts)
