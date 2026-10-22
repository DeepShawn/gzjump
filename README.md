# 果子跳跳（GZJump）

一个轻量的 HTML5 跳跃小游戏，支持触屏、鼠标和键盘。项目已接入 Supabase 成绩系统、账号认证、云端榜单和管理员审核。

## 在线地址

- 游戏：https://deepshawn.github.io/gzjump/
- 新玩法「果子搭路」：https://deepshawn.github.io/gzjump/bridge.html
- 管理员：https://deepshawn.github.io/gzjump/admin.html
- Android WebView APK：[下载](https://raw.githubusercontent.com/DeepShawn/gzjump/main/android/gzjump-webview-release.apk)

## 功能

- 游客模式直接游玩，邮箱密码和魔法链接登录。
- 已验证邮箱的登录用户通过服务器对局回放校验后自动进榜；游客的有效对局进入管理员审核队列。
- 跨过至少一块平台落地时，本次基础积分翻倍。
- 开启新手瞄准时禁止上传成绩，规则由服务端再次校验。
- 服务器开局凭证、随机种子、逐步操作回放、原子结算及数据库持久限流；两款游戏共用同一套可重放规则。
- 同一用户使用不可逆身份哈希归并历史成绩，不保存原始 IP。
- 24 小时内三局已确认的回放得分篡改，会暂时封禁对应账号和设备；高分、长局、网络错误和旧版客户端不会计为作弊。共享 IP 只限流，避免误封同一 Wi-Fi 下的玩家。
- 公共榜单只提供昵称、分数、跳数、水果、模式、日期、记录时间；原始成绩和内部身份字段仅管理员可读。
- `admin.html` 提供登录、审核、拒绝、删除和风险查看。
- 「果子跳跳」支持经典、每日挑战、地狱模式和神话模式（难度 ×200–×1000）；落水会播放完整的失衡、旋转、下坠和水花动画。
- 「果子搭路」为同系列 2D 搭路玩法：长按伸长木板，松手落桥，果子自动走过当前坑，并提前显示下一块和下下块路面；支持无尽模式、每日挑战、地狱模式、神话模式（难度 ×200–×1000）、Beta UI、四种时间主题和云端成绩上传。坠坑会播放翻转下落动画。
- 前 300 分保持稳定节奏，之后平台距离和尺寸逐步增加难度；平台支持升起、下沉和动态水面效果。
- 设置中的 Beta 版 UI 默认关闭，开启后提供更精细的水面光效、平台动画和界面动效，会增加耗能。

## Supabase 配置

项目使用 `supabase/migrations/` 中的迁移和 `supabase/functions/gzjump-submit/` Edge Function。前端只使用公开 publishable/anon key，service role key 不进入仓库。

管理员白名单邮箱：`2153654562@qq.com`。首次使用管理员页面时注册并完成邮箱验证。

安全机制、验证范围和已知边界见 [SECURITY.md](SECURITY.md)。更新后需要刷新游戏重新开局；离线游玩只保存本地纪录。

## 本地检查

```bash
npm install
npm test
npm run build
```

## Android

Android 壳应用位于 `android/`，包名为 `com.deepshawn.gzjump`，最低 API 31，目标 API 35。签名 keystore 不提交到仓库。
