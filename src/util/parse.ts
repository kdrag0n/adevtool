export function* parseLines(lines: string) {
  for (let line of lines.split('\n')) {
    // Ignore comments and empty/blank lines
    if (line.length == 0 || line.startsWith('#') || line.match(/^\s*$/)) {
      continue
    }

    yield line.trim()
  }
}
