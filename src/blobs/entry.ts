import { EXT_PARTITIONS } from '../partitions';

export interface BlobEntry {
  partition: string
  path: string
  srcPath: string
  isPresigned: boolean
  isNamedDependency: boolean
}

export function partPathToSrcPath(partition: string, path: string) {
  if (EXT_PARTITIONS.has(partition)) {
    return `${partition}/${path}`
  } else {
    // system
    return path
  }
}

export function blobNeedsSoong(entry: BlobEntry, ext: string) {
  // Explicit named dependency = Soong
  if (entry.isNamedDependency) {
    return true
  }

  // On Android 12, Soong is required for ELF files (executables and libraries)
  // TODO: re-enable this after fixing cross-partition conflict resolution
  /*if (entry.path.startsWith('bin/') || ext == '.so') {
    return true
  }*/

  // Soong is also required for APKs, framework JARs, and vintf XMLs
  if (ext == '.apk' || ext == '.jar' ||
        (entry.path.startsWith('etc/vintf/') && ext == '.xml')) {
    return true
  }

  // Otherwise, just copy the file
  return false
}
