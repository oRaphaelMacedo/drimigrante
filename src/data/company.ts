/**
 * Identificação legal da empresa (DI-009).
 *
 * Campos `null` NÃO são renderizados. Só o dono pode preenchê-los com os dados
 * reais (razão social, NIF e sede) — nunca invente nem use placeholder.
 */

export interface Company {
  /** Nome comercial exibido na interface. */
  readonly brandName: string
  /** Razão social / denominação registrada. */
  readonly legalName: string | null
  /** NIF (ou NIPC) da empresa. */
  readonly nif: string | null
  /** Endereço da sede. */
  readonly address: string | null
}

export const COMPANY: Company = {
  brandName: 'Doutor Imigrante',
  legalName: null,
  nif: null,
  address: null,
}

export type CompanyFieldKey = 'legalName' | 'nif' | 'address'

export interface CompanyField {
  readonly key: CompanyFieldKey
  readonly label: string
  readonly value: string
}

const FIELD_LABELS: ReadonlyArray<readonly [CompanyFieldKey, string]> = [
  ['legalName', 'Razão social'],
  ['nif', 'NIF'],
  ['address', 'Sede'],
]

const PLACEHOLDER = /^(a_preencher|todo|tbd|xxx+)$/i

/** `false` para null, vazio ou placeholder (ex.: 'A_PREENCHER'). */
export function isFilledValue(value: string | null | undefined): value is string {
  if (value == null) return false
  const trimmed = value.trim()
  return trimmed !== '' && !PLACEHOLDER.test(trimmed)
}

/** Linhas de identificação prontas para renderizar (só os campos preenchidos). */
export function getCompanyIdentification(company: Company = COMPANY): CompanyField[] {
  const fields: CompanyField[] = []
  for (const [key, label] of FIELD_LABELS) {
    const value = company[key]
    if (isFilledValue(value)) fields.push({ key, label, value: value.trim() })
  }
  return fields
}
