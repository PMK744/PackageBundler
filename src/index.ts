import type { File, Folder } from './types'

import fs from 'fs'
import zlib from 'zlib'
import { resolve, join } from 'path'

class PackageBundler {
  private readonly files: Map<string, File>
  private readonly folders: Map<string, Folder>

  public constructor() {
    this.files = new Map<string, File>()
    this.folders = new Map<string, Folder>()
  }

  public addFile(name: string, type: string, code: string): void {
    this.files.set(name, { name, type, code })
  }

  public addFolder(name: string, files: File[], path?: string): void {
    this.folders.set(name, { name, files, path })
  }

  public bundle(path: string, type: 'string' | 'bin', compression = true): void {
    switch (type) {
      case 'string':
        fs.writeFileSync(resolve(path), this.toString())
        break
      case 'bin':
        fs.writeFileSync(resolve(path), this.toBuffer(compression))
        break
    }
  }

  public extract(path: string): void {
    const output = resolve(path)
    for (const [, folder] of this.folders) {
      fs.mkdirSync(resolve(output, folder?.path ?? folder.name), { recursive: true })
      for (const file of folder.files) {
        const code = file.code
        switch (file.type) {
          case 'json':
            fs.writeFileSync(resolve(output, folder?.path ?? folder.name, `${file.name}.json`), code)
            break
          case 'js':
            fs.writeFileSync(resolve(output, folder?.path ?? folder.name, `${file.name}.js`), code)
            break
          case 'ts':
            fs.writeFileSync(resolve(output, folder?.path ?? folder.name, `${file.name}.ts`), code)
            break
        }
      }
    }
    for (const [name, file] of this.files) {
      const code = file.code
      switch (file.type) {
        case 'json':
          fs.writeFileSync(resolve(output, `${name}.json`), code)
          break
        case 'js':
          fs.writeFileSync(resolve(output, `${name}.js`), code)
          break
        case 'ts':
          fs.writeFileSync(resolve(output, `${name}.ts`), code)
          break
      }
    }
  }

  public toString(): string {
    let code = ''
    for (const [name, file] of this.files) {
      code += `<<name=${name} type=${file.type}>>\n<<${file.code}>>\n`
    }

    for (const [name, folder] of this.folders) {
      if (!folder.path) {
        code += `<<name=${name} type=folder>>\n`
      } else {
        const split = folder.path.split('/')
        code += `<<name=${name} type=folder folder=${split[split.length - 2]}>>\n`
      }
      for (const file of folder.files) {
        code += `<<name=${file.name} type=${file.type} folder=${name}>>\n<<${file.code}>>\n`
      }
    }

    return code
  }

  public toBuffer(compression = true): Buffer {
    if (compression) return zlib.deflateSync(this.toString())
    return Buffer.from(this.toString())
  }

  static fromString(string: string): PackageBundler {
    const match = string.match(/\<<([\s\S]*?)\>>/g).map(item => item.replace(/\<<|\>>/g, ''))
    const plugin = new PackageBundler()
    for (const element of match) {
      if (!element.includes('name=')) continue
      const name = element.split('name=')[1]?.split(' ')[0]
      const type = element.split('type=')[1]?.split(' ')[0]
      const folder = element.split('folder=')[1]?.split(' ')[0]
      if (type === 'folder' && !folder) {
        plugin.folders.set(name, { name, files: [] })
      } else if (type === 'folder' && folder) {
        const parent = plugin.folders.get(folder)
        plugin.folders.set(name, { name, files: [], path: `${parent?.path ?? parent.name}/${name}` })
      } else if (folder) {
        const index = match.indexOf(element)
        const code = match[index + 1]
        plugin.folders.get(folder)?.files.push({ name, type, code })
      } else {
        const index = match.indexOf(element)
        const code = match[index + 1]
        plugin.files.set(name, { name, type, code })
      }
    }

    return plugin
  }

  static fromBuffer(buffer: Buffer): PackageBundler {
    return PackageBundler.fromString(zlib.inflateSync(buffer).toString())
  }

  static fromPath(path: string): PackageBundler {
    const plugin = new PackageBundler()
    const dir = [...PackageBundler.readAllFiles(resolve(path))]
    const folders = dir.filter(file => fs.lstatSync(file).isDirectory())
    const files = dir.filter(file => fs.lstatSync(file).isFile())
    for (const folder of folders) {
      const trim = folder.replace(resolve(path), '').substring(1)
      const split = trim.split('\\')
      const last = split[split.length - 1]
      if (split.length === 1) {
        plugin.folders.set(last, { name: last, files: [] })
      } else {
        plugin.folders.set(last, { name: last, files: [], path: trim.replace(/\\/g, '/') })
      }
    }
    for (const file of files) {
      const trim = file.replace(resolve(path), '').substring(1)
      const split = trim.split('\\')
      const last = split[split.length - 1]
      const code = fs.readFileSync(file, 'utf-8')
      if (split.length === 1) {
        const name = last.split('.')[0]
        plugin.files.set(name, { name: name, type: last.split('.')[1], code })
      } else {
        const folder = split[split.length - 2]
        plugin.folders.get(folder)?.files.push({ name: last.split('.')[0], type: last.split('.')[1], code })
      }
    }

    return plugin
  }

  static* readAllFiles(dir: string): Generator<string> {
    const files = fs.readdirSync(dir, { withFileTypes: true })
  
    for (const file of files) {
      if (file.isDirectory()) {
        yield join(dir, file.name)
        yield* PackageBundler.readAllFiles(join(dir, file.name))
      } else {
        yield join(dir, file.name)
      }
    }
  }
}

export {
  PackageBundler,
}
