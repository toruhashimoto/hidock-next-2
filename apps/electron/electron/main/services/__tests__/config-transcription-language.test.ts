/**
 * transcription.language default (2026-09-24): the installed app transcribed
 * Japanese meetings as Spanish. The profile's transcription section never had
 * a `language` key (Settings has no control for it), so loading merged in the
 * default, which was 'es'. This fork's default is Japanese.
 *
 * Executed through the real load/merge path, like the other config tests: the
 * question is what initializeConfig makes of a profile on disk.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, afterAll } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdirSync, rmSync, writeFileSync } from 'fs'

function testUserDataDir(): string {
  return join(tmpdir(), `hidock-config-transcription-language-test-${process.pid}`)
}

vi.mock('electron', () => {
  const dir = testUserDataDir()
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  return {
    app: { getPath: () => testUserDataDir() },
    safeStorage: { isEncryptionAvailable: () => false },
  }
})

afterAll(() => {
  rmSync(testUserDataDir(), { recursive: true, force: true })
})

vi.mock('../brains/brain-credential-store', () => ({
  getBrainCredentialStore: () => ({
    hasSecret: () => false,
    getSecret: () => null,
    setSecret: () => true,
  }),
}))

import { getConfig, initializeConfig } from '../config'

function writeSavedConfig(transcription: Record<string, unknown>): void {
  writeFileSync(join(testUserDataDir(), 'config.json'), JSON.stringify({ transcription }), 'utf-8')
}

describe('transcription.language default', () => {
  it('loads a profile that never saved a transcription language as Japanese', async () => {
    // The affected profile: local ASR set up through Settings, no language key.
    writeSavedConfig({ provider: 'local-asr', localAsrPath: 'D:\\Apps\\hidock-next\\scripts\\jp\\local-asr' })
    await initializeConfig()
    expect(getConfig().transcription.language).toBe('ja')
  })

  it('keeps a language the profile did save', async () => {
    writeSavedConfig({ provider: 'local-asr', language: 'en' })
    await initializeConfig()
    expect(getConfig().transcription.language).toBe('en')
  })
})
