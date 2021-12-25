import { EXT_PARTITIONS } from '../util/partitions'

export interface BlobEntry {
  // Android partition
  partition: string
  // Sub-partition path
  path: string
  // Combined partition path without "system/"
  srcPath: string

  // Path to copy file from on host (default = srcDir/srcPath)
  diskSrcPath?: string

  // Whether to keep the original signature (for APKs only)
  isPresigned: boolean
  // Whether to force creating a named dependency module
  isNamedDependency: boolean

  // Whether to force Kati
  disableSoong?: boolean
}

export function partPathToSrcPath(partition: string, path: string) {
  if (EXT_PARTITIONS.has(partition)) {
    return `${partition}/${path}`
  }
  // system
  return path
}

export function srcPathToPartPath(srcPath: string) {
  let pathParts = srcPath.split('/')
  let partition = pathParts[0]
  let path: string
  if (EXT_PARTITIONS.has(partition)) {
    path = pathParts.slice(1).join('/')
  } else {
    partition = 'system'
    path = srcPath
  }

  return [partition, path]
}

export function blobNeedsSoong(entry: BlobEntry, ext: string) {
  // Force-disable flag takes precedence
  if (entry.disableSoong) {
    return false
  }

  // Explicit named dependency = Soong
  if (entry.isNamedDependency) {
    return true
  }

  // On Android 12, Soong is required for ELF files (executables and libraries)
  if (entry.path.startsWith('bin/') || ext === '.so') {
    return true
  }

  // Soong is also required for APKs, framework JARs, and vintf XMLs
  if (ext === '.apk' || ext === '.jar' || (entry.path.startsWith('etc/vintf/') && ext === '.xml')) {
    return true
  }

  // Force Soong for APEXs to make them work better with flattened APEX builds.
  if (ext === '.apex') {
    return true
  }

  // Otherwise, just copy the file
  return false
}
