import { describe, expect, it } from 'vitest'
import { maskPhones, normalizePhone, parseAmount, parseBool, parsePositiveInt } from './values'

describe('数值', () => {
  it.each([
    [3, 3],
    ['3台', 3],
    ['90天', 90],
    [2.6, 3],
    ['0', null],
    ['', null],
    ['abc', null],
    [null, null],
  ])('parsePositiveInt(%j) = %j', (input, expected) => {
    expect(parsePositiveInt(input)).toBe(expected)
  })

  it.each([
    ['1,200', 1200],
    ['¥300.5', 300.5],
    ['120元', 120],
    [99.999, 100],
    ['', null],
    ['免费', null],
  ])('parseAmount(%j) = %j', (input, expected) => {
    expect(parseAmount(input)).toBe(expected)
  })
})

describe('是 / 否', () => {
  it.each([
    ['是', true],
    ['有', true],
    ['Y', true],
    ['√', true],
    ['否', false],
    ['无', false],
    ['', null],
    [null, null],
    [true, true],
    [0, false],
  ])('parseBool(%j) = %j', (input, expected) => {
    expect(parseBool(input)).toBe(expected)
  })
})

describe('电话', () => {
  it('数字形式的电话转成文本', () => {
    expect(normalizePhone(13800138000)).toBe('13800138000')
    expect(normalizePhone('13800138000.0')).toBe('13800138000')
    expect(normalizePhone(' 0755-89686238/13554715529 ')).toBe('0755-89686238/13554715529')
  })

  it('打码：手机号保留前 3 后 4，其他长数字保留前 2 后 2，短数字不变', () => {
    expect(maskPhones('13800001001')).toBe('138****1001')
    expect(maskPhones('0755-88001234/13800002001')).toBe('0755-88****34/138****2001')
    expect(maskPhones('紧急联系人 13700001111，A栋3楼')).toBe('紧急联系人 137****1111，A栋3楼')
    expect(maskPhones('型号 CY-2H 数量 25')).toBe('型号 CY-2H 数量 25')
  })
})
