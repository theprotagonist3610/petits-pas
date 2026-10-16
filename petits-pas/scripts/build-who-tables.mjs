// Convertit les tables LMS de l'OMS (package WHO `anthro`) en JSON compacts pour l'application.
// Usage : node scripts/build-who-tables.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const TABLES = {
  weianthro: 'weight-for-age',
  lenanthro: 'length-height-for-age',
  hcanthro: 'head-for-age',
  acanthro: 'muac-for-age',
}

for (const [source, target] of Object.entries(TABLES)) {
  const rows = readFileSync(new URL(`./who-data/${source}.txt`, import.meta.url), 'utf8')
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split('\t'))

  const out = {}
  for (const [sex, age, l, m, s] of rows) {
    const key = sex === '1' ? 'male' : 'female'
    const table = (out[key] ??= { start: Number(age), l: [], m: [], s: [] })
    // Les âges doivent être consécutifs (un jour par ligne).
    if (Number(age) !== table.start + table.m.length) throw new Error(`${source}: âge ${age} non consécutif`)
    table.l.push(Number(l))
    table.m.push(Number(m))
    table.s.push(Number(s))
  }

  writeFileSync(new URL(`../src/reference/who/${target}.json`, import.meta.url), JSON.stringify(out))
  console.log(`${target}.json — ${rows.length} lignes`)
}
