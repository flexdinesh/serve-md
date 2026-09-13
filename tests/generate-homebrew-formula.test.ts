import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

const execFileAsync = promisify(execFile)
const repositoryRoot = process.cwd()
const generatorPath = join(repositoryRoot, 'scripts', 'generate-homebrew-formula.ts')

interface FormulaWorkspace {
  checksumsPath: string
  outputPath: string
}

void test('generates a servef Homebrew formula from all release checksums', async (t) => {
  const workspace = await createFormulaWorkspace(t.after.bind(t))

  await writeChecksums(workspace.checksumsPath, completeChecksums())
  await runGenerator(workspace)

  const formula = await readFile(workspace.outputPath, 'utf8')

  assert.match(formula, /class Servef < Formula/)
  assert.match(formula, /homepage "https:\/\/github\.com\/flexdinesh\/servef"/)
  assert.match(formula, /version "0\.1\.0"/)
  assert.match(formula, /license "MIT"/)
  assert.match(
    formula,
    /releases\/download\/v0\.1\.0\/servef_0\.1\.0_darwin_amd64\.tar\.gz/,
  )
  assert.match(
    formula,
    /releases\/download\/v0\.1\.0\/servef_0\.1\.0_darwin_arm64\.tar\.gz/,
  )
  assert.match(
    formula,
    /releases\/download\/v0\.1\.0\/servef_0\.1\.0_linux_amd64\.tar\.gz/,
  )
  assert.match(
    formula,
    /releases\/download\/v0\.1\.0\/servef_0\.1\.0_linux_arm64\.tar\.gz/,
  )
  assert.match(formula, /sha256 "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"/)
  assert.match(formula, /sha256 "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"/)
  assert.match(formula, /sha256 "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"/)
  assert.match(formula, /sha256 "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"/)
  assert.match(formula, /bin\.install "servef"/)
  assert.match(formula, /assert_match "servef #\{version\}"/)
})

void test('fails on a malformed checksum line', async (t) => {
  const workspace = await createFormulaWorkspace(t.after.bind(t))
  await writeChecksums(workspace.checksumsPath, ['not-a-checksum  servef_0.1.0_darwin_amd64.tar.gz'])

  await assert.rejects(runGenerator(workspace), /invalid checksum line/)
})

void test('fails when a release archive checksum is missing', async (t) => {
  const workspace = await createFormulaWorkspace(t.after.bind(t))
  const checksums = completeChecksums().filter((line) => !line.includes('linux_arm64'))
  await writeChecksums(workspace.checksumsPath, checksums)

  await assert.rejects(
    runGenerator(workspace),
    /missing checksum for servef_0\.1\.0_linux_arm64\.tar\.gz/,
  )
})

void test('accepts a forwarded pnpm argument separator', async (t) => {
  const workspace = await createFormulaWorkspace(t.after.bind(t))
  await writeChecksums(workspace.checksumsPath, completeChecksums())

  await runGenerator(workspace, ['--'])

  assert.match(await readFile(workspace.outputPath, 'utf8'), /version "0\.1\.0"/)
})

void test('generates a formula with valid Ruby syntax', async (t) => {
  try {
    await execFileAsync('ruby', ['-v'])
  } catch {
    t.skip('ruby is not available')
    return
  }

  const workspace = await createFormulaWorkspace(t.after.bind(t))
  await writeChecksums(workspace.checksumsPath, completeChecksums())
  await runGenerator(workspace)

  const { stdout } = await execFileAsync('ruby', ['-c', workspace.outputPath])

  assert.match(stdout, /Syntax OK/)
})

async function createFormulaWorkspace(
  registerCleanup: (cleanup: () => Promise<void>) => void,
): Promise<FormulaWorkspace> {
  const testRoot = join(repositoryRoot, '.scratch', 'test-tmp')
  await mkdir(testRoot, { recursive: true })
  const dir = await mkdtemp(join(testRoot, 'servef-formula-'))
  registerCleanup(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  return {
    checksumsPath: join(dir, 'checksums.txt'),
    outputPath: join(dir, 'servef.rb'),
  }
}

function completeChecksums(): string[] {
  return [
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  servef_0.1.0_darwin_amd64.tar.gz',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb  servef_0.1.0_darwin_arm64.tar.gz',
    'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc  servef_0.1.0_linux_amd64.tar.gz',
    'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd  servef_0.1.0_linux_arm64.tar.gz',
  ]
}

async function writeChecksums(path: string, checksums: string[]): Promise<void> {
  await writeFile(path, `${checksums.join('\n')}\n`)
}

async function runGenerator(
  { checksumsPath, outputPath }: FormulaWorkspace,
  leadingArgs: string[] = [],
): Promise<void> {
  await execFileAsync('node', [
    generatorPath,
    ...leadingArgs,
    '--version',
    '0.1.0',
    '--tag',
    'v0.1.0',
    '--checksums',
    checksumsPath,
    '--output',
    outputPath,
  ])
}
