
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const app = express();
app.use(cors());
app.use(express.json());

// ================= 配置区域 =================

// 1. 你的 IIS 虚拟目录对应的物理路径 (请根据实际情况修改!)
// 例如：你的照片在 D:\Photos，IIS 映射为 /media/，这里就填 D:\\Photos
const LOCAL_ROOT_PATH = "C:\\Users\\Administrator\\Desktop\\MyPhotos"; 

// 2. 你的 IIS 虚拟目录的前缀 (请根据实际情况修改!)
// 例如：http://localhost:8080/media/img_01.jpg -> 前缀是 /media/
const URL_PREFIX = "/media/";

// ===========================================

app.post('/api/delete', (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }

    try {
        console.log(`收到删除请求: ${url}`);

        // 1. 解析 URL 路径
        const parsedUrl = new URL(url);
        const urlPath = decodeURIComponent(parsedUrl.pathname); // e.g., /media/wedding/photo1.jpg

        // 2. 检查是否匹配前缀
        if (!urlPath.toLowerCase().startsWith(URL_PREFIX.toLowerCase())) {
            console.log(`忽略: 路径不匹配前缀 (${URL_PREFIX})`);
            return res.status(200).json({ message: 'Ignored (Remote or mismatched path)' });
        }

        // 3. 构建本地物理路径
        // 去掉前缀，剩下 "wedding/photo1.jpg"
        const relativePath = urlPath.substring(URL_PREFIX.length);
        // 拼接物理根路径 "D:\Photos" + "wedding/photo1.jpg"
        const fullPath = path.join(LOCAL_ROOT_PATH, relativePath);

        // 4. 执行删除
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            console.log(`成功删除文件: ${fullPath}`);
            return res.json({ success: true });
        } else {
            console.log(`文件不存在 (可能已被删除): ${fullPath}`);
            return res.status(404).json({ error: 'File not found locally' });
        }

    } catch (error) {
        console.error("删除出错:", error);
        return res.status(500).json({ error: error.message });
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`   本地文件管理助手已启动`);
    console.log(`   监听端口: ${PORT}`);
    console.log(`   物理路径: ${LOCAL_ROOT_PATH}`);
    console.log(`   URL 前缀: ${URL_PREFIX}`);
    console.log(`==================================================\n`);
});
