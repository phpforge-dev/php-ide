from pathlib import Path
import re,json
FILES=['style.css','workbench.css','theme-surfaces.css','islands-shell.css','tool-windows.css']
PATTERNS={
'git':r'(?:[.#]line-diff[\w-]*|[.#]git-[\w-]+|[.#]merge-[\w-]+|[.#]account-[\w-]+|#show-(?:git|commit))',
'docker-services':r'(?:[.#]docker-[\w-]+|\.services-[\w-]+|#show-docker)',
'agents':r'[.#]agent-[\w-]+',
'terminal':r'(?:[.#]terminal-[\w-]+|\.xterm[\w-]*|#show-terminal)',
'database':r'(?:[.#](?:db|ds|sql|redis|driver|connection|datasources|data)-[\w-]+|\.database-[\w-]+|\.null-value)',
'php-intelligence':r'(?:\.php-(?:gutter|unused|hierarchy)[\w-]*|\.refactor-[\w-]+)',
'svg-preview':r'(?:#svg-(?:preview|toolbar)|\.svg-[\w-]+)',
'image-preview':r'(?:#image-preview|\.image-(?:tools|viewport|stage|info|error)[\w-]*)'
}

def selectors(text):
 out=[];start=0;depth=0;quote=None;escape=False
 for i,c in enumerate(text):
  if escape:escape=False;continue
  if c=='\\':escape=True;continue
  if quote:
   if c==quote:quote=None
   continue
  if c in "\"'":quote=c;continue
  if c in '([':depth+=1
  elif c in ')]':depth-=1
  elif c==',' and depth==0:out.append(text[start:i].strip());start=i+1
 out.append(text[start:].strip());return out

def owner(selector):
 for key,pattern in PATTERNS.items():
  if re.search(pattern,selector):return key
 return None

def walk(text):
 out=[];owned={key:[] for key in PATTERNS};offset=0
 while offset<len(text):
  brace=text.find('{',offset)
  if brace<0:out.append(text[offset:]);break
  head=text[offset:brace];depth=1;at=brace+1;quote=None;escape=False
  while at<len(text) and depth:
   c=text[at]
   if escape:escape=False
   elif c=='\\':escape=True
   elif quote:
    if c==quote:quote=None
   elif c in "\"'":quote=c
   elif c=='{':depth+=1
   elif c=='}':depth-=1
   at+=1
  assert depth==0,'Unbalanced CSS rule'
  body=text[brace+1:at-1];clean=re.sub(r'/\*.*?\*/','',head,flags=re.S).strip()
  if clean.startswith('@media') or clean.startswith('@supports'):
   remainder,nested=walk(body)
   if remainder.strip():out.append(head+'{'+remainder+'}')
   for key,pieces in nested.items():
    if pieces:owned[key].append(clean+'{'+''.join(pieces)+'}')
  elif clean.startswith('@'):out.append(head+'{'+body+'}')
  else:
   keep=[];groups={key:[] for key in PATTERNS}
   for selector in selectors(clean):
    key=owner(selector)
    if key:groups[key].append(selector)
    else:keep.append(selector)
   if keep:out.append(','.join(keep)+'{'+body+'}')
   for key,group in groups.items():
    if group:owned[key].append(','.join(group)+'{'+body+'}')
  offset=at
 return '\n'.join(out),owned

if __name__=='__main__':
 result={key:[] for key in PATTERNS};residual={}
 for name in FILES:
  path=Path(__file__).resolve().parents[2]/'src'/name
  rest,parts=walk(path.read_text());residual[name]=rest
  for key,rules in parts.items():result[key].extend(rules)
 print(json.dumps({key:{'rules':len(rules),'bytes':len('\n'.join(rules))} for key,rules in result.items()},indent=2))
 Path('/tmp/ide-owned-css.json').write_text(json.dumps(result))
 Path('/tmp/ide-residual-css.json').write_text(json.dumps(residual))
