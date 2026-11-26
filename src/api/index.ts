import { chunk, delay } from 'es-toolkit'
import Api from 'NeteaseCloudMusicApi'
import pmap from 'promise.map'
import { COOKIE_CONTENT } from '$auth/cookie'
import { baseDebug } from '$common'
import type { Album, DjradioProgram, LyricResponse, Playlist, SongData, SongPlayUrlInfo } from '$define'

const debug = baseDebug.extend('api:index')

type Id = string | number

/**
 * 分片处理
 * songData / songUrl 需要分片, id 太多报错
 * 分片处理，避免 id 太多一次请求报错
 */

export const BATCH_ID_SIZE = 200
export const BATCH_ID_CONCURRENCY = 4

const getApiBaseConfig = (): Api.RequestBaseConfig => {
  return { cookie: COOKIE_CONTENT }
}

/**
 * {
		"body": {
			"code": 406
			"message": "操作频繁，请稍候再试"
			"msg": "操作频繁，请稍候再试"
		}
		"cookie": []
		"status": 406
	}

	貌似只有 dj_program 有影响...
	先不包其他接口了
 */
export function handleRequestLimit<T extends (...args: any[]) => any>(fn: T, label: string) {
  return async function (...args: Parameters<T>) {
    let ret: ReturnType<T>

    const limitReached = (err: any) =>
      err &&
      typeof err === 'object' &&
      err.status === 406 &&
      err.body?.code === 406 &&
      /操作频繁/.test(err.body?.message || '')

    let wait = 1
    while (true) {
      let err: any

      try {
        ret = await fn(...args)
      } catch (e) {
        err = e
      }

      if (limitReached(err)) {
        debug('handleRequestLimit: 406-操作频繁 for %s, staring wait  %s seconds', label, wait)
        await delay(1000 * wait++)
        continue
      }

      if (err) {
        throw err
      } else {
        debug('handleRequestLimit: success for %s', label)
        return ret!
      }
    }
  }
}

/**
 * 歌单详情
 */

export async function playlistDetail(id: string) {
  const res = await Api.playlist_detail({ ...getApiBaseConfig(), id })
  const playlist = res.body.playlist as Playlist
  return playlist
}

/**
 * song 详情
 */

export async function songDetail(ids: Id[]) {
  const singleRequest = async (idsStr: string) => {
    const res = await Api.song_detail({ ...getApiBaseConfig(), ids: idsStr })
    const songDatas = res.body.songs as SongData[]
    return songDatas
  }

  // 500 首做一次 request
  const chunks = chunk(ids, BATCH_ID_SIZE)
  const songDatasArray = await pmap(
    chunks,
    (chunk) => {
      return singleRequest(chunk.join(','))
    },
    BATCH_ID_CONCURRENCY,
  )

  return songDatasArray.flat()
}

/**
 * song 播放地址
 */

export async function songUrl(ids: Id[], quality?: string | number) {
  const singleRequest = async (id: string) => {
    const res = await Api.song_url({ ...getApiBaseConfig(), id, br: quality })
    const infos = res.body.data as SongPlayUrlInfo[]
    return infos
  }

  const chunks = chunk(ids, BATCH_ID_SIZE)
  const infosArr = await pmap(chunks, (chunk) => singleRequest(chunk.join(',')), BATCH_ID_CONCURRENCY)
  return infosArr.flat()
}

/**
 * 歌词
 *
 * lv/tv/rv = -1 表示全部返回: 原词/翻译/罗马音, 体积很小
 * 无歌词时网易返回 uncollected: true, lrc.lyric = "[00:00.00]暂无歌词"
 * 网易偶发 502(read ECONNRESET), 歌词是尽力而为, 这里简单重试几次
 */
export async function songLyric(id: Id) {
  // 类型声明里只写了 { id }, 接口本身支持 lv/tv/rv
  type LyricQuery = Parameters<typeof Api.lyric>[0] & { lv?: number; tv?: number; rv?: number }
  const query: LyricQuery = {
    ...getApiBaseConfig(),
    id: String(id),
    lv: -1,
    tv: -1,
    rv: -1,
  }

  const RETRY_TIMES = 3
  let lastError: unknown

  for (let attempt = 1; attempt <= RETRY_TIMES; attempt++) {
    try {
      const res = await handleRequestLimit(Api.lyric, `lyric(${id})`)(query as Parameters<typeof Api.lyric>[0])
      return res.body as LyricResponse
    } catch (e) {
      lastError = e
      debug('songLyric(%s) failed, attempt %s/%s: %O', id, attempt, RETRY_TIMES, e)
      if (attempt < RETRY_TIMES) await delay(500 * attempt)
    }
  }

  throw lastError
}

/**
 * 专辑
 */

export async function album(id: Id) {
  const res = await Api.album({ ...getApiBaseConfig(), id })
  const album = res.body.album as Album
  const songs = res.body.songs as SongData[]
  return { album, songs }
}

/**
 * 电台
 */

export async function djradioPrograms(id: Id) {
  let hasMore = true
  const pagesize = 100
  let pagenum = 1
  let allPrograms: DjradioProgram[] = []

  do {
    const res = await handleRequestLimit(
      Api.dj_program,
      `dj_program(${pagenum})`,
    )({
      ...getApiBaseConfig(),
      rid: id,
      limit: pagesize,
      offset: (pagenum - 1) * pagesize,
      asc: 'false', // lastest published first
    })

    const programs = res.body.programs as DjradioProgram
    allPrograms = allPrograms.concat(programs)

    hasMore = res.body.more as boolean
    pagenum++
  } while (hasMore)

  return allPrograms
}
