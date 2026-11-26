import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { LyricResponse } from '../src/define'
import { extractLyricText, formatLyric, getLyricFile, LYRIC_AUTHOR } from '../src/lyric'

describe('lyric', function () {
  it('getLyricFile: 同目录同名, 后缀换成 .lrc', () => {
    expect(getLyricFile(join('a', 'b', '歌手 - 歌名.mp3'))).toEqual(join('a', 'b', '歌手 - 歌名.lrc'))
    expect(getLyricFile(join('a', 'no-ext'))).toEqual(join('a', 'no-ext.lrc'))
    // 试听文件
    expect(getLyricFile(join('a', '歌手 - 歌名 [试听].m4a'))).toEqual(join('a', '歌手 - 歌名 [试听].lrc'))
  })

  it('formatLyric: 原词 + 翻译按时间轴交错, 首行是作者', () => {
    const body: LyricResponse = {
      code: 200,
      lrc: {
        version: 1,
        lyric: [
          '[00:00.000] 作曲 : Ayase',
          '[00:00.460]I leap out of the same routine I am living day by day',
          '[00:17.430]',
          '[00:23.810]Greenery, shining view',
        ].join('\n'),
      },
      tlyric: {
        version: 1,
        lyric: ['[00:00.460]我跳出日复一日的日程', '[00:23.810]绿意盎然 风景优美'].join('\n'),
      },
    }

    expect(formatLyric(body)).to.equal(
      [
        `[by:${LYRIC_AUTHOR}]`,
        '[00:00.00]作曲 : Ayase',
        '[00:00.46]I leap out of the same routine I am living day by day',
        '[00:00.46]我跳出日复一日的日程',
        '[00:17.43]',
        '[00:23.81]Greenery, shining view',
        '[00:23.81]绿意盎然 风景优美',
      ].join('\n'),
    )
  })

  it('formatLyric: 只有原词时也能用', () => {
    const body: LyricResponse = {
      code: 200,
      lrc: { version: 1, lyric: '[00:00.00]原谅我这一生不羁放纵爱自由\n[00:10.00]也会怕有一天会跌倒' },
    }

    expect(formatLyric(body)).to.equal(
      [`[by:${LYRIC_AUTHOR}]`, '[00:00.00]原谅我这一生不羁放纵爱自由', '[00:10.00]也会怕有一天会跌倒'].join('\n'),
    )
  })

  it('formatLyric: 丢弃源文件自带的 [by:xxx], 只保留我们的', () => {
    const body: LyricResponse = {
      code: 200,
      lrc: { version: 1, lyric: '[by:别人]\n[ti:某首歌]\n[00:01.00]hello' },
    }

    expect(formatLyric(body)).to.equal([`[by:${LYRIC_AUTHOR}]`, '[00:01.00]hello'].join('\n'))
  })

  it('formatLyric: 毫秒时间轴向下取整到厘秒', () => {
    const body: LyricResponse = {
      code: 200,
      lrc: { version: 1, lyric: '[00:25.237]这一路上走走停停\n[01:03.999]接近一分钟' },
    }

    expect(formatLyric(body)).to.equal(
      [`[by:${LYRIC_AUTHOR}]`, '[00:25.24]这一路上走走停停', '[01:04.00]接近一分钟'].join('\n'),
    )
  })

  it('formatLyric: 翻译时间轴对不上时不强行贴', () => {
    const body: LyricResponse = {
      code: 200,
      lrc: { version: 1, lyric: '[00:16.240]We were both young when I first saw you' },
      tlyric: { version: 1, lyric: '[00:17.100]第一次见到你的时候我们都还很年轻' },
    }

    expect(formatLyric(body)).to.equal(
      [`[by:${LYRIC_AUTHOR}]`, '[00:16.24]We were both young when I first saw you'].join('\n'),
    )
  })

  it('formatLyric: 翻译只有空占位时只写原词', () => {
    const body: LyricResponse = {
      code: 200,
      lrc: { version: 1, lyric: '[00:28.950]故事的小黄花\n[00:32.380]从出生那年就飘着' },
      // 网易有些歌的 tlyric 只有时间轴没有文本
      tlyric: { version: 1, lyric: '[00:32.380]\n[00:35.870]' },
    }

    expect(formatLyric(body)).to.equal(
      [`[by:${LYRIC_AUTHOR}]`, '[00:28.95]故事的小黄花', '[00:32.38]从出生那年就飘着'].join('\n'),
    )
  })

  it('formatLyric: 无歌词返回 undefined', () => {
    expect(formatLyric(undefined)).toBeUndefined()
    expect(formatLyric({})).toBeUndefined()
    expect(formatLyric({ lrc: { lyric: '   \n' } })).toBeUndefined()

    // 纯音乐
    expect(formatLyric({ nolyric: true, lrc: { lyric: '[00:00.00]暂无歌词' } })).toBeUndefined()

    // 无效 id / 未收录: 网易返回 uncollected + "[00:00.00]暂无歌词"
    expect(formatLyric({ uncollected: true, lrc: { lyric: '[00:00.00]暂无歌词' } })).toBeUndefined()
    expect(formatLyric({ lrc: { lyric: '[00:00.000]暂无歌词' } })).toBeUndefined()

    // 只有元信息, 没有时间轴
    expect(formatLyric({ lrc: { lyric: '[by:某人]\n[ti:某首歌]' } })).toBeUndefined()
  })

  it('extractLyricText: 原词原样返回', () => {
    expect(
      extractLyricText({ lrc: { lyric: '[00:00.000] 作词 : 黄家驹\n[00:25.237]这一路上走走停停\n' } }),
    ).to.equal('[00:00.000] 作词 : 黄家驹\n[00:25.237]这一路上走走停停')
  })
})