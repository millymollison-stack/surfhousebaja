with open('src/components/OnboardingPopup.tsx', 'r') as f:
    content = f.read()

# The closing }); has NO leading spaces in this function
old = ('});\n'
       ' // Auto-open popup when scraped data arrives - but NOT for active subscribers and NOT if user explicitly closed it')
new = ('});\n'
       ' // Populate description field so user can edit it immediately after scrape\n'
       " setWebsiteDesc(scrapedProperty.property_intro || scrapedProperty.description || '');\n"
       ' // Auto-open popup when scraped data arrives - but NOT for active subscribers and NOT if user explicitly closed it')

if old in content:
    print('FOUND — applying fix')
    content = content.replace(old, new, 1)
    open('src/components/OnboardingPopup.tsx', 'w').write(content)
    print('Done')
else:
    print('NOT FOUND')
    idx = content.find('});')
    print(repr(content[idx:idx+100]))
