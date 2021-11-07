import { EXT_PARTITIONS } from "../partitions";

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
