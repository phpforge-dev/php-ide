"""Vendor only individual SVGs with an explicit Apache-2.0 notice. No binary extraction."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import urllib.request, json, hashlib
COMMIT = 'd8c6714c7a3c110c56994d6b0f10814f902100e7'
BASE = f'https://raw.githubusercontent.com/JetBrains/intellij-community/{COMMIT}/'
TARGET = Path(__file__).resolve().parent.parent / 'src/assets/jetbrains-icons'
PATHS = [f'platform/icons/src/expui/{group}/{name}{variant}.svg'
 for group,names in {
 'nodes':['folder','sourceRoot','testRoot','libraryFolder','excludeRoot','resourcesRoot','folderGithub','logFolder','class','interface','enum'],
 'fileTypes':['text','anyType','json','javaScript','typeScript','css','html','markdown','yaml','xml','sql','shell','config','archive','image','docker','editorConfig','toml','csv'],
 # Shell Islands (recorte 28): faixas de tool windows, barra superior e status bar.
 'toolwindows':['project','commit','structure','services','debug','run','find','problems','vcs','notifications','toolWindowAskAI','bookmarks'],
 'general':['chevronDown','chevronRight','moreVertical','hide','settings','search','close','closeSmall','locked','unlocked','add','refresh','filter','collapseAll','expandAll','locate','exit','moreHorizontal'],
 'run':['run','debug','stop'],
 }.items() for name in names for variant in (['', '_dark', '@20x20', '@20x20_dark'] if group=='toolwindows' else ['', '_dark'])]
PATHS += [f'plugins/terminal/resources/icons/expui/toolwindow/terminal{variant}.svg' for variant in ['', '_dark', '@20x20', '@20x20_dark']]
def fetch(path):
 data=urllib.request.urlopen(BASE+path).read()
 if b'Apache 2.0 license' not in data:
  print('Excluded without explicit license: '+path); return None
 local='/'.join(path.split('/')[-2:]);file=TARGET/local;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(data)
 return {'file':local,'source':BASE+path,'sha256':hashlib.sha256(data).hexdigest(),'license':'Apache-2.0'}
if __name__ == '__main__':
 TARGET.mkdir(parents=True,exist_ok=True)
 entries=[entry for entry in ThreadPoolExecutor(max_workers=8).map(fetch,PATHS) if entry]
 (TARGET/'manifest.json').write_text(json.dumps({'repository':'https://github.com/JetBrains/intellij-community','commit':COMMIT,'icons':entries},indent=2)+'\n')
 (TARGET/'LICENSE.txt').write_bytes(urllib.request.urlopen('https://www.apache.org/licenses/LICENSE-2.0.txt').read())
 (TARGET/'NOTICE.txt').write_bytes(urllib.request.urlopen(BASE+'NOTICE.txt').read())
 print(f'{len(entries)} individually licensed SVGs vendored at {COMMIT}')
