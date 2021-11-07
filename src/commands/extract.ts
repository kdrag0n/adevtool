import {Command, flags} from '@oclif/command'
import {promises as fs} from 'fs'
import * as path from 'path'
import * as chalk from 'chalk'
import * as ora from 'ora'
import * as util from 'util'

// Excluding system
const PARTITIONS = new Set(['system_ext', 'product', 'vendor'])

interface BlobEntry {
  partition: string
  path: string
  srcPath: string
  isPresigned: boolean
  isNamedDependency: boolean
}

interface TargetSrcs {
  srcs: Array<string>
}

interface PrebuiltLibraryModule {
  strip: {
    none: boolean
  }
  target: {
    android_arm?: TargetSrcs
    android_arm64?: TargetSrcs
  }
  compile_multilib: string
  check_elf_files: boolean
  prefer: boolean
}

interface ApkModule {
  apk: string
  certificate?: string
  presigned?: boolean
  privileged?: boolean
  dex_preopt: {
    enabled: boolean
  }
}

interface JarModule {
  jars: Array<string>
}

interface EtcXmlModule {
  src: string
  filename_from_src: boolean
  sub_dir: string
}

type ModuleSpecific = {
  // Type is mandatory initially, but this is deleted for serialization
  _type?: string
} & (
  PrebuiltLibraryModule |
  ApkModule |
  JarModule |
  EtcXmlModule
)

type Module = {
  name: string
  owner: string
  system_ext_specific?: boolean
  product_specific?: boolean
  soc_specific?: boolean
} & ModuleSpecific

async function parseList(listPath: string) {
  let list = await fs.readFile(listPath, {encoding: 'utf8'})
  let entries = []

  for (let line of list.split('\n')) {
    // Ignore comments and empty/blank lines
    if (line.length == 0 || line.startsWith('#') || line.match(/^\s*$/)) {
      continue
    }

    // Split into path and flags first, ignoring whitespace
    let [srcPath, postModifiers] = line.trim().split(';')
    let modifiers = (postModifiers ?? '').split('|')

    // Parse "named dependency" flag (preceding -)
    let isNamedDependency = srcPath.startsWith('-')
    if (isNamedDependency) {
      srcPath = srcPath.slice(1)
    }

    // Split path into partition and sub-partition path
    let pathParts = srcPath.split('/')
    let partition = pathParts[0]
    if (!PARTITIONS.has(partition)) {
      partition = 'system'
    }
    let path = pathParts.slice(1).join('/')

    entries.push({
      partition: partition,
      path: path,
      srcPath: srcPath,
      isPresigned: modifiers.includes('PRESIGNED'),
      isNamedDependency: isNamedDependency,
    } as BlobEntry)
  }

  // Sort by source path
  return entries.sort((a, b) => a.srcPath.localeCompare(b.srcPath))
}

async function copyBlobs(entries: Array<BlobEntry>, srcDir: string, outDir: string) {
  let spinner = ora({
    prefixText: chalk.bold(chalk.greenBright('Copying blobs')),
    color: 'green',
  }).start()

  for (let entry of entries) {
    spinner.text = entry.srcPath

    let outPath = `${outDir}/${entry.srcPath}`
    await fs.mkdir(path.dirname(outPath), {recursive: true})

    // Some files need patching
    let srcPath = `${srcDir}/${entry.srcPath}`
    if (entry.path.endsWith('.xml')) {
      let xml = await fs.readFile(srcPath, {encoding: 'utf8'})
      // Fix Qualcomm "version 2.0" XMLs
      if (xml.startsWith('<?xml version="2.0"')) {
        let patched = xml.replace(/^<\?xml version="2.0"/, '<?xml version="1.0"')
        await fs.writeFile(outPath, patched)
        continue
      }
    }

    await fs.copyFile(srcPath, outPath)
  }

  spinner.stopAndPersist()
}

