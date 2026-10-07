import { configureEngine, validate } from 'epubcheck-standalone'
import { blob as blobSource } from 'epubcheck-standalone/plugins'
import engineUrl from 'epubcheck-standalone/epubcheck-engine.js?url'

configureEngine({ url: engineUrl })

self.addEventListener('message', async (event) => {
  const { id, file, name } = event.data || {}
  if (!id || !(file instanceof Blob)) return
  try {
    const result = await validate(blobSource(file), {
      name: name || 'book.epub',
      maxOfEachMessage: 50,
      timeoutMs: 120000,
    })
    self.postMessage({
      id,
      result: {
        valid: result.valid,
        summary: result.summary,
        messages: result.messages.map(({ id: code, severity, message, suggestion, path, line, column }) => ({ code, severity, message, suggestion, path, line, column })),
      },
    })
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
  }
})
