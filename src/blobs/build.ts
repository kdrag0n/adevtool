import * as path from 'path'
import { promises as fs } from 'fs'

import { blobToFileCopy, BoardMakefile, ModulesMakefile, ProductMakefile, sanitizeBasename, Symlink } from '../build/make'
import { blobToSoongModule, SharedLibraryModule, SoongBlueprint, SoongModule, SPECIAL_FILE_EXTENSIONS } from '../build/soong'
import { BlobEntry, blobNeedsSoong } from './entry'

export interface BuildFiles {
  blueprint: SoongBlueprint
  modulesMakefile: ModulesMakefile
  productMakefile: ProductMakefile
  boardMakefile: BoardMakefile
}

function nameDepKey(entry: BlobEntry) {
  let ext = path.extname(entry.path)
  return `${ext == '.xml' ? 1 : 0}${entry.isNamedDependency ? 0 : 1}${entry.srcPath}`
}

export async function generateBuild(
  entries: Array<BlobEntry>,
  device: string,
  vendor: string,
  source: string,
  proprietaryDir: string,
) {
  // Re-sort entries to give priority to explicit named dependencies in name
  // conflict resolution. XMLs are also de-prioritized because they have
  // filename_from_src.
  entries = Array.from(entries).sort((a, b) => nameDepKey(a).localeCompare(nameDepKey(b)))

  // Fast lookup for other arch libs
  let entrySrcPaths = new Set(entries.map(e => e.srcPath))

  // Create Soong modules, Make rules, and symlink modules
  let copyFiles = []
  let symlinks = []
  let namedModules = new Map<string, SoongModule>()
  let conflictCounters = new Map<string, number>()
  for (let entry of entries) {
    let ext = path.extname(entry.path)
    let pathParts = entry.path.split('/')
    let srcPath = `${source}/${entry.srcPath}`
    let stat = await fs.lstat(srcPath)

    if (stat.isSymbolicLink()) {
      // Symlink -> Make module, regardless of file extension

      let targetPath = await fs.readlink(srcPath)
      let moduleName = `symlink__${sanitizeBasename(entry.path)}__${sanitizeBasename(targetPath)}`

      // Resolve conflicts
      if (namedModules.has(moduleName)) {
        let conflictNum = (conflictCounters.get(moduleName) ?? 1) + 1
        conflictCounters.set(moduleName, conflictNum)
        moduleName += `__${conflictNum}`
      }

      // Create link info
      symlinks.push({
        moduleName: moduleName,
        linkPartition: entry.partition,
        linkSubpath: entry.path,
        targetPath: targetPath,
      } as Symlink)
    } else if (blobNeedsSoong(entry, ext)) {
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

  let buildPackages = Array.from(namedModules.keys())
  buildPackages.push(...symlinks.map(l => l.moduleName))

  return {
    blueprint: {
      imports: [],
      modules: namedModules.values(),
    },
    modulesMakefile: {
      device: device,
      vendor: vendor,
      symlinks: symlinks,
    },
    productMakefile: {
      namespaces: [proprietaryDir],
      packages: buildPackages,
      copyFiles: copyFiles,
    },
    boardMakefile: {},
  } as BuildFiles
}
