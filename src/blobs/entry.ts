export interface BlobEntry {
  partition: string
  path: string
  srcPath: string
  isPresigned: boolean
  isNamedDependency: boolean
}
