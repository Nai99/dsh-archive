// dsh-archive host —— 侧边栏归档切换按钮
// 路由:
//   POST /dsh-archive/restore  { sessionId } 恢复(取消归档)一个会话
//   POST /dsh-archive/delete   { sessionId } 删除一个归档会话(移入回收站目录)
// 静态资源:/dsh-archive/remixicon.css | /dsh-archive/remixicon.woff2(客户端图标字体,本地托管无 CDN)
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const inject = ['webServer', 'storageDomain', 'workspaceRegistry', 'sessionPersistence', 'agents']

const __dir = dirname(fileURLToPath(import.meta.url))
const MAX_BODY_BYTES = 65536
const SESSION_ID_RE = /^session-[0-9a-fA-F-]{8,}$/
/** 删除的会话移入的回收站目录(可手动找回) */
function trashRoot() {
  return join(process.env.DSH_HOME || process.env.USERPROFILE || process.env.HOME || '.', '.dsh', 'dsh-archive-trash')
}

let cached = null
async function getAssets() {
  if (cached) return cached
  const base = join(__dir, 'remixicon')
  const [css, woff2] = await Promise.all([
    readFile(join(base, 'remixicon.css'), 'utf8'),
    readFile(join(base, 'remixicon.woff2')),
  ])
  cached = { css, woff2 }
  return cached
}

function serve(body, type) {
  return async (req, res) => {
    try {
      const a = await getAssets()
      res.writeHead(200, { 'content-type': type, 'cache-control': 'public, max-age=86400' })
      res.end(a[body])
    } catch (e) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(String(e && e.message ? e.message : e))
    }
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > MAX_BODY_BYTES) {
        req.destroy()
        reject(new Error('request body too large'))
      }
    })
    req.on('end', () => {
      if (data.length === 0) return resolve({})
      try { resolve(JSON.parse(data)) } catch { reject(new Error('invalid JSON body')) }
    })
    req.on('error', reject)
  })
}

function respond(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) })
  res.end(body)
}

/**
* 取消归档(恢复):直接更新 workspace 存储域的 global(触发 host 广播,所有客户端
* 的归档集合即时更新),并同步 registry 内存缓存。与 dsh-delete-session 插件的
* unarchive 采用同一官方通道(archiveSession 之外没有取消归档 API)。
*/
async function unarchive(ctx, sessionId) {
  const workspace = ctx.storageDomain.get('workspace')
  if (workspace === void 0) throw new Error('workspace domain unavailable')
  const state = workspace.global.get()
  if (!state.archivedSessionIds.includes(sessionId)) return
  const next = { ...state, archivedSessionIds: state.archivedSessionIds.filter((id) => id !== sessionId) }
  await workspace.global.set(next)
  const registry = ctx.workspaceRegistry
  if (registry !== void 0 && 'state' in registry) registry.state = next
}

export function apply(ctx) {
  try {
    const webServer = ctx.get('webServer')
    if (!webServer) return
    webServer.register({ kind: 'exact', path: '/dsh-archive/remixicon.css', handler: serve('css', 'text/css; charset=utf-8') })
    webServer.register({ kind: 'exact', path: '/dsh-archive/remixicon.woff2', handler: serve('woff2', 'font/woff2') })
    webServer.register({ kind: 'exact', path: '/dsh-archive/restore', handler: async (req, res) => {
      try {
        const body = await readJsonBody(req)
        const id = typeof body.sessionId === 'string' && SESSION_ID_RE.test(body.sessionId) ? body.sessionId : null
        if (!id) return respond(res, 400, { ok: false, message: 'invalid-session-id' })
        await unarchive(ctx, id)
        respond(res, 200, { ok: true })
      } catch (e) {
        respond(res, 500, { ok: false, message: String(e && e.message ? e.message : e) })
      }
    } })
    webServer.register({ kind: 'exact', path: '/dsh-archive/delete', handler: async (req, res) => {
      try {
        const body = await readJsonBody(req)
        const id = typeof body.sessionId === 'string' && SESSION_ID_RE.test(body.sessionId) ? body.sessionId : null
        if (!id) return respond(res, 400, { ok: false, message: 'invalid-session-id' })
        const agent = ctx.agents.get(id)
        if (agent !== void 0 && agent.status === 'running') return respond(res, 409, { ok: false, message: 'session-running' })
        // 1) 归档(官方通道)
        try { await ctx.workspaceRegistry.archiveSession(id) } catch (e) { /* 已归档/不存在则忽略 */ }
        // 2) 从归档集合移除(删除即彻底清除归档标记)
        await unarchive(ctx, id)
        // 3) 持久化产物移入回收站目录
        const meta = (await ctx.sessionPersistence.list()).find((h) => h.id === id)
        if (meta && meta.origin !== 'subagent') {
          const location = ctx.sessionPersistence.locate(meta)
          if (location && location.path) {
            const original = dirname(location.path)
            if (existsSync(original)) {
              await mkdir(trashRoot(), { recursive: true })
              const target = join(trashRoot(), id)
              await rm(target, { recursive: true, force: true })
              await rename(original, target)
            }
          }
        }
        respond(res, 200, { ok: true })
      } catch (e) {
        respond(res, 500, { ok: false, message: String(e && e.message ? e.message : e) })
      }
    } })
  } catch (e) {
    console.error('dsh-archive registration failed: ' + String(e && e.message ? e.message : e))
  }
}
