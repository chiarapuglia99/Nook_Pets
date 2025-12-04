from pathlib import Path
p=Path('D:/Progetti/Nook_Pets/front-end/template/app.js')
s=p.read_text(encoding='utf-8').splitlines()
for i in range(460,520):
    if i < len(s):
        print(f"{i+1:4}: {s[i]}")
    else:
        print(f"{i+1:4}: <no line>")

