/**
 * The transcription queue recovers from its own startup and from errors.
 *
 * Ported with upstream #41 (sgeraldes/hidock-next-2):
 *   - The boot task that repairs rows a crashed run left behind
 *     (startTranscriptionProcessor) can run while a recording is already being
 *     transcribed: a new recording kicks the queue before that task. The repair
 *     must leave the live lock and the in-flight row alone.
 *   - An error between two recordings used to leave the queue marked busy with
 *     nothing running, and every later tick returned early until a restart.
 *
 * The database is mocked with a small stateful queue so the service sees rows
 * change status the way the real table does.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type QueueRow = {
  id: string
  recording_id: string
  date_recorded: string | null
  created_at: string
  status: string
  error_message?: string
}

const queue = new Map<string, QueueRow>()

function readRows(status?: string): QueueRow[] {
  return [...queue.values()].filter((row) => row.status === status).map((row) => ({ ...row }))
}

function markRow(id?: string, status?: string, err?: string): void {
  const row = id ? queue.get(id) : undefined
  if (row && status) {
    row.status = status
    row.error_message = err
  }
}

const mockGetQueueItems = vi.fn(readRows)
const mockUpdateQueueItem = vi.fn(markRow)
const mockClearStaleTranscriptionLock = vi.fn()
const mockResetStuckTranscriptions = vi.fn()

vi.mock('../database', () => ({
  addToQueue: vi.fn(),
  getRecordingById: vi.fn(() => undefined), // transcription fails fast: recording not found
  resolveRecordingId: vi.fn(),
  updateRecordingTranscriptionStatus: vi.fn(),
  updateRecordingStatus: vi.fn(),
  insertTranscript: vi.fn(),
  getQueueItems: (status?: string) => mockGetQueueItems(status),
  updateQueueItem: (id?: string, status?: string, err?: string) => mockUpdateQueueItem(id, status, err),
  updateQueueProgress: vi.fn(),
  getMeetingById: vi.fn(),
  findCandidateMeetingsForRecording: vi.fn(() => []),
  addRecordingMeetingCandidate: vi.fn(),
  linkRecordingToMeeting: vi.fn(),
  updateKnowledgeCaptureTitle: vi.fn(),
  removeFromQueueByRecordingId: vi.fn(),
  cancelPendingTranscriptions: vi.fn(() => 0),
  run: vi.fn(),
  runInTransaction: vi.fn((fn: () => void) => fn()),
  saveDatabase: vi.fn(),
  queryOne: vi.fn(),
  queryAll: vi.fn(() => []),
  acquireTranscriptionLock: vi.fn(() => true),
  releaseTranscriptionLock: vi.fn(),
  clearStaleTranscriptionLock: () => mockClearStaleTranscriptionLock(),
  resetStuckTranscriptions: (...args: unknown[]) => mockResetStuckTranscriptions(...args),
  getActiveProcessingRunsForRecording: vi.fn(() => []),
  enrichRecordingScheduleMetadata: vi.fn(),
  createProcessingRun: vi.fn(({ stage }: { stage: string }) => ({ id: `run-${stage}` })),
  completeProcessingRun: vi.fn(),
  failProcessingRun: vi.fn()
}))

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }))
vi.mock('../activity-log', () => ({ emitActivityLog: vi.fn() }))
vi.mock('../config', () => ({ getConfig: vi.fn(() => ({ transcription: { provider: 'gemini', geminiApiKey: 'k' } })) }))
vi.mock('@google/generative-ai', () => ({ GoogleGenerativeAI: class {} }))
vi.mock('@hidock/transcription', () => ({ GeminiEngine: class {} }))
vi.mock('../vector-store', () => ({ getVectorStore: vi.fn(() => null) }))
vi.mock('../knowledge-capture-backfill', () => ({
  ensureKnowledgeCaptureForRecording: vi.fn(),
  ensureNoSpeechKnowledgeCapture: vi.fn()
}))

function enqueue(recordingId: string, dateRecorded: string): void {
  queue.set(`q_${recordingId}`, {
    id: `q_${recordingId}`,
    recording_id: recordingId,
    date_recorded: dateRecorded,
    created_at: '2026-09-24T00:00:00Z',
    status: 'pending'
  })
}

function movedToProcessing(queueItemId: string): boolean {
  return mockUpdateQueueItem.mock.calls.some((c) => c[0] === queueItemId && c[1] === 'processing')
}

type TranscriptionModule = typeof import('../transcription')
let transcription: TranscriptionModule

describe('transcription queue recovery', () => {
  beforeEach(async () => {
    // Fresh module state (busy flag, interval) for every test.
    vi.resetModules()
    queue.clear()
    mockGetQueueItems.mockReset()
    mockGetQueueItems.mockImplementation(readRows)
    mockUpdateQueueItem.mockReset()
    mockUpdateQueueItem.mockImplementation(markRow)
    mockClearStaleTranscriptionLock.mockClear()
    mockResetStuckTranscriptions.mockClear()
    transcription = await import('../transcription')
  })

  afterEach(() => {
    transcription.stopTranscriptionProcessor()
  })

  it('a boot repair that runs while a recording is being transcribed leaves that job alone', async () => {
    enqueue('rec-live', '2026-09-24T09:00:00Z')
    // The boot task runs while the recording is in flight: here, at the moment
    // the queue marks its row 'processing'.
    let bootRan = false
    mockUpdateQueueItem.mockImplementation((id, status, err) => {
      markRow(id, status, err)
      if (status === 'processing' && !bootRan) {
        bootRan = true
        transcription.startTranscriptionProcessor()
      }
    })

    await transcription.processQueueManually()

    expect(bootRan).toBe(true)
    // The live lock belongs to the run in flight.
    expect(mockClearStaleTranscriptionLock).not.toHaveBeenCalled()
    // The in-flight recording is exempt from the reset.
    expect(mockResetStuckTranscriptions).toHaveBeenCalledTimes(1)
    expect(mockResetStuckTranscriptions.mock.calls[0][0]).toBe('rec-live')
  })

  it('a boot repair with nothing in flight clears the stale lock and every stuck row', () => {
    transcription.startTranscriptionProcessor()

    expect(mockClearStaleTranscriptionLock).toHaveBeenCalledTimes(1)
    expect(mockResetStuckTranscriptions).toHaveBeenCalledTimes(1)
    // No recording is exempt.
    expect(mockResetStuckTranscriptions.mock.calls[0][0] ?? null).toBeNull()
  })

  it('a database error between two recordings does not leave the queue stuck', async () => {
    enqueue('rec-a', '2026-09-24T09:00:00Z') // newer: dequeued first
    enqueue('rec-b', '2026-09-23T09:00:00Z')
    // After rec-a's outcome is written, the next read of the waiting rows fails
    // once (a locked database), between the two recordings.
    let failNextPendingRead = false
    mockUpdateQueueItem.mockImplementation((id, status, err) => {
      markRow(id, status, err)
      if (id === 'q_rec-a' && status === 'failed') failNextPendingRead = true
    })
    mockGetQueueItems.mockImplementation((status) => {
      if (status === 'pending' && failNextPendingRead) {
        failNextPendingRead = false
        throw new Error('SQLITE_BUSY: database is locked')
      }
      return readRows(status)
    })

    await expect(transcription.processQueueManually()).rejects.toThrow('database is locked')
    expect(movedToProcessing('q_rec-a')).toBe(true)
    expect(movedToProcessing('q_rec-b')).toBe(false)

    // The database is fine again: the next tick picks up the recording that waited.
    await transcription.processQueueManually()
    expect(movedToProcessing('q_rec-b')).toBe(true)
  })
})
