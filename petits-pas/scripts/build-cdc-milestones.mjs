// Fusionne les étapes CDC (anglais, source cdc.gov) et leur traduction française.
// Usage : node scripts/build-cdc-milestones.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { FR } from './cdc-data/fr.mjs'

const DOMAINS = ['social', 'language', 'cognitive', 'movement']
const en = JSON.parse(readFileSync(new URL('./cdc-data/cdc-milestones.en.json', import.meta.url), 'utf8'))

const out = []
for (const checkpoint of en) {
  for (const domain of DOMAINS) {
    const fr = FR[checkpoint.months]?.[domain] ?? []
    if (fr.length !== checkpoint[domain].length) {
      throw new Error(`${checkpoint.months} mois / ${domain} : ${checkpoint[domain].length} étapes CDC, ${fr.length} traduites`)
    }
    checkpoint[domain].forEach((text, i) => {
      const adapted = fr[i].startsWith('*')
      out.push({
        id: `cdc-${checkpoint.months}m-${domain}-${i + 1}`,
        months: checkpoint.months,
        domain,
        fr: adapted ? fr[i].slice(1) : fr[i],
        en: text,
        ...(adapted && { adapted: true }),
      })
    })
  }
}

writeFileSync(new URL('../src/reference/milestones/cdc.json', import.meta.url), JSON.stringify(out, null, 1))
console.log(`${out.length} étapes CDC, dont ${out.filter((m) => m.adapted).length} adaptées`)