async function generateBuild(
  entries: Array<BlobEntry>,
  vendor: string,
  device: string,
  outDir: string,
  proprietaryDir: string,
) {
  // Fast lookup for libs
  let entrySrcPaths = new Set(entries.map(e => e.srcPath))

  let copyFiles = []
  let namedModules = new Map<string, Module>()
  for (let entry of entries) {
    if (entry.isNamedDependency) {
      // Named dependencies -> Soong blueprint

      // Module name = file name
      let ext = path.extname(entry.path)
      let name = path.basename(entry.path, ext)
      let moduleSrcPath = `proprietary/${entry.srcPath}`

      // Skip if already done (e.g. other lib arch)
      if (namedModules.has(name)) {
        continue
      }

      // Type and info is based on file extension
      let moduleSpecific: ModuleSpecific
      if (ext == '.so') {
        // Extract architecture from lib dir
        let pathParts = entry.srcPath.split('/')
        let libDir = pathParts.at(-2)
        let curArch: string
        if (libDir == 'lib') {
          curArch = '32'
        } else {
          // Assume 64-bit native if not lib/lib64
          curArch = '64'
        }
        let arch = curArch

        // Check for the other arch
        let otherLibDir = arch == '32' ? 'lib64' : 'lib'
        let otherSrcPath = [
          // Preceding parts
          ...pathParts.slice(0, -2),
          // lib / lib64
          otherLibDir,
          // Trailing part (file name)
          pathParts.at(-1),
        ].join('/')
        if (entrySrcPaths.has(otherSrcPath)) {
          // Both archs are present
          arch = 'both'
        }

        // For single arch
        let targetSrcs = {
          srcs: [moduleSrcPath],
        } as TargetSrcs

        // For multi arch
        let targetSrcs32 = (curArch == '32') ? targetSrcs : {
          srcs: [`proprietary/${otherSrcPath}`],
        } as TargetSrcs
        let targetSrcs64 = (curArch == '64') ? targetSrcs : {
          srcs: [`proprietary/${otherSrcPath}`],
        } as TargetSrcs

        moduleSpecific = {
          _type: 'cc_prebuilt_library_shared',
          strip: {
            none: true,
          },
          target: {
            ...(arch == '32' && { android_arm: targetSrcs }),
            ...(arch == '64' && { android_arm64: targetSrcs }),
            ...(arch == 'both' && {
              android_arm: targetSrcs32,
              android_arm64: targetSrcs64,
            }),
          },
          compile_multilib: arch,
          check_elf_files: false,
          prefer: true,
        }
      } else if (ext == '.apk') {
        moduleSpecific = {
          _type: 'android_app_import',
          apk: moduleSrcPath,
          ...(entry.isPresigned && { presigned: true } || { certificate: 'platform' }),
          ...(entry.path.startsWith('priv-app/') && { privileged: true }),
          dex_preopt: {
            enabled: false,
          },
        }
      } else if (ext == '.jar') {
        moduleSpecific = {
          _type: 'dex_import',
          jars: [moduleSrcPath],
        }
      } else if (ext == '.xml') {
        // Only etc/ XMLs are supported for now
        let pathParts = entry.path.split('/')
        if (pathParts[0] != 'etc') {
          throw new Error(`XML file ${entry.srcPath} is not in etc/`)
        }

        moduleSpecific = {
          _type: 'prebuilt_etc_xml',
          src: moduleSrcPath,
          filename_from_src: true,
          sub_dir: pathParts.slice(1).join('/'),
        }
      } else {
        throw new Error(`File ${entry.srcPath} has unknown extension ${ext}`)
      }

      let module = {
        name: name,
        owner: vendor,
        ...moduleSpecific,

        // Partition flag
        ...(entry.partition == 'system_ext' && { system_ext_specific: true }),
        ...(entry.partition == 'product' && { product_specific: true }),
        ...(entry.partition == 'vendor' && { soc_specific: true }),
      } as Module

      namedModules.set(name, module)
    } else {
      // Other files -> Kati Makefile

      // Simple PRODUCT_COPY_FILES line
      let copyPart = entry.partition.toUpperCase()
      copyFiles.push(`${proprietaryDir}/${entry.srcPath}:$(TARGET_COPY_OUT_${copyPart})/${entry.path}`)
    }
  }

  // Soong pass 2: serialize module objects
  let serializedModules = []
  for (let module of namedModules.values()) {
    // Type prepended to Soong module props, so remove it from the object
    let type = module._type;
    delete module._type;

    // Initial serialization pass. Node.js util.inspect happens to be identical to Soong format.
    let serialized = util.inspect(module, {
      depth: Infinity,
      maxArrayLength: Infinity,
      maxStringLength: Infinity,
    })

    // ' -> "
    serialized = serialized.replaceAll("'", '"')
    // 4-space indentation
    serialized = serialized.replaceAll('  ', '    ')
    // Prepend type
    serialized = `${type} ${serialized}`
    // Add trailing comma to last prop
    let serialLines = serialized.split('\n')
    serialLines[serialLines.length - 2] = serialLines.at(-2) + ','
    serialized = serialLines.join('\n')

    serializedModules.push(serialized)
  }

  let blueprint = `// Generated by adevtool, do not edit

soong_namespace {
}

${serializedModules.join('\n\n')}
`

  let makefile = `# Generated by adevtool, do not edit

PRODUCT_SOONG_NAMESPACES += \\
    ${outDir}

PRODUCT_COPY_FILES += \\
    ${copyFiles.join(' \\\n    ')}
`

  fs.writeFile(`${outDir}/Android.bp`, blueprint)
  fs.writeFile(`${outDir}/${device}-vendor.mk`, makefile)
}

export default class Extract extends Command {
  static description = 'extract proprietary blobs'

  static flags = {
    help: flags.help({char: 'h'}),
    vendor: flags.string({char: 'v', description: 'device vendor/OEM name', required: true}),
    device: flags.string({char: 'd', description: 'device codename', required: true}),
    source: flags.string({char: 's', description: 'path to mounted factory images', required: true}),
  }

  static args = [{name: 'list'}]

  async run() {
    let {args: {list}, flags: {vendor, device, source}} = this.parse(Extract)

    // Parse list
    this.log(chalk.bold(chalk.greenBright('Parsing list')))
    let entries = await parseList(list)

    // Prepare output directories
    let outDir = `vendor/${vendor}/${device}`
    await fs.rm(outDir, {force: true, recursive: true})
    await fs.mkdir(outDir, {recursive: true})
    let proprietaryDir = `${outDir}/proprietary`
    await fs.mkdir(proprietaryDir, {recursive: true})

    // Copy blobs
    //await copyBlobs(entries, source, proprietaryDir)

    // Generate build files
    this.log(chalk.bold(chalk.greenBright('Generating build files')))
    await generateBuild(entries, vendor, device, outDir, proprietaryDir)
  }
}
