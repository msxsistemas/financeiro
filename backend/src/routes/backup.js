import { query } from '../db/index.js'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'

const execAsync = promisify(exec)
const BACKUP_DIR = process.env.BACKUP_DIR || '/var/www/financeiro/backups'
const BACKUP_RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '14')
const MAX_BACKUPS = parseInt(process.env.MAX_BACKUPS || '30')

export async function runBackup(type = 'auto') {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true })

  const filename = `backup_${new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').split('Z')[0]}.sql`
  const filepath = path.join(BACKUP_DIR, filename)

  // Validar que o filepath fica dentro do BACKUP_DIR (path traversal protection)
  const resolvedPath = path.resolve(filepath)
  if (!resolvedPath.startsWith(path.resolve(BACKUP_DIR))) {
    throw new Error('Path traversal detectado')
  }

  await execAsync(
    `docker exec financeiro_postgres pg_dump -U financeiro_user financeiro > "${filepath}"`
  )

  const stats = fs.statSync(filepath)

  await query(
    'INSERT INTO backups (filename, size_bytes, type) VALUES ($1, $2, $3)',
    [filename, stats.size, type]
  )

  // Rotação inteligente: manter backups recentes + limitar total
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.sql'))
    .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime() }))
    .sort((a, b) => b.time - a.time)

  const cutoffDate = Date.now() - (BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000)

  for (const file of files) {
    // Remover se: mais velho que retention days E excede o limite máximo
    const idx = files.indexOf(file)
    if (idx >= MAX_BACKUPS || (file.time < cutoffDate && idx >= 7)) {
      try {
        fs.unlinkSync(path.join(BACKUP_DIR, file.name))
        await query('DELETE FROM backups WHERE filename = $1', [file.name])
      } catch {}
    }
  }

  return filename
}

export default async function backupRoutes(app) {
  // Listar backups
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    if (request.user.role !== 'admin') return { backups: [] }

    const result = await query('SELECT * FROM backups ORDER BY created_at DESC')
    return {
      backups: result.rows.map(b => ({
        ...b,
        size_kb: b.size_bytes ? (b.size_bytes / 1024).toFixed(1) : null
      }))
    }
  })

  // Criar backup manualmente
  app.post('/run', { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'admin') return reply.code(403).send({ error: 'Acesso negado' })
    try {
      const filename = await runBackup('manual')
      return { message: 'Backup criado com sucesso', filename }
    } catch (err) {
      return reply.code(500).send({ error: `Erro ao criar backup: ${err.message}` })
    }
  })

  // Download de backup
  app.get('/download/:filename', { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'admin') return reply.code(403).send({ error: 'Acesso negado' })

    const filename = request.params.filename
    // Segurança: apenas arquivos .sql sem path traversal
    if (!filename.match(/^backup_[\w\-]+\.sql$/) || filename.includes('..')) {
      return reply.code(400).send({ error: 'Arquivo inválido' })
    }

    const filepath = path.resolve(path.join(BACKUP_DIR, filename))
    // Double-check: filepath deve estar dentro do BACKUP_DIR
    if (!filepath.startsWith(path.resolve(BACKUP_DIR))) {
      return reply.code(400).send({ error: 'Arquivo inválido' })
    }
    if (!fs.existsSync(filepath)) return reply.code(404).send({ error: 'Arquivo não encontrado' })

    reply.header('Content-Type', 'application/octet-stream')
    reply.header('Content-Disposition', `attachment; filename="${filename}"`)
    return reply.send(fs.createReadStream(filepath))
  })
}
