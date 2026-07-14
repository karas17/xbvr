import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(path.resolve('ui/package.json'))
const vueCompiler = require('vue-template-compiler')

const sourceRoot = path.resolve('ui/src')
const localeDirectory = path.resolve('ui/src/locales')
const sourceFiles = []
const settingsRoot = path.resolve('ui/src/views/options')
const staticTranslationAttributes = new Set(['label', 'placeholder', 'title', 'aria-label'])
const allowedSettingsConstants = new Set([
  'DeoVR',
  'Heresphere',
  'http://',
  'https://',
  'javdatabase.com',
  'r18.dev',
  'javlibrary.com',
  'jav.land',
  'ID (xxxx-001)',
  'R18.dev:',
  'VRKM-139',
  '84vrkm00139',
  'TPDB URL',
  'eg https://localhost:9999/myfiles/xbvr-content-bundle.json'
])

function walk (directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      walk(entryPath)
    } else if (/\.(?:js|vue)$/.test(entry.name)) {
      sourceFiles.push(entryPath)
    }
  }
}

walk(sourceRoot)

const usedKeys = new Set()
const translationCall = /\$t\(\s*(['"`])([\s\S]*?)\1\s*[,)]/g

for (const sourceFile of sourceFiles) {
  const source = fs.readFileSync(sourceFile, 'utf8')
  for (const match of source.matchAll(translationCall)) {
    const key = match[2]
    if (!key.includes('${') && !key.includes('\n')) {
      usedKeys.add(key)
    }
  }
}

const locales = Object.fromEntries(
  fs.readdirSync(localeDirectory)
    .filter(file => file.endsWith('.json'))
    .map(file => [path.basename(file, '.json'), JSON.parse(fs.readFileSync(path.join(localeDirectory, file), 'utf8'))])
)

const missingKeys = Object.fromEntries(
  Object.entries(locales).map(([locale, messages]) => [
    locale,
    [...usedKeys].filter(key => !(key in messages)).sort()
  ])
)

const hardcodedSettingsText = []

function inspectSettingsNode (node, sourceFile) {
  if (!node) return
  if (node.type === 1) {
    for (const attribute of node.attrsList || []) {
      if (
        staticTranslationAttributes.has(attribute.name) &&
        /[A-Za-z]{2}/.test(attribute.value) &&
        !allowedSettingsConstants.has(attribute.value)
      ) {
        hardcodedSettingsText.push({ file: path.relative(process.cwd(), sourceFile), text: attribute.value })
      }
    }
    for (const child of node.children || []) inspectSettingsNode(child, sourceFile)
    for (const condition of node.ifConditions || []) {
      if (condition.block !== node) inspectSettingsNode(condition.block, sourceFile)
    }
  } else if (node.type === 3 && !node.isComment) {
    const text = node.text.replace(/\s+/g, ' ').trim()
    if (/[A-Za-z]{2}/.test(text) && !allowedSettingsConstants.has(text)) {
      hardcodedSettingsText.push({ file: path.relative(process.cwd(), sourceFile), text })
    }
  }
}

for (const sourceFile of sourceFiles.filter(file => file.startsWith(settingsRoot) && file.endsWith('.vue'))) {
  const source = fs.readFileSync(sourceFile, 'utf8')
  const component = vueCompiler.parseComponent(source)
  if (!component.template) continue
  const compiled = vueCompiler.compile(component.template.content.trim(), { comments: true })
  inspectSettingsNode(compiled.ast, sourceFile)
}

const uniqueHardcodedSettingsText = [...new Map(
  hardcodedSettingsText.map(item => [`${item.file}\0${item.text}`, item])
).values()]

console.log(JSON.stringify({
  sourceFiles: sourceFiles.length,
  usedKeys: usedKeys.size,
  localeKeys: Object.fromEntries(Object.entries(locales).map(([locale, messages]) => [locale, Object.keys(messages).length])),
  missingKeys,
  hardcodedSettingsText: uniqueHardcodedSettingsText
}, null, 2))

if (
  Object.values(missingKeys).some(keys => keys.length > 0) ||
  uniqueHardcodedSettingsText.length > 0
) {
  process.exitCode = 1
}
