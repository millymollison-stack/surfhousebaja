with open('src/export/AdminSidebarBundle.tsx', 'r') as f:
    c = f.read()

# Add debug logging to ContactSection onChange handlers
old1 = '? <input type="text" value={fields.full_name} onChange={e => onChange(p => ({ ...p, full_name: e.target.value }))} className="sb-input" />'
new1 = '? <input type="text" value={fields.full_name} onChange={e => { console.log("[ContactSection] full_name changed to:", e.target.value); onChange(p => ({ ...p, full_name: e.target.value })); }} className="sb-input" />'
if old1 in c:
    print('found full_name onChange')
    c = c.replace(old1, new1, 1)
else:
    print('NOT found full_name onChange')

old2 = '? <input type="tel" value={fields.phone_number} onChange={e => onChange(p => ({ ...p, phone_number: e.target.value }))} className="sb-input" />'
new2 = '? <input type="tel" value={fields.phone_number} onChange={e => { console.log("[ContactSection] phone_number changed to:", e.target.value); onChange(p => ({ ...p, phone_number: e.target.value })); }} className="sb-input" />'
if old2 in c:
    print('found phone_number onChange')
    c = c.replace(old2, new2, 1)
else:
    print('NOT found phone_number onChange')

open('src/export/AdminSidebarBundle.tsx', 'w').write(c)
print('done')
