import { SysPartition } from '../util/partitions'

export enum FilterMode {
  Include = 'include',
  Exclude = 'exclude',
}

export interface SerializedFilters {
  mode: FilterMode

  match: string[]
  prefix: string[]
  suffix: string[]
  substring: string[]
  regex: string[]
}

export interface Filters {
  // true = inclusion list, false = exclusion list
  include: boolean

  match: Set<string>
  prefix: string[]
  suffix: string[]
  substring: string[]
  regex: RegExp[]
}

export type PartFilters = Record<SysPartition, Filters>

export function parseFilters(src: SerializedFilters) {
  return {
    include: src.mode == FilterMode.Include,

    match: new Set(src.match),
    prefix: src.prefix,
    suffix: src.suffix,
    substring: src.substring,
    regex: src.regex.map(pat => new RegExp(pat)),
  } as Filters
}

function _matchFilters(filters: Filters, value: string) {
  return (
    filters.match.has(value) ||
    filters.prefix.find(prefix => value.startsWith(prefix)) != undefined ||
    filters.suffix.find(suffix => value.endsWith(suffix)) != undefined ||
    filters.substring.find(substring => value.includes(substring)) != undefined ||
    filters.regex.find(regex => value.match(regex)) != null
  )
}

export function filterValue(filters: Filters, value: string) {
  return filters.include ? _matchFilters(filters, value) : !_matchFilters(filters, value)
}

export function filterValues(filters: Filters, values: string[]) {
  return values.filter(value => filterValue(filters, value))
}

// Map, in-place
export function filterKeys<Value>(filters: Filters, map: Map<string, Value>) {
  for (let key of map.keys()) {
    if (!filterValue(filters, key)) {
      map.delete(key)
    }
  }

  return map
}

// Map, copy
export function filterKeysCopy<Value>(filters: Filters, map: Map<string, Value>) {
  return new Map(Array.from(map.entries()).filter(([key]) => filterValue(filters, key)))
}
