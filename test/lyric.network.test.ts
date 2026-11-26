import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Song } from '../src/define'
import { LYRIC_AUTHOR, saveSongLyric } from '../src/lyric'

// 需要真实网络, 默认跳过 (CI 不受影响)
// 本地手动跑: RUN_NETWORK_TEST=1 pnpm vitest run test/lyric.network.test.ts
const runNetworkTest = Boolean(process.env.RUN_NETWORK_TEST)

function makeSong(patch: Partial<Song>): Song {
  return {
    singer: '',
    songName: '',
    albumName: '',
    index: '01',
    rawIndex: 0,
    ...patch,
  }
}

describe.skipIf(!runNetworkTest)('lyric (network)', function () {
  let dir: string

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'yun-lyric-'))
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('下载真实歌词 / 已存在时跳过', async () => {
    // https://music.163.com/#/song?id=347230 Beyond - 海阔天空
    const song = makeSong({ id: 347230, singer: 'Beyond', songName: '海阔天空' })
    const file = join(dir, 'Beyond - 海阔天空.mp3')

    const result = await saveSongLyric({ song, file, skipExists: true })
    expect(result.status).to.equal('saved')
    expect(result.file).to.equal(join(dir, 'Beyond - 海阔天空.lrc'))

    const content = readFileSync(result.file, 'utf8')
    const lines = content.trimEnd().split('\n')
    expect(lines[0]).to.equal(`[by:${LYRIC_AUTHOR}]`)
    expect(content).toContain('作词')
    expect(lines.some((x) => /^\[\d{2}:\d{2}\.\d{2}\]/.test(x))).to.equal(true)

    // 第二次: 跳过
    const again = await saveSongLyric({ song, file, skipExists: true })
    expect(again.status).to.equal('skipped')

    // skipExists = false: 覆盖重写
    const overwrite = await saveSongLyric({ song, file, skipExists: false })
    expect(overwrite.status).to.equal('saved')
  }, 60000)

  it('无歌词歌曲返回 empty', async () => {
    const song = makeSong({ id: 1, singer: '', songName: 'nothing' })
    const file = join(dir, 'nothing.mp3')
    const result = await saveSongLyric({ song, file, skipExists: true })
    expect(result.status).to.equal('empty')
  }, 60000)
})