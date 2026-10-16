import { describe, expect, it } from 'vitest'
import weight from '@/reference/who/weight-for-age.json'
import length from '@/reference/who/length-height-for-age.json'
import { lmsAt, normalCdf, percentile, valueAtZ, zScore, type LmsSeries } from './lms'

const boysWeight = weight.male as LmsSeries
const girlsLength = length.female as LmsSeries

describe('tables OMS', () => {
  it('retrouve les médianes publiées à la naissance', () => {
    expect(lmsAt(boysWeight, 0)!.m).toBeCloseTo(3.3464, 4)
    expect(lmsAt(girlsLength, 0)!.m).toBeCloseTo(49.1477, 4)
  })

  it('retrouve les seuils publiés des tables OMS (poids garçons, 0 mois : -2 ET = 2,5 kg ; +2 ET = 4,4 kg)', () => {
    const lms = lmsAt(boysWeight, 0)!
    expect(valueAtZ(lms, -2)).toBeCloseTo(2.5, 1)
    expect(valueAtZ(lms, 2)).toBeCloseTo(4.4, 1)
  })

  it('renvoie undefined hors de la plage 0–1826 jours', () => {
    expect(lmsAt(boysWeight, -1)).toBeUndefined()
    expect(lmsAt(boysWeight, 1827)).toBeUndefined()
  })
})

describe('zScore', () => {
  const lms = lmsAt(boysWeight, 365)!

  it('vaut 0 à la médiane et inverse valueAtZ', () => {
    expect(zScore(lms, lms.m, true)).toBeCloseTo(0, 6)
    for (const z of [-2.5, -1, 1, 2.5]) expect(zScore(lms, valueAtZ(lms, z), true)).toBeCloseTo(z, 6)
  })

  it('applique la correction OMS au-delà de ±3 ET, de façon continue', () => {
    expect(zScore(lms, valueAtZ(lms, 3), true)).toBeCloseTo(3, 6)
    expect(zScore(lms, valueAtZ(lms, -3), true)).toBeCloseTo(-3, 6)
    // Au-delà, l'écart entre +2 et +3 ET sert d'unité.
    const sd2 = valueAtZ(lms, 2)
    const sd3 = valueAtZ(lms, 3)
    expect(zScore(lms, sd3 + (sd3 - sd2), true)).toBeCloseTo(4, 6)
  })
})

describe('percentile', () => {
  it('convertit les z-scores des courbes affichées', () => {
    expect(percentile(0)).toBe(50)
    expect(percentile(-1.8)).toBe(4)
    expect(percentile(-2)).toBe(2.2) // jamais arrondi à « 3e » sous la courbe du 3e percentile
    expect(percentile(2)).toBe(97.8)
    expect(percentile(1.036)).toBe(85)
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 4)
  })
  it('borne les extrêmes', () => {
    expect(percentile(-6)).toBe(0.1)
    expect(percentile(6)).toBe(99.9)
  })
})
