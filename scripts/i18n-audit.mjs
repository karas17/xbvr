import fs from 'node:fs'
import path from 'node:path'

const sourceRoot = path.resolve('ui/src')
const localeDirectory = path.resolve('ui/src/locales')
const sourceFiles = []

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

console.log(JSON.stringify({
  sourceFiles: sourceFiles.length,
  usedKeys: usedKeys.size,
  localeKeys: Object.fromEntries(Object.entries(locales).map(([locale, messages]) => [locale, Object.keys(messages).length])),
  missingKeys
}, null, 2))

if (Object.values(missingKeys).some(keys => keys.length > 0)) {
  process.exitCode = 1
}
