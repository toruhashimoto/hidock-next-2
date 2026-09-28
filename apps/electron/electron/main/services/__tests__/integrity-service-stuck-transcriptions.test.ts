// @vitest-environment node
/**
 * Integrity service — "reset stuck transcriptions" leaves the live job alone.
 *
 * Ported with upstream #41 (sgeraldes/hidock-next-2). The repair exists for
 * rows a crashed run left behind, and it runs after the window paints. By then
 * a new recording may already be transcribing in this process; putting its row
 * back to pending hid the running job and let it be queued a second time.
 *
 * Runs against a real temp-file SQLite database, like database.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { existsSync, rmSync } from 'fs'

const paths = vi.hoisted(() => ({ db: '' }))
paths.db = join(tmpdir(), `hidock-integrity-stuck-${process.pid}-${Date.now()}.db`)
vi.mock('../file-storage', () => ({
  getDatabasePath: () => paths.db,
  getRecordingsPath: () => join(tmpdir(), 'hidock-integrity-stuck-recordings')
}))

import {
  initializeDatabase,
  closeDatabase,
  run,
  queryOne,
  addToQueue,
  updateQueueItem,
  runWithMassDeleteAllowed
} from '../database'
import { getIntegrityService } from '../integrity-service'
import { setActiveTranscription } from '../transcription-activity'

function cleanupDbFiles(base: string): void {
  for (const suffix of ['', '-wal', '-shm', '.tmp']) {
    if (existsSync(`${base}${suffix}`)) rmSync(`${base}${suffix}`, { force: true })
  }
}

function seedTranscribingRecording(id: string): void {
  run(
    `INSERT INTO recordings
       (id, filename, file_path, date_recorded, status, location,
        transcription_status, on_device, on_local, source, is_imported)
     VALUES (?, ?, NULL, '2026-09-24T08:00:00.000Z', 'transcribing', 'local-only', 'none', 0, 1, 'hidock', 0)`,
    [id, `${id}.hda`]
  )
}

function recordingStatus(id: string): string | undefined {
  return queryOne<{ status: string }>('SELECT status FROM recordings WHERE id = ?', [id])?.status
}

function queueStatus(queueItemId: string): string | undefined {
  return queryOne<{ status: string }>('SELECT status FROM transcription_queue WHERE id = ?', [queueItemId])?.status
}

describe('IntegrityService.resetStuckTranscriptions()', () => {
  beforeAll(async () => {
    cleanupDbFiles(paths.db)
    await initializeDatabase()
  })

  afterAll(() => {
    try {
      closeDatabase()
    } catch {
      /* already closed */
    }
    cleanupDbFiles(paths.db)
  })

  beforeEach(() => {
    setActiveTranscription(null)
    runWithMassDeleteAllowed(() => {
      run('DELETE FROM transcription_queue')
      run('DELETE FROM recordings')
    })
  })

  it('leaves the recording this process is transcribing alone', () => {
    seedTranscribingRecording('rec-live')
    seedTranscribingRecording('rec-dead')
    const live = addToQueue('rec-live')
    const dead = addToQueue('rec-dead')
    updateQueueItem(live, 'processing')
    updateQueueItem(dead, 'processing')
    setActiveTranscription('rec-live')

    // One stuck recording and one stuck queue row: rec-dead's.
    expect(getIntegrityService().resetStuckTranscriptions()).toEqual({ found: 2, fixed: 2 })
    expect(recordingStatus('rec-live')).toBe('transcribing')
    expect(queueStatus(live)).toBe('processing')
    expect(recordingStatus('rec-dead')).toBe('pending')
    expect(queueStatus(dead)).toBe('pending')
  })

  it('with nothing transcribing, resets every stuck row', () => {
    seedTranscribingRecording('rec-1')
    seedTranscribingRecording('rec-2')
    const q1 = addToQueue('rec-1')
    const q2 = addToQueue('rec-2')
    updateQueueItem(q1, 'processing')
    updateQueueItem(q2, 'processing')

    expect(getIntegrityService().resetStuckTranscriptions()).toEqual({ found: 4, fixed: 4 })
    expect(recordingStatus('rec-1')).toBe('pending')
    expect(recordingStatus('rec-2')).toBe('pending')
    expect(queueStatus(q1)).toBe('pending')
    expect(queueStatus(q2)).toBe('pending')
  })
})
