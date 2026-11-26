import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { songLyric } from '$api'
import { baseDebug } from '$common'
import type { LyricResponse, Song } from '$define'

const debug = baseDebug.extend('lyric')

/**
 * 歌词文件作者 tag
 * e.g. [by:ZenithLiteAura]
 * 放在 lrc 第一行
 */
export const LYRIC_AUTHOR = 'ZenithLiteAura'

export type LyricStatus =
  // 已保存
  | 'saved'
  // 文件已存在, 跳过
  | 'skipped'
  // 歌曲无歌词
  | 'empty'
  // 请求/写文件失败
  | 'failed'

export interface LyricResult {
  status: LyricStatus
  // 歌词文件路径
  file: string
  error?: unknown
}

/**
 * 音频文件 -> 歌词文件: 同目录同名, 后缀换成 .lrc
 * e.g. `歌单/a - b.mp3` -> `歌单/a - b.lrc`
 */
export function getLyricFile(audioFile: string): string {
  const dir = dirname(audioFile)
  const ext = extname(audioFile)
  const base = basename(audioFile, ext)
  return join(dir, `${base}.lrc`)
}

/**
 * 网易只会返回一行占位歌词, 视为无歌词
 * e.g. "[00:00.00]暂无歌词"
 */
const NO_LYRIC_LINE = /^\[[^\]]*\]\s*暂无歌词$/

/**
 * 时间轴行: [mm:ss] / [mm:ss.xx] / [mm:ss.xxx]
 */
const TIME_LINE_REG = /^\s*\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]\s*(.*)$/

/**
 * 非时间轴行: [by:xxx] [ti:xxx] [ar:xxx] [offset:xxx] ...
 */
const META_LINE_REG = /^\s*\[(by|ti|ar|al|au|offset|kana|length|re|ve|tool|encoding)\s*:[^\]]*\]\s*$/i

interface LyricLine {
  // 时间轴, 单位: 厘秒(10ms)
  time: number
  // 该时间轴的文本, 可能是空串(间奏)
  text: string
}

/**
 * 从接口响应中取出原词文本, 取不到(无歌词/纯音乐/无效id)返回 undefined
 */
export function extractLyricText(body?: LyricResponse): string | undefined {
  if (!body) return undefined
  if (body.nolyric || body.uncollected) return undefined

  const lyric = body.lrc?.lyric?.trim()
  if (!lyric) return undefined
  if (NO_LYRIC_LINE.test(lyric)) return undefined

  return lyric
}

function parseTimeLine(raw: string): LyricLine | undefined {
  const matched = raw.match(TIME_LINE_REG)
  if (!matched) return undefined

  const [, mm, ss, frac, text] = matched
  const cs = Number(mm) * 6000 + Number(ss) * 100 + Math.round((frac ? Number(`0.${frac}`) : 0) * 100)
  return { time: cs, text: text.trim() }
}

function parseLyricLines(lyric: string | undefined): LyricLine[] {
  if (!lyric) return []

  const lines: LyricLine[] = []
  for (const raw of lyric.split(/\r?\n/)) {
    if (!raw.trim()) continue
    if (META_LINE_REG.test(raw)) continue

    const line = parseTimeLine(raw)
    if (line) lines.push(line)
  }
  return lines
}

/**
 * 时间轴统一成 [mm:ss.xx], 文本前不加空格
 * e.g. `[00:00.46]I leap out of the same routine`
 */
function formatTimeLine({ time, text }: LyricLine): string {
  const m = Math.floor(time / 6000)
  const s = Math.floor((time % 6000) / 100)
  const cs = time % 100
  const stamp = `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}]`
  return text ? `${stamp}${text}` : stamp
}

/**
 * 生成 lrc 内容
 *
 * - 第一行是作者: `[by:ZenithLiteAura]`
 * - 原词 + 翻译(如果有) 按时间轴交错: 同一时间戳先原词, 紧跟一行翻译
 * - 没有翻译就只写原词, 不写占位
 * - 空时间轴(间奏)保留
 *
 * e.g.
 * [by:ZenithLiteAura]
 * [00:00.46]I leap out of the same routine I'm living day by day
 * [00:00.46]我跳出日复一日的日程
 */
export function formatLyric(body?: LyricResponse): string | undefined {
  if (!extractLyricText(body)) return undefined

  const origin = parseLyricLines(body!.lrc?.lyric)
  if (!origin.length) return undefined

  // 翻译: 时间轴 -> 文本, 同时间轴只取第一条
  // 实测网易翻译行时间轴与原文完全一致, 对不上的行直接忽略(不乱贴)
  const translation = new Map<number, string>()
  for (const line of parseLyricLines(body!.tlyric?.lyric)) {
    if (!line.text) continue
    if (!translation.has(line.time)) translation.set(line.time, line.text)
  }

  const out: string[] = [`[by:${LYRIC_AUTHOR}]`]
  for (const line of origin) {
    out.push(formatTimeLine(line))

    // 间奏/空行: 不挂翻译
    if (!line.text) continue

    const translated = translation.get(line.time)
    if (translated) {
      out.push(formatTimeLine({ time: line.time, text: translated }))
      // 同一时间轴的原词有多行时, 翻译只跟第一行
      translation.delete(line.time)
    }
  }

  return out.join('\n')
}

function isNonEmptyFile(file: string) {
  try {
    return existsSync(file) && statSync(file).size > 0
  } catch {
    return false
  }
}

/**
 * 获取并保存一首歌的歌词
 *
 * - 已存在且非空 && skipExists -> skipped, 不发请求
 * - 无歌词 -> empty
 * - 请求/写文件失败 -> failed (不抛出, 不影响其它歌曲)
 */
export async function saveSongLyric(options: {
  song: Song
  // 音频文件路径
  file: string
  skipExists: boolean
}): Promise<LyricResult> {
  const { song, file, skipExists } = options
  const lyricFile = getLyricFile(file)

  const id = song.id ?? song.raw?.id
  if (!id) {
    debug('no song id for lyric: %j', { singer: song.singer, songName: song.songName })
    return { status: 'failed', file: lyricFile, error: new Error('song.id is required to get lyric') }
  }

  if (skipExists && isNonEmptyFile(lyricFile)) {
    return { status: 'skipped', file: lyricFile }
  }

  try {
    const body = await songLyric(id)
    const content = formatLyric(body)
    if (!content) {
      return { status: 'empty', file: lyricFile }
    }

    mkdirSync(dirname(lyricFile), { recursive: true })
    writeFileSync(lyricFile, `${content}\n`, 'utf8')
    debug('lyric saved: %s', lyricFile)
    return { status: 'saved', file: lyricFile }
  } catch (e) {
    debug('lyric failed for %s: %O', lyricFile, e)
    return { status: 'failed', file: lyricFile, error: e }
  }
}