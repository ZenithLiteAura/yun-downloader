# 更新记录

## 2026-11-26

- feat: 新增 `-l, --lyric`，下载音频时一并下载网易云官方歌词为同名 `.lrc`
  - 首行写 `[by:ZenithLiteAura]`
  - 原词 / 译文按时间轴交错（`[mm:ss.xx]`），无译文只写原词
  - 已存在且非空的 `.lrc` 默认跳过，`--skip false` 覆盖
- feat: 新增 `songLyric` 接口封装（406 退避、502 重试）
- feat: ink 进度界面新增「获取歌词中」阶段与完成行歌词状态
- feat: `Song` 模型补充 `id`
- test: 新增歌词格式化单测与网络集成测试
- docs: README 补充歌词用法与示例
