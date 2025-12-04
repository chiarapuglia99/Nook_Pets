from pathlib import Path
s = Path('D:/Progetti/Nook_Pets/front-end/template/app.js').read_text(encoding='utf-8')
stack=[]
pairs={'{':'}','(':')','[':']'}
line_no=1
for i,ch in enumerate(s):
    if ch=='\n':
        line_no+=1
    if ch in pairs:
        stack.append((ch,line_no))
    elif ch in pairs.values():
        if not stack:
            print('Unmatched closing',ch,'at line',line_no)
            break
        last,ln=stack.pop()
        if pairs[last]!=ch:
            print('Mismatched',last,'at',ln,'closed by',ch,'at',line_no)
            break
else:
    if stack:
        print('Unclosed tokens remain:', stack[:5])
    else:
        print('All balanced')

