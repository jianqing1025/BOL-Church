# Church 相册功能对齐 OurStoryHub — 设计文档

日期：2026-06-26
分支：dev
参考实现：`\\rev1005\Repo2\LibraryHub\OurStoryHub`（仅 Photo 部分，排除 Video / 本地导入 / Electron / Cloudinary）

## 目标
补齐 codex 移植版相册缺失/降级的功能，对齐参考版的 Photo 体验，并新增「上传人」记录与展示。

## 关键决策（已确认）
1. **图像处理放客户端 Canvas**：Worker 跑不了 sharp，所有 resize/缩略图/EXIF 在浏览器完成。
2. **上传人存数据库字段**（`uploader_name` 已存在）。
3. **缩略图在上传时由 canvas 生成**，单独存 R2，DB 记 `thumb_src`。
4. **5 个 slideshow 引擎全部忠实移植**（去 video）。

## 数据流
上传：UploadModal → `imageProcessing`(canvas: extractExif → resizeImage → makeThumbnail) → `api.uploadPhoto`(主图 blob + 缩略图 blob + width/height/sizeBytes + EXIF + uploaderName) → Worker 存 R2×2 + 写 1 行 DB → 返回 `ChurchPhoto`。
展示：列表用 `thumbSrc`（无则回退 `src`）；大图/slideshow 用原图 `src`；hover 读 `photo.exif + uploaderName`。

## 1. 后端
### 迁移 `photo-migrations/0002_exif_thumb_uploader.sql`
photos 表新增列：`shot_at TEXT, camera TEXT, lens TEXT, focal_length TEXT, aperture TEXT, shutter TEXT, iso INTEGER, thumb_object_key TEXT, thumb_src TEXT`。
（`uploader_name / width / height / size_bytes` 已存在，本次改为真正写入。）

### `server.ts handlePhotoUpload`
- 接收：`file`(已压缩主图)、`thumb`(缩略图，可选)、`width/height/sizeBytes`、`uploaderName`、EXIF 字段。
- 存主图与缩略图两个 R2 对象（`photos/...` 与 `photos/thumbs/...`），写入全部字段。
- 不再做服务端 resize。
- 缩略图读取走现有 `/api/photos/media/<key>` 路由（同 bucket）。

### API / 类型
- `api.uploadPhoto` payload 扩展：`thumb?, width?, height?, sizeBytes?, uploaderName?, exif?`。
- `updateOwnPhoto` / `adminUpdatePhoto` 允许编辑 `uploaderName`。
- `ChurchPhoto` 加：`thumbSrc?, shotAt?, exif?: { camera?, lens?, focalLength?, aperture?, shutter?, iso?, width?, height? }`。

### 兼容
老照片无缩略图/EXIF → 优雅降级（列表回退主图，hover 不显示 EXIF）。不做批量回填。

## 2. 前端模块（新建 `Church/components/photos/`、`Church/services/`、`Church/hooks/`）
- `services/imageProcessing.ts` — `extractExif(file)` / `resizeImage(file,{maxLongEdge,quality})` / `makeThumbnail(file,{longEdge,quality})`，canvas 含 EXIF 自动转正。
- `hooks/useBreakpoint.ts` — `<1024` 判 compact。
- `components/photos/PhotosPage.tsx` — 瘦容器（数据/状态/筛选/排序/选择/slideshow 编排）。
- `components/photos/PhotoToolbar.tsx` — 桌面 + compact 双工具栏 + 底部 Sheet（More / Album overflow）。
- `components/photos/PhotoGrid.tsx` — grid/masonry + 拖拽滑选 + 无限滚动。
- `components/photos/PhotoCard.tsx` + `components/photos/ExifOverlay.tsx` — hover 信息面板（含上传人）。
- `components/photos/UploadModal.tsx` — 文件 + 年份/相册 + **上传人输入** + **Resize 开关/最长边/JPEG 质量** + 逐文件进度 + 并发 3。
- `components/photos/Lightbox.tsx` — 大图：左右导航 + EXIF 面板 + 收藏 + 下载（用原图）。
- `components/photos/slideshows/`：`CascadeSlideshow`、`TilesShiftingSlideshow`、`SlidingTilesSlideshow`、`CinemaWingsSlideshow`、`FlowDriftSlideshow` + `SlideshowOverlay`（按 mode 分发，移除 video）。

排序新增 `shotAt`（拍摄时间），保留 `uploadedAt / sizeBytes / title`。
i18n：新增 key 走 `constants/translations.ts` + `useLocalization`。

## 3. 分阶段执行
1. 后端：迁移 + 上传管线 + API + 类型。
2. UploadModal（上传人 + resize 控件 + 进度）。
3. 拆分 PhotosPage + PhotoCard/ExifOverlay（hover 显示上传人）。
4. 移动端（breakpoint + compact 工具栏 + 底部 Sheet）。
5. 5 个 slideshow 引擎 + overlay。
6. P1 收尾：拖拽滑选、无限滚动、右键菜单、Lightbox 增强、缩略图接线。

每阶段独立提交，保持框架不变（上 Header / 下 Footer，仅 Photo section，无 Video）。

## 非目标（明确排除）
Video、本地文件导入、Electron、Cloudinary 专属变换、跨 App 启动器、Bucket/Cache 配置弹窗、老照片回填。
