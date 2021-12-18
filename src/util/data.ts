export function setIntersection<Value>(a: Set<Value>, b: Set<Value>) {
  let set = new Set<Value>()
  for (let value of a) {
    if (b.has(value)) {
      set.add(value)
    }
  }
  return set
}

export function setDifference<Value>(a: Set<Value>, b: Set<Value>) {
  let set = new Set<Value>()
  for (let value of a) {
    if (!b.has(value)) {
      set.add(value)
    }
  }
  return set
}
