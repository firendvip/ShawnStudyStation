# 小善拼拼 · 错字拼音练习(演示版)

记录孩子写错的字 → 实时转带声调拼音 → 每个词按规则排到对应日期书写 → 拼音测验(可查看答案)→ 选日期范围生成可打印的 PDF。

## 四个标签页

1. **录入**:输入写错的字/词(实时转拼音),点「添加」存入今天;同一天重复提示「已重复」。
2. **今日拼拼**:今天该书写的词(拼音在上、字词在下、默认隐藏)。左上「共 N 词」,右上「查看答案」(密码 **1234**)。
3. **周拼拼**:同样的测验形式,顶部可选任意日期,查看那一天该书写的内容。
4. **打印**:选日期范围 + 排版(列数 / 拼音字号 / 页边距 / 序号 / 写字空位)→ 生成 PDF,页内预览并下载打印。

> 右上角显示「日期 星期」与「⚙ 设置」。

## 书写调度:每个词写两次

- **第一次**:录入的**次日**书写(今天录入 → 明天写)。
- **第二次**:**按周 ÷7 分摊**。从「周期起始日」起每 7 天为一个录入周期,该周期录入的词(先录先写)总数 ÷7,分摊到下一个 7 天每天书写,余数靠前。
- 某天该书写的 = 「前一天录入的」+「分摊到当天的」(按 id 去重)。

## 设置

- **周期起始日**(影响 ÷7 分摊)。
- **拼音字号 / 答案字号**(屏幕显示用)。
- 生成 PDF 为**手动**:在「打印」页选日期范围生成;没有自动定时。

## 演示版范围

- **暂不含登录**;下一步:手机号 + 短信验证码登录 + 云端账号。
- PDF 由服务端用系统 CJK 字体生成;只输出拼音(不含答案字词)。
- 「查看答案」密码为前端软门禁(字词随数据下发、仅界面隐藏),演示足够;接入登录后可改为后端硬门禁。
- 浏览器原生打印对话框为系统英文界面、无法汉化;本应用改为「页内中文排版设置 + 服务端生成 PDF + 内嵌预览/下载」,规避该对话框。

## 本地开发

```bash
npm install
npx prisma migrate dev      # 初始化 SQLite
npm run dev                 # http://localhost:3000
node scripts/seed.mjs       # 可选:灌入演示数据
```

`npm test` 单元测试 · `npm run build` 生产构建。

## 技术栈

Next.js(App Router)+ React + TypeScript · pinyin-pro(浏览器端实时转换)· Prisma + SQLite · zod 校验 · pdfkit(服务端 PDF)· vitest。

## 关键模块

- 分摊引擎:`lib/practice.ts`(`dayCounts` / `sliceForDay` 纯函数有测试;`getPracticeForDate` 合并两次书写)。
- 录入:`/api/entries`、`lib/entries.ts`(同日去重、可改可删)。
- 书写批次:`/api/practice`(?date 或 ?from&to)。
- 设置:`/api/settings`、`lib/settings.ts`(起始日 + 字号)。
- 打印:`lib/pdf.ts`(列数/字号/边距可调)、`lib/reports.ts`、`/api/reports`、`components/print/PrintPanel.tsx`。

### PDF 字体
默认 macOS `Arial Unicode.ttf`;Linux 生产请设 `PDF_FONT_PATH` 指向打包的 Noto Sans SC。`pdfkit` 已在 `next.config.ts` 的 `serverExternalPackages` 声明。

## 部署(后续)
国内轻量服务器 + 域名 + ICP 备案 → Node 常驻(PM2)+ Nginx + HTTPS;接入手机号短信登录与账号,Entry 增加 userId;数据量大后迁移到 PostgreSQL。
