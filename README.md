# 果子跳跳（GZJump）

一个轻量的 HTML5 跳跃小游戏，支持触屏、鼠标和键盘。项目已接入 Supabase 成绩系统、账号认证、云端榜单和管理员审核。

## 在线地址

- 游戏：https://deepshawn.github.io/gzjump/
- 管理员：https://deepshawn.github.io/gzjump/admin.html
- Android WebView APK：[下载](https://raw.githubusercontent.com/DeepShawn/gzjump/main/android/gzjump-webview-release.apk)

## 功能

- 游客模式直接游玩，邮箱密码和魔法链接登录。
- 登录用户成绩自动审核；游客成绩进入管理员审核队列。
- 开启新手瞄准时禁止上传成绩，规则由服务端再次校验。
- 成绩数值校验、重复提交防护、限流和风险标记。
- 同一用户使用不可逆身份哈希归并历史成绩，不保存原始 IP。
- 连续三次高风险提交自动封禁；管理员可以查看风险标记并手动封禁设备。
- `admin.html` 提供登录、审核、拒绝、删除和风险查看。

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
