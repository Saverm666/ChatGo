export interface OpenEditorPayload {
  editingPromptId: string
  promptName: string
  promptContent: string
  promptCategory: string
  promptTagsInput: string
}

type EditorListener = (payload: OpenEditorPayload | null) => void
const listeners = new Set<EditorListener>()

export const editorBridge = {
  open(payload: OpenEditorPayload) {
    listeners.forEach((fn) => fn(payload))
  },
  close() {
    listeners.forEach((fn) => fn(null))
  },
  on(fn: EditorListener) {
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  }
}
