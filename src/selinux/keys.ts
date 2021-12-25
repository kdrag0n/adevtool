import { promises as fs } from 'fs'
import path from 'path'
import xml2js from 'xml2js'

import { exists, listFilesRecursive, readFile } from '../util/fs'
import { parseLines } from '../util/parse'
import { EXT_SYS_PARTITIONS } from '../util/partitions'

export interface MacSigner {
  cert: string | Uint8Array
  seinfoId: string
}

export interface KeyInfo {
  keyId: string
  certPaths: Map<string, string>
}

function parseHex(hex: string) {
  let buf = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    buf[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }

  return buf
}

async function parseMacPermissions(xml: string) {
  let doc = await xml2js.parseStringPromise(xml)
  let signers = []

  if (doc.policy) {
    for (let {
      $: { signature: rawSig },
      seinfo: [
        {
          $: { value: seinfoId },
        },
      ],
    } of doc.policy.signer) {
      // Parse base64 cert or leave it as a reference
      let cert = rawSig.startsWith('@') ? rawSig.slice(1) : parseHex(rawSig)
      signers.push({
        cert,
        seinfoId,
      } as MacSigner)
    }
  }

  return signers
}

export async function readMacPermissionsRecursive(root: string) {
  let signers = []
  for await (let file of listFilesRecursive(root)) {
    if (path.basename(file) === 'mac_permissions.xml') {
      let xml = await readFile(file)
      signers.push(...(await parseMacPermissions(xml)))
    }
  }

  return signers
}

export async function readPartMacPermissions(root: string) {
  let signers = []
  for (let partition of EXT_SYS_PARTITIONS) {
    let path = `${root}/${partition}/etc/selinux/${partition}_mac_permissions.xml`
    if (!(await exists(path))) {
      continue
    }

    let xml = await readFile(path)
    signers.push(...(await parseMacPermissions(xml)))
  }

  return signers
}

function parseKeysConf(conf: string) {
  let curKeyId: string | null = null
  let curPaths: Map<string, string> | null = null

  let keys = []
  for (let line of parseLines(conf)) {
    let startBlock = line.match(/^\[@(.+)\]$/)
    if (startBlock !== undefined) {
      // Finish last block
      if (curKeyId !== null) {
        keys.push({
          keyId: curKeyId,
          certPaths: curPaths!,
        } as KeyInfo)
      }

      curKeyId = startBlock[1]
      curPaths = new Map<string, string>()
      continue
    }

    let pathLine = line.match(/^(.+)\s*:\s*(.+)$/)
    if (pathLine !== undefined) {
      let [_, buildType, path] = pathLine
      if (curPaths !== null) {
        curPaths.set(buildType, path)
      }
    }
  }

  // Finish last block
  if (curKeyId !== null) {
    keys.push({
      keyId: curKeyId,
      certPaths: curPaths!,
    } as KeyInfo)
  }

  return keys
}

export async function readKeysConfRecursive(root: string) {
  let keys = []
  for await (let file of listFilesRecursive(root)) {
    if (path.basename(file) === 'keys.conf') {
      let xml = await readFile(file)
      keys.push(...parseKeysConf(xml))
    }
  }

  return keys
}

export function resolveKeys(
  srcKeys: Array<KeyInfo>,
  srcMacPerms: Array<MacSigner>,
  compiledMacPerms: Array<MacSigner>,
) {
  // Build key ID -> paths map
  let keyToPaths = new Map(srcKeys.map(k => [k.keyId, Array.from(k.certPaths.values())]))

  // Build seinfo -> paths map
  let seinfoToPaths = new Map(
    srcMacPerms.filter(s => typeof s.cert === 'string').map(s => [s.seinfoId, keyToPaths.get(s.cert as string)!]),
  )

  // Build cert -> paths map
  return new Map(
    compiledMacPerms
      .filter(s => seinfoToPaths.has(s.seinfoId) && s.cert instanceof Uint8Array)
      .map(s => [s.cert as Uint8Array, seinfoToPaths.get(s.seinfoId)!]),
  )
}

function serializeCert(cert: Uint8Array, lineLength: number) {
  let base64 = Buffer.from(cert).toString('base64')
  let wrapped = base64.replace(new RegExp(`(.{${lineLength}})`, 'g'), '$1\n')

  return `-----BEGIN CERTIFICATE-----
${wrapped}
-----END CERTIFICATE-----
`
}

export async function writeMappedKeys(keys: Map<Uint8Array, Iterable<string>>) {
  for (let [cert, paths] of keys.entries()) {
    for (let path of paths) {
      let lineLength = (await readFile(path)).split('\n')[1].length
      let serialized = serializeCert(cert, lineLength)

      await fs.writeFile(path, serialized)
    }
  }
}
