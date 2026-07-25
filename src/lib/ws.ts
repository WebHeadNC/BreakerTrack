import type { Project } from '../types'

type ServerMessage =
  | { type: 'project'; project: Project }
  | { type: 'project-deleted'; id: string }

interface Handlers {
  onProject: (project: Project) => void
  onProjectDeleted: (id: string) => void
}

/** Opens a self-reconnecting WebSocket that pushes project changes from any client. */
export function connectWebSocket(handlers: Handlers): void {
  let retryDelay = 1000

  function connect() {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${location.host}/ws`)

    ws.onopen = () => {
      retryDelay = 1000
    }

    ws.onmessage = (ev) => {
      let msg: ServerMessage
      try {
        msg = JSON.parse(ev.data)
      } catch {
        return
      }
      if (msg.type === 'project') handlers.onProject(msg.project)
      else if (msg.type === 'project-deleted') handlers.onProjectDeleted(msg.id)
    }

    ws.onclose = () => {
      setTimeout(connect, retryDelay)
      retryDelay = Math.min(retryDelay * 1.5, 15000)
    }

    ws.onerror = () => ws.close()
  }

  connect()
}
