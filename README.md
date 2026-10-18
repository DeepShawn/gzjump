# 果子跳跳（GZJump）

一个轻量的 HTML5 跳跃小游戏，支持触屏、鼠标和键盘。项目已接入 Supabase 成绩系统、账号认证、云端榜单和管理员审核。

## 在线地址

- 游戏：https://deepshawn.github.io/gzjump/
- 新玩法「果子搭路」：https://deepshawn.github.io/gzjump/bridge.html
- 管理员：https://deepshawn.github.io/gzjump/admin.html
- Android WebView APK：[下载](https://raw.githubusercontent.com/DeepShawn/gzjump/main/android/gzjump-webview-release.apk)

## 功能

- 游客模式直接游玩，邮箱密码和魔法链接登录。
- 登录用户完成对局后自动上传并自动审核；游客成绩点击上传后进入管理员审核队列。
- 跨过至少一块平台落地时，本次基础积分翻倍。
- 开启新手瞄准时禁止上传成绩，规则由服务端再次校验。
- 成绩数值校验、重复提交防护、限流和风险标记。
- 同一用户使用不可逆身份哈希归并历史成绩，不保存原始 IP。
- 连续三次高风险提交自动封禁；管理员可以查看风险标记并手动封禁设备。
- `admin.html` 提供登录、审核、拒绝、删除和风险查看。
- 「果子跳跳」支持经典、每日挑战、地狱模式和神话模式（难度 ×200–×1000）；落水会播放完整的失衡、旋转、下坠和水花动画。
- 「果子搭路」为同系列 2D 搭路玩法：长按伸长木板，松手落桥，果子自动走过当前坑，并提前显示下一块和下下块路面；支持无尽模式、每日挑战、地狱模式、神话模式（难度 ×200–×1000）、Beta UI、四种时间主题和云端成绩上传。坠坑会播放翻转下落动画。
- 前 300 分保持稳定节奏，之后平台距离和尺寸逐步增加难度；平台支持升起、下沉和动态水面效果。
- 设置中的 Beta 版 UI 默认关闭，开启后提供更精细的水面光效、平台动画和界面动效，会增加耗能。

## Supabase 配置

项目使用 `supabase/migrations/` 中的迁移和 `supabase/functions/gzjump-submit/` Edge Function。前端只使用公开 publishable/anon key，service role key 不进入仓库。

管理员白名单邮箱：`2153654562@qq.com`。首次使用管理员页面时注册并完成邮箱验证。

## 本地检查

```bash
npm install
npm test
npm run build
```

## Android

Android 壳应用位于 `android/`，包名为 `com.deepshawn.gzjump`，最低 API 31，目标 API 35。签名 keystore 不提交到仓库。
