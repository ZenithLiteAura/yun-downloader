// 网易云歌词接口(/api/song/lyric)返回结构
// 实测: https://music.163.com/api/song/lyric?id=347230&lv=-1&tv=-1&rv=-1

export interface LyricContainer {
  version?: number
  lyric?: string
}

export interface LyricResponse {
  // 无歌词(纯音乐等)
  nolyric?: boolean

  // 无效 id / 未收录时网易会返回 true, 同时 lrc.lyric 变成 "[00:00.00]暂无歌词"
  uncollected?: boolean
  needDesc?: boolean

  sgc?: boolean
  sfy?: boolean
  qfy?: boolean

  // 原词
  lrc?: LyricContainer

  // 逐字歌词
  klyric?: LyricContainer

  // 翻译
  tlyric?: LyricContainer

  // 罗马音
  romalrc?: LyricContainer

  code?: number
}