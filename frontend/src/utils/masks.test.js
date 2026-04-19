import { describe, it, expect } from 'vitest'
import {
  maskPhone, maskCpf, maskCnpj, maskCpfCnpj, maskCep, maskState,
  maskCurrencyBRL, parseCurrencyBRL, formatCurrencyBRL,
  maskPercent, maskInteger, maskDateBR, formatDateBR, onlyDigits
} from './masks'

describe('onlyDigits', () => {
  it('extrai apenas dígitos', () => {
    expect(onlyDigits('abc123def')).toBe('123')
    expect(onlyDigits('(11) 99999-8888')).toBe('11999998888')
    expect(onlyDigits(null)).toBe('')
  })
})

describe('maskPhone', () => {
  it('formata celular 11 dígitos', () => {
    expect(maskPhone('11987654321')).toBe('(11) 98765-4321')
  })
  it('formata telefone fixo 10 dígitos', () => {
    expect(maskPhone('1133334444')).toBe('(11) 3333-4444')
  })
  it('formata parcial', () => {
    expect(maskPhone('11')).toBe('(11')
    expect(maskPhone('119')).toBe('(11) 9')
  })
  it('corta excesso em 11 dígitos', () => {
    expect(maskPhone('119876543210000')).toBe('(11) 98765-4321')
  })
})

describe('maskCpf / maskCnpj / maskCpfCnpj', () => {
  it('CPF completo', () => {
    expect(maskCpf('12345678909')).toBe('123.456.789-09')
  })
  it('CNPJ completo', () => {
    expect(maskCnpj('12345678000195')).toBe('12.345.678/0001-95')
  })
  it('CPF/CNPJ escolhe por comprimento', () => {
    expect(maskCpfCnpj('12345678909')).toBe('123.456.789-09')
    expect(maskCpfCnpj('12345678000195')).toBe('12.345.678/0001-95')
  })
})

describe('maskCep / maskState', () => {
  it('CEP', () => expect(maskCep('01310100')).toBe('01310-100'))
  it('Estado em maiúsculas, 2 chars', () => {
    expect(maskState('sp')).toBe('SP')
    expect(maskState('São Paulo')).toBe('SO')
  })
})

describe('moeda BRL', () => {
  it('maskCurrencyBRL formata inteiros como centavos', () => {
    expect(maskCurrencyBRL('10000')).toBe('100,00')
    expect(maskCurrencyBRL('50')).toBe('0,50')
  })
  it('parseCurrencyBRL retorna string decimal', () => {
    expect(parseCurrencyBRL('10000')).toBe('100.00')
    expect(parseCurrencyBRL('')).toBe('')
  })
  it('formatCurrencyBRL inclui prefixo R$', () => {
    const r = formatCurrencyBRL(123.45)
    expect(r).toContain('123,45')
    expect(r).toContain('R$')
  })
})

describe('maskPercent / maskInteger / maskDateBR', () => {
  it('percent aceita 2 casas decimais', () => {
    expect(maskPercent('10.55')).toBe('10.55')
    expect(maskPercent('abc10,5')).toBe('10.5')
  })
  it('integer só dígitos', () => {
    expect(maskInteger('abc12.3')).toBe('123')
  })
  it('maskDateBR progressivo', () => {
    expect(maskDateBR('31')).toBe('31')
    expect(maskDateBR('3112')).toBe('31/12')
    expect(maskDateBR('31122024')).toBe('31/12/2024')
  })
})

describe('formatDateBR', () => {
  it('ISO com hora vira dd/mm/yyyy', () => {
    expect(formatDateBR('2026-04-18T12:00:00')).toMatch(/18\/04\/2026/)
  })
  it('nulo retorna vazio', () => {
    expect(formatDateBR('')).toBe('')
    expect(formatDateBR(null)).toBe('')
  })
})
