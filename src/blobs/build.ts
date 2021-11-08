import * as path from 'path'

import { blobToFileCopy, BoardMakefile, ProductMakefile } from '../build/make'
import { blobToSoongModule, SharedLibraryModule, SoongBlueprint, SoongModule, SPECIAL_FILE_EXTENSIONS } from '../build/soong'
import { BlobEntry, blobNeedsSoong } from './entry'

export interface BuildFiles {
  blueprint: SoongBlueprint,
  productMakefile: ProductMakefile
  boardMakefile: BoardMakefile
}

function nameDepKey(entry: BlobEntry) {
  let ext = path.extname(entry.path)
  return `${ext == '.xml' ? 1 : 0}${entry.isNamedDependency ? 0 : 1}${entry.srcPath}`
}

export async function generateBuild(
  entries: Array<BlobEntry>,
  vendor: string,
  proprietaryDir: string,
) {
  // Re-sort entries to give priority to explicit named dependencies in name
  // conflict resolution. XMLs are also de-prioritized because they have
  // filename_from_src.
  entries = Array.from(entries).sort((a, b) => nameDepKey(a).localeCompare(nameDepKey(b)))

  // Fast lookup for other arch libs
  let entrySrcPaths = new Set(entries.map(e => e.srcPath))

  // Create Soong modules and Make rules
  let copyFiles = []
  let namedModules = new Map<string, SoongModule>()
  let conflictCounters = new Map<string, number>()
  for (let entry of entries) {
    let ext = path.extname(entry.path)
    let pathParts = entry.path.split('/')

    if (blobNeedsSoong(entry, ext)) {
      // Named dependencies -> Soong blueprint

      // Module name = file name, excluding extension if it was used
      let baseExt = SPECIAL_FILE_EXTENSIONS.has(ext) ? ext : undefined
      let name = path.basename(entry.path, baseExt)

      // If already exists: skip if it's the other arch variant of a library in
      // the same partition AND has the same name (incl. ext), otherwise rename the
      // module to avoid conflict
      if (namedModules.has(name)) {
        let conflictModule = namedModules.get(name)!
        if (conflictModule._type == 'cc_prebuilt_library_shared' &&
              (conflictModule as SharedLibraryModule).compile_multilib == 'both' &&
              conflictModule._entry?.partition == entry.partition &&
              conflictModule._entry?.path.split('/').at(-1) == pathParts.at(-1)) {
          continue
        }

        // Increment conflict counter and append to name
        let conflictNum = (conflictCounters.get(name) ?? 1) + 1
        conflictCounters.set(name, conflictNum)
        name += `__${conflictNum}`
      }

      let module = blobToSoongModule(name, ext, vendor, entry, entrySrcPaths)
      namedModules.set(name, module)
    } else {
      // Other files -> Kati Makefile

      // Simple PRODUCT_COPY_FILES line
      copyFiles.push(blobToFileCopy(entry, proprietaryDir))
    }
  }

  return {
    blueprint: {
      imports: [],
      modules: namedModules.values(),
    },
    productMakefile: {
      namespaces: [proprietaryDir],
      packages: Array.from(namedModules.keys()),
      copyFiles: copyFiles,
    },
    boardMakefile: {},
  } as BuildFiles
}
