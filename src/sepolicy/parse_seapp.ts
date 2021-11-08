export interface SeappContext {
  user: string
  seinfo?: string
  isPrivApp?: boolean
  name: string
  domain: string
  type?: string
  levelFrom: string
}

export function parseSeappContexts(seappContexts: string) {
  let contexts = []
  for (let line of seappContexts.split('\n')) {
    // Ignore comments and empty/blank lines
    if (line.length == 0 || line.startsWith('#') || line.match(/^\s*$/)) {
      continue
    }

    // Parse key-value fields
    let rawContext: { [key: string]: string } = {}
    for (let kv of line.trim().split(/\s+/)) {
      let [key, value] = kv.split('=')
      rawContext[key] = value
    }

    // Cast directly to object
    contexts.push(rawContext as unknown as SeappContext)
  }

  return contexts
}
